# Performance Scaling Plan

Goal: run thousands of cars at `simSpeed=100×` smoothly on low-end devices
(mobile, old laptops, Chromebooks).

## Context — what's already landed

These shipped in the "perf round 1" work and should be measured before any
of the ideas below are pursued:

- **Perf HUD** (`?perf=1`) — rolling ms/frame split across sim/draw/rAF +
  physics-steps per rAF. The measurement substrate for everything else.
- **Dead-car early return** — damaged AI cars skip sensor raycasts + NN
  inference. Typically kills >50% of late-generation sim cost.
- **Spatial grid over borders + checkpoints** (`spatialGrid.js`) —
  broad-phase cull for sensor raycasts, damage, and checkpoint tests. The
  sensor's `Math.min(...offsets)` spread was also removed; nearest-hit is
  tracked inline.
- **Top-K + swarm scatter render** (`?topK=N`, `?fullRender=1`) — draw the
  top-K cars by fitness as full quads, batch the rest as a single-fill dot
  scatter. `?fullRender=1` restores the legacy per-car path for A/B.

## Deferred ideas — ranked by expected payoff

### 1. Web Worker sim + OffscreenCanvas render

**Motivation.** The main thread currently does physics, sensors, NN, and
render. On a dual-core phone this means UI (scrolling, buttons) fights the
sim loop for the same core. Moving sim to a worker + rendering via
`OffscreenCanvas` isolates each concern onto its own core.

**Approach.**
1. Serialise track geometry + car state into `Float32Array`s.
2. Spawn worker with `sim.worker.js`; post `postMessage` with transferables.
3. Worker runs `update()` loop, posts pose buffer back each render tick.
4. Main thread does only render (or also moves render to the worker via
   `canvas.transferControlToOffscreen()`).

**Expected payoff.** 1.5–2× effective throughput on multi-core, plus a
non-janky UI (biggest user-perceived win on mobile).

**Risks.**
- `invincible`, `traction`, `maxSpeed`, `brain` are all main-thread globals
  consumed inside `Car#update`. Requires a structured config handshake.
- The ruvector bridge + `window.__rvDynamics.recordFrame` run per-step on
  the best car; those need to be either (a) moved to the worker as a
  bridge of their own, or (b) batched and posted back.
- Brains are `NeuralNetwork` class instances; serialisation exists
  (`brainCodec.unflatten`) so this is tractable.

### 2. Batched NN forward pass

**Motivation.** Every car calls `NeuralNetwork.feedForward` separately —
a small tight JS loop per car means poor instruction cache utilisation
and per-call overhead.

**Approach.** Pack all cars' inputs into one `Float32Array`, weights into
`Float32Array` per layer. One matmul across the full batch per layer.
Plain-JS typed-array matmul is already ~3–5× faster than `Array<number>`
in tight loops due to JIT hoisting + no boxing.

**Stretch.** WebGPU compute shader — 10k+ cars at 60fps feasible. Requires
shader plumbing and a fallback, so gated on whether we actually hit the
need.

**Expected payoff.** 2–3× for the NN bucket specifically. Unknown overall
impact until the HUD shows NN dominating; may be a small win if sensors
are still dominant.

**Risks.** Mutation + per-car brain divergence means we can't share
weights across cars — each batch matmul is `[N, inSize] × [N, inSize, outSize]`
which is not a standard matmul. Needs custom `for` loop. Still wins
vs. current N separate matmuls.

### 3. Coarse-collision mode at high simSpeed

**Motivation.** At `simSpeed=100×` we run 100 physics steps per rAF with
full `polysIntersect` every step. Sub-pixel precision is wasted when the
user can't see intermediate frames anyway.

**Approach.** When `simSpeed > 5`:
- Replace `polysIntersect(poly, border)` with swept-AABB vs. border-AABB
  from the grid.
- Re-cast sensors only every N sim-steps (cache last readings).
- Consider a single `update()` with `dt=simSpeed/60` instead of 100 tiny
  steps. Trades physics stability for throughput — fine for genetic-algo
  training which doesn't care about crisp control feel.

**Expected payoff.** 3–5× at high simSpeed without visual degradation.

**Risks.** Training quality may dip if sensor aliasing misleads the NN
about wall proximity. Validate with fitness-over-generations before/after.

### 4. Sensor LOD for non-best cars

**Motivation.** Every AI car raycasts every step. Most of them aren't
`bestCar` and their sensor readings are feeding into a brain that
typically crashes within a few seconds anyway.

**Approach.** Non-best cars raycast every 2nd or 4th sim-step and reuse
the cached reading between casts. Best car + playerCars always cast every
step.

**Expected payoff.** ~2× on sensor-dominated workloads. Orthogonal to the
spatial grid (multiplicative gain).

**Risks.** Behavioural drift at high simSpeed — a car might drive 4 steps
without noticing a wall approaching. Mitigated by only staggering when
`simSpeed` is already high.

### 5. Motion-blur render trick (no frame multiplication required)

**Motivation.** A 15fps render of 100× sim looks jarring — cars teleport.
Trailing blur makes "teleportation" look like "streaking past" and buys
perceptual smoothness for free.

**Approach.** Each rAF, instead of clearing the canvas, overlay a
low-alpha background-colour rect. Old car positions become trails that
fade over a few frames.

**Tradeoff.** Road edges need to be redrawn each frame (or the trails
stack over the road, muddying it). Works better with a dedicated
"cars-only" canvas layered over a static road canvas.

**Expected payoff.** No measurable ms improvement, but meaningfully
better UX on low-fps devices. Good pairing with (1).

### 6. Float32Array track geometry

**Motivation.** `road.borders` and `checkPointList` are arrays of
`{x,y}` objects. Every `getIntersection(A,B,C,D)` call dereferences
property slots, which is fine but creates GC pressure at
`N × raysPerCar × bordersPerCell × stepsPerFrame`.

**Approach.** At track-finalise time, pack into a single
`Float32Array([x0,y0,x1,y1, ...])`. Queries index by `idx*4`. The spatial
grid would hold indices into that flat array. All hot-path call sites
read through the typed array.

**Expected payoff.** Modest — maybe 10–15% on the sensor bucket. Biggest
win is GC-pause elimination on mobile Safari, which currently can stutter
every few seconds with the allocation rate.

**Risks.** Touches every consumer of `roadBorders`/`checkPointList`.
Mechanical but wide.

### 7. Dirty-region render

**Motivation.** `road.draw(ctx)` + `roadEditor.redraw()` re-paint the
entire 3200×1800 canvas every rAF, even though the road pixels don't
change during training.

**Approach.** Render road once to an offscreen canvas (`roadCanvas`), then
each rAF `drawImage(roadCanvas, 0, 0)` (fast blit) + draw cars on top.
When phase 1/2 edits the track, invalidate the offscreen canvas.

**Expected payoff.** Eliminates road redraw cost — on a 1000×1000 swarm
that's often 20–30% of the draw bucket.

**Risks.** Low. Isolated change scoped to the Road class.

## Recommended next slice (if resumed)

Measure first with `?perf=1` on a representative track with N=1000 at
`simSpeed=100×`. Then pick from:

- If `sim >> draw`: do (3) coarse collision and (4) sensor LOD together.
- If `draw >> sim`: do (7) dirty-region render — it's the cheapest big win.
- If neither dominates and rAF is still >16ms: commit to (1) Web Worker.
- Always: consider (6) typed-array geometry once a Worker path exists —
  the serialisation wants it anyway.
