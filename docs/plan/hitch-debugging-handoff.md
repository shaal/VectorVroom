# Hitch debugging handoff

Session paused here. Periodic visual halts remain at N=10,000 × simSpeed=5×.
The Web Worker refactor is stable; the optimization attempt below regressed
throughput and needs to be either fixed or reverted before continuing.

## Where we are

Shipped (on `main`):
- `feat(perf): Web Worker sim + hitch detector` — commit `1e8b74c`
- `debug(perf): worker-side slowTick reporting` — commit `ab1312e`
- `perf(car): staggered physics stride` — commit `4f39499` ← **regressed**

The perf HUD has a "hitches" panel showing the last 6 gap events with a
breakdown. Use `?hitch=0` to suppress.

## Regression: stagger fix (`4f39499`) made things worse

Intended: halve per-step cost at stride=2 by staggering which cars run.
Observed at N=10k × simSpeed=5×:

| metric            | before `4f39499` | after `4f39499` |
|-------------------|------------------|-----------------|
| `sim (worker)`    | 25 ms            | 60 ms           |
| `steps/snap`      | 2.0              | 1.0             |
| `maxStep` (avg)   | ~75 ms           | ~100 ms         |
| `maxStep` (peak)  | 122 ms           | 178 ms          |
| Sim/wall ratio    | 0.55× real-time  | 0.22× real-time |

`maxStep` still equals `tick`, so **the regression is cost per step, not
GC or post**.

### Most likely root cause

The new top-of-`update()` gate in `car.js` is probably not firing — and
because the same commit **removed the old `skipPerception` guard** at the
bottom of `update()`, every non-privileged AI car now runs sensor+NN
every frame instead of every other frame. That doubles perception cost.

### What to check first

1. **Is the top-gate evaluating true ~50% of the time?** Add a temporary
   counter in the worker: total `update()` calls vs "took early-return".
   At stride=2 × N=10k, expect ~50% early-returns per step. If it's 0%,
   the gate is broken.
2. **Is `SENSOR_STRIDE` visible in the `Car` class's method scope?**
   Class method bodies are strict-mode. `typeof SENSOR_STRIDE !==
   'undefined'` should still work via globalThis property lookup in a
   Worker, but verify with a one-off log.
3. **Is `bestCar` resolving to `self.bestCar` inside the Worker?**
   Same scoping concern. If it silently resolves to `undefined`, then
   `this !== bestCar` is trivially true for every car (desired), but if
   it throws silently somewhere, the whole condition could short-circuit
   in unexpected ways.
4. **Is `this._strideOffset` set?** New cars get it in the constructor,
   but confirm the worker's `handleBegin` creates fresh Cars each
   generation (it does — `cars = new Array(N)` then `new Car(...)`).

### Two paths forward

**Path A — fix the stagger.**
Add the debug counter, confirm the gate isn't firing, fix it. If it now
halves `maxStep` as expected, ship.

**Path B — revert and try a different lever.**
If Path A doesn't produce a clear win, revert `4f39499`. Then try:

- **N-aware stride bump.** At N > 5000, force `SENSOR_STRIDE = max(stride,
  3)` inside the worker, so we process ≤3333 cars/frame regardless of
  simSpeed. Cheap, self-contained.
- **Pool sensor-reading allocations.** `sensor.update()` builds
  `{x,y,offset}` objects per ray per call. At 10k × 5 rays × ~50Hz
  that's 2.5M alloc/sec. Reuse a per-sensor typed array.
- **Move top-K selection into the worker.** Today the worker posts all
  10k positions and main picks top-K for rendering. Picking in the
  worker would let us transfer only ~64 positions per snapshot — cuts
  the 200KB/snapshot buffer down to 1KB. Reduces heap churn and postMs.
- **Shard the population across 2-4 workers.** Coordinator (main) fans
  out `begin` with a slice of the brains buffer, gathers snapshots,
  merges best-car across shards. This is the biggest potential win
  (linear with cores) but the biggest refactor.

### Remaining bottleneck estimates (rough, at N=10k)

Per physics step with all cars alive:
- move + polygon rebuild: ~15 ms
- assessDamage + assessCheckpoint (spatialGrid broad-phase): ~20 ms
- sensor.update (raycasts): ~20 ms (half of that with stride=2)
- NN forward: ~5 ms
- bestCar scan: ~1 ms

Target: a single step must cost **< 20 ms** (current `TICK_BUDGET_MS`) or
the budget check at step-end can't save us. Either make the step cheaper
or split a step into fan-outable chunks.

## Diagnostics are in place — use them

The HUD hitch panel + `slowTick` worker messages are the load-bearing
diagnostic. When a hitch fires, the `extra` tells you which bucket
dominates:

- `gap=` → worker thread was paused (GC, OS preemption)
- `tick=` → total tick compute
- `maxStep=` → single worst step in that tick
- `post=` → postSnapshot (allocation + postMessage)
- `st=` → step count that actually ran

If `maxStep ≈ tick` → one-giant-step is the problem (current situation).
If `gap >> tick` → GC (pool allocations).
If `post >> maxStep` → postMessage (shrink snapshot).

## Files touched this round

- `AI-Car-Racer/car.js` — constructor adds `_strideOffset`; `update()`
  has the new top-gate; perception block simplified.
- `AI-Car-Racer/sim-worker.js` — `stepOnce` records `tickGap`,
  `maxStepMs`, `postMs`; emits `slowTick` debug events.
- `AI-Car-Racer/main.js` — hitch ring buffer + HUD rendering; handles
  `slowTick` debug messages; times `performNextBatch` phases.

## Open task

- #9 WASM hot loops (stretch) — still pending. Biggest wall-time win
  per bit of work but largest implementation cost. Consider after the
  stagger question is resolved.
