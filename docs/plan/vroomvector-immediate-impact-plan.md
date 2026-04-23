# VroomVector Immediate-Impact Plan

**Scope:** Six concrete UX, clarity, and survivability improvements that don't require the long-term strategy/agent re-architecture. Designed for piecewise execution via `/ship-task`, with explicit parallelization waves so swarms of subagents can work independently.

**Source:** Synthesized from the `triangle-apex-investigation-2026-04-23.md` retrospective. The Triangle apex investigation surfaced that the project's core demo value (showing ruvector improve cars over time) is undersold by the current UX — users see cars crash without understanding why, and ruvector's contribution is invisible without manually toggling `?rv=0`.

**Goal:** Make the project's value visible AND make user-perceived "cars crash for no reason" legible, without changing the underlying GA/architecture.

---

## Execution model — three waves

The six tasks are organized so within a wave, all tasks are file-disjoint enough to run in parallel as separate subagents (one Agent call per task, all in one message). Between waves, there are real dependencies (UI layout, shared files).

| Wave | Parallelism | Tasks | Total est. time (parallel) |
|---|---|---|---|
| **Wave 1** | 3 subagents in parallel | 1.A eli15 chapter, 1.B HUD death-cause, 2.C conservative-init slider | ~half day |
| **Wave 2** | 2 subagents in parallel | 2.D brain-decision tooltip, 3.F ruvector seeding-source indicator | ~half day |
| **Wave 3** | 1 subagent | 3.E A/B comparison mode | ~1-2 days |

Wave-2 must come after Wave-1 because (a) the HUD layout from 1.B affects where 2.D and 3.F render, and (b) some Wave-2 work reads state added by 2.C. Wave-3 must come last because the A/B split-screen rearranges multiple UI surfaces and would conflict with concurrent UI work.

Within each wave, each task is independently shippable — if one fails its confidence gate, the others still ship.

---

# Wave 1 — three parallel tasks

## Task 1.A — eli15 chapter "Why Cars Crash"

### Goal
Add a new educational chapter explaining the four mechanistic reasons cars drive into walls (random-init reflex tables, suboptimal-elite lock-in, stopping-distance > sensor-range physics, sparse fitness signal). Directly answers the most common user confusion.

### Files to touch
- **NEW** `AI-Car-Racer/eli15/chapters/why-cars-crash.js` (new chapter file)
- `AI-Car-Racer/eli15/index.js` or wherever chapters are registered (read existing chapters to find pattern)

### Approach
1. Read `eli15/chapters/sensors.js` and 2-3 other existing chapters to learn the voice, format, and chapter-registration mechanism.
2. Write `why-cars-crash.js` with the same shape: `id`, `title`, `oneLiner`, `body`, optional `diagram`. Body in HTML strings joined with `\n`.
3. Cover four sections: "Brains are frozen reflex tables," "Generation 0 is mostly broken by random luck," "The first checkpoint-reacher locks in suboptimal behaviour," "Even good brains can't out-react walls at full speed."
4. Reference specific code locations (`sim-worker.js:295` for fitness, `car.js:42` for NN topology, `sensor.js:5` for ray length).
5. Register in the eli15 index.

### Acceptance
- New chapter renders in the eli15 panel without errors
- Console-clear after page load
- Content references the actual code lines (not made up)
- Voice matches existing chapters

### Ship if
- Chapter renders, registers in index, body reads cleanly

### Revert if
- Existing chapters break (registration regression)
- Chapter content is generic/inaccurate (doesn't tie to actual code)

### Subagent prompt template
```
Add a new eli15 chapter "Why Cars Crash" to AI-Car-Racer/eli15/chapters/why-cars-crash.js.
Read existing chapters (sensors.js, neural-network.js) for voice and format. Cover four
mechanistic reasons cars hit walls: (1) frozen reflex tables — NN is a fixed function,
not an agent; (2) gen-0 random brains, ~1/16 hardcoded to "always forward"; (3) elite
lock-in after gen 10 traps the population in the first lucky reflex; (4) stopping
distance ~450px > sensor range 400px makes pure reactivity physically impossible.
Reference sim-worker.js:295 (fitness), car.js:42 (topology), sensor.js:5 (ray length).
Register in eli15 index. Smoke-test in browser at http://127.0.0.1:8765/AI-Car-Racer/.
Per project convention, commit locally, do not push.
```

### Estimated effort
~30 min subagent run.

---

## Task 1.B — Death-cause categorization in HUD

### Goal
Replace the current `wall-bumps 280` raw count with a small breakdown by death type. Gives users *insight into how* the population is dying, not just *that* it is.

### Files to touch
- `AI-Car-Racer/sim-worker.js` — compute death-cause per car at `endGen()` time, post in `popDeathCauses` Int8Array
- `AI-Car-Racer/main.js` — receive new field in genEnd handler, render in metrics panel
- Possibly `AI-Car-Racer/main.js` metricsRender or wherever HUD updates

### Death-cause categories
1. **head-on wall** — car damaged with `|velocity_forward| > 0.7 × maxSpeed` (drove into wall fast)
2. **side scrape** — car damaged with low forward velocity but lateral velocity (sliding into wall)
3. **slide-out** — car damaged while `slide=true` was active in the prior frame
4. **stalled** — survived to end of gen (not damaged), but checkpoint count < 1
5. **alive** — survived AND made progress

Compute at end of gen by inspecting each car's last-frame state. Worker has all info; main thread just renders.

### Approach
1. Add `popDeathCauses` Int8Array to the genEnd payload (alongside existing `popCheckpoints`, `popDeathFrames`).
2. In `endGen()` worker code, iterate cars, classify into 5 categories using car state at death time.
3. In main.js genEnd handler, count categories and update the metrics HUD section that currently shows `wall-bumps`.
4. Render as a small inline breakdown: `head-on 142 · side 98 · slide 40 · stalled 220 · alive 0`.

### Acceptance
- HUD renders the breakdown each generation
- Numbers sum to popN
- No new console errors
- Worker payload size only grew by N bytes (Int8Array)

### Ship if
- Breakdown renders correctly across at least 3 generations
- Categories are mutually exclusive (no double-count)
- Rect lap completion still works (no perf regression in worker)

### Revert if
- Generation rate drops by >5% (worker classification too expensive)
- Categories miscount (sum != popN)
- HUD layout breaks

### Subagent prompt template
```
Replace the single 'wall-bumps' count in the metrics HUD with a 5-category death-cause
breakdown: head-on, side-scrape, slide-out, stalled, alive. Add popDeathCauses Int8Array
to sim-worker.js endGen() payload, computed by inspecting each car's last-frame state
(velocity components, slide flag, damaged flag). Update main.js genEnd handler and the
metrics renderer to show 'head-on N · side N · slide N · stalled N · alive N'. Smoke-test
across 3 generations on Rectangle preset, verify counts sum to popN. Local commit, no push.
```

### Estimated effort
~1.5 hour subagent run.

---

## Task 2.C — "Conservative init" slider

### Goal
Add a UI slider 0.0..1.0 controlling how much the gen-0 random brains are biased toward "if any ray reads close, brake/turn." At 0, current pure-random init. At 1.0, brains have a hardcoded prior favouring conservative driving. Lets users see how starting conditions affect the learning curve.

### Files to touch
- `AI-Car-Racer/utils.js` — add slider HTML (mirror existing maxSpeed slider at line 80)
- `AI-Car-Racer/buttonResponse.js` — add `setConservativeInit(value)` setter
- `AI-Car-Racer/main.js` — modify `fillRandom(out, off)` to apply the bias when generating new brains for cold-init populations
- Add `conservativeInit` global, persist to localStorage like other tunables

### Approach
1. Add slider element to the Training tuning section (mirror Variance slider style).
2. `fillRandom(out, off, conservativeBias)` — instead of pure `Math.random() * 2 - 1`, post-process the random brain by injecting weight values that bias the network toward "output reverse=on when input ray reads >0.5, output forward=on when all rays read <0.3."
3. Concretely: identify the output layer's `forward` neuron weights, push them slightly negative (-0.5 × bias) for inputs corresponding to short rays. Identify `reverse` neuron weights, push them positive for short rays. Pure linear bias addition.
4. Skip when ruvector seeding fires (only applies to cold-random init, not seeded brains).
5. Default value: 0.0 (current behaviour preserved).

### Acceptance
- Slider renders in Training tuning section
- localStorage persists value across reload
- At slider=0, behaviour is identical to current (no regression)
- At slider=1.0, gen-0 cars visibly slow when near walls
- At intermediate values, hybrid behaviour observable

### Ship if
- Default=0 produces identical Rect cold benchmark to baseline (lap by gen 18-29)
- Slider=0.5 produces visibly more cautious gen-0 driving
- No NaN propagation in worker
- A/B test: slider=0 vs slider=0.7 on cold Rect 30 gens — survivability improves at slider=0.7 in early gens

### Revert if
- Slider=0 regresses Rect cold (lap fails to materialize within 50 gens)
- Slider>0 introduces NaN or makes cars stationary
- Brain weights at high bias are out of [-1, 1] range and break network.js assumptions

### Subagent prompt template
```
Add a 'Conservative Init' slider 0.0..1.0 (default 0) to the Training tuning panel.
Mirror the maxSpeed slider in utils.js:80 for HTML structure, setSimSpeed for the setter
pattern in buttonResponse.js. Persist to localStorage. Modify main.js fillRandom() to
inject a brain-weight bias based on the slider value: at value=1, gen-0 brains favor
'reverse=on when any ray reads >0.5'. Apply only to cold-random init paths, not to
ruvector-seeded brains. Verify slider=0 reproduces current behaviour exactly (regression
test: Rect cold 30 gens still completes 1 lap). Verify slider=0.7 produces visibly more
cautious gen-0 driving. Local commit, no push.
```

### Estimated effort
~2-3 hour subagent run (more careful about the bias-injection math).

---

## Wave 1 swarm dispatch

The user can spawn 3 subagents in parallel from one message:

```
Agent("eli15-why-crash", subagent_type="general-purpose", prompt=<Task 1.A template above>)
Agent("hud-death-cause", subagent_type="general-purpose", prompt=<Task 1.B template above>)
Agent("conservative-init-slider", subagent_type="general-purpose", prompt=<Task 2.C template above>)
```

All three touch disjoint files (eli15/, sim-worker.js+main.js metrics section, utils.js+main.js fillRandom), so they shouldn't merge-conflict. Run them concurrently for ~half-day total wall time vs 1.5 days sequential.

---

# Wave 2 — two parallel tasks

Run after Wave 1 lands so the HUD layout is settled.

## Task 2.D — Per-frame brain-decision tooltip on bestCar

### Goal
When hovering the elite car, show what the brain just decided and *why*: which inputs were strongest, which output neurons fired. Currently `inputVisual.js` shows just the 4 control booleans — no insight into reasoning.

### Files to touch
- `AI-Car-Racer/inputVisual.js` — extend or replace
- `AI-Car-Racer/main.js` — render decision tooltip near bestCar, send brain inputs/outputs in snapshot
- `AI-Car-Racer/sim-worker.js` — ensure bestCar's brain inputs and weighted activations are in the snapshot

### Approach
1. Add `bestInputs` Float32Array(10) and `bestOutputActivations` Float32Array(4) to snapshot from worker (bestCar's last-frame NN inputs and pre-threshold output sums).
2. On main thread, when hovering bestCar (or always-on in a debug panel), render:
   - 7 ray bars showing closeness (1 = wall touching)
   - speed bar
   - 2 direction-feature bars (lf, lr)
   - 4 output bars showing pre-threshold sum (positive = control fires)
3. Highlight the strongest input contributors to the strongest output (saliency-style: which input × weight contributed most to each output).

### Acceptance
- Tooltip appears on bestCar hover (or in always-on debug panel)
- Inputs match what the worker actually fed the NN
- Outputs match the actual control decisions
- Saliency highlights are mathematically correct

### Ship if
- Visual matches the underlying NN math
- Performance impact <5% per frame
- Doesn't break existing inputVisual

### Subagent prompt template
```
Extend inputVisual.js to show the bestCar's last-frame NN inputs (7 rays + speed + lf + lr)
and output pre-threshold sums (forward, left, right, reverse). Add bestInputs Float32Array(10)
and bestOutputActivations Float32Array(4) to sim-worker.js snapshot. On main thread, render
as bars in a debug panel near the existing inputCanvas. Optional: saliency highlight showing
which input contributed most to each output. Verify bars match actual NN behaviour by
comparing bestCar.controls to thresholded output bars. Local commit, no push.
```

### Estimated effort
~3-4 hour subagent run.

---

## Task 3.F — Ruvector seeding-source indicator

### Goal
Show, per generation, what fraction of the population was seeded from cross-track ruvector recall vs random init vs localStorage prior. Makes the value flow visible without requiring A/B comparison.

### Files to touch
- `AI-Car-Racer/ruvectorBridge.js` — track and expose seed-source counts per `recommendSeeds()` call
- `AI-Car-Racer/main.js` — read the source breakdown and render in the Vector Memory panel
- Possibly add a small inline chart or just text counters

### Approach
1. In `ruvectorBridge.recommendSeeds()`, track how many seeds came from each source: `archive_recall` (vector similarity hit), `localStorage_prior` (saved best brain), `random_init` (fallback). Store counts in `_lastSeedSources`.
2. Expose via `info()` function so main can poll.
3. In main.js, after each genEnd, fetch counts and update a small per-gen breakdown in the Vector Memory panel.
4. Optional: 30-gen rolling sparkline showing the trend (does ruvector contribution rise as the archive fills?).

### Acceptance
- Per-gen breakdown renders in Vector Memory panel
- Counts sum to N (population size)
- Cold start shows random_init = N (no archive yet)
- After 10 gens, archive_recall starts contributing

### Ship if
- Breakdown is accurate (verified by inspecting `_brainMirror` size and recall logic)
- No console errors during generation
- Doesn't slow `recommendSeeds()` perceptibly

### Subagent prompt template
```
Add per-generation seeding-source tracking to ruvectorBridge.js. Track how many seeds
in each recommendSeeds() call came from archive_recall vs localStorage_prior vs random_init.
Expose via info() and read in main.js, render in the Vector Memory panel as
'gen seed sources: archive 320 · prior 1 · random 179'. Optional: 30-gen rolling sparkline.
Verify counts sum to N. Verify cold start shows random_init=N (archive empty). Local commit,
no push.
```

### Estimated effort
~3-4 hour subagent run.

---

## Wave 2 swarm dispatch

Two subagents in parallel, after Wave 1 confirmed shipped:

```
Agent("brain-decision-tooltip", subagent_type="general-purpose", prompt=<Task 2.D template>)
Agent("ruvector-seed-sources", subagent_type="general-purpose", prompt=<Task 3.F template>)
```

These touch different subsystems (inputVisual + bestCar snapshot vs ruvectorBridge + Vector Memory panel) — safe to run concurrently.

---

# Wave 3 — single biggest task

## Task 3.E — A/B comparison mode

### Goal
**The single highest-impact change for demonstrating ruvector's value.** Split-screen UI showing two populations training simultaneously: one with `rvDisabled=true`, one with `rvDisabled=false`. Live stats panel comparing survival, lap times, checkpoint reach. Makes the project's central value proposition immediately legible.

### Why Wave 3 alone

- Two parallel sim-workers required (current architecture is single-worker)
- UI layout rearranges multiple existing surfaces (canvas split, dual HUDs)
- Touches files Wave 1 and Wave 2 also touched (HUD section, Vector Memory panel)
- Conflict risk if run concurrently

### Files to touch
- `AI-Car-Racer/sim-worker.js` — already supports messages; spin up second worker instance
- `AI-Car-Racer/main.js` — manage two worker instances, two bestCar proxies, two snapshots
- `AI-Car-Racer/index.html` — UI for split-screen toggle and side-by-side panels
- `AI-Car-Racer/style.css` — split-screen layout styles
- Possibly `AI-Car-Racer/road.js` — render twice (left half / right half of canvas) or two separate canvases

### Approach
1. Add a "Compare A/B" toggle to the Vector Memory panel.
2. When enabled, instantiate a SECOND `sim-worker.js` instance with `rvDisabled=true`, while the primary keeps its current ruvector-enabled state.
3. Render both populations in side-by-side canvas halves (or stacked if width-constrained).
4. Dual HUDs showing each population's stats: best lap, best fitness, max CP, alive count, gen number.
5. A small "delta" indicator: "ruvector +12% survival this gen" — the value-prop made explicit.
6. Toggle off → cleanup second worker, restore single-population layout.

### Acceptance
- A/B toggle works without page reload
- Both populations train at similar rates (within 20% wall-time per gen)
- Delta indicator computes correctly (ruvector_survival − no_rv_survival)
- Toggling off cleanly restores single-worker layout

### Ship if
- A/B mode shows ruvector contributing positively over 30+ gens on Rect
- No memory leaks across toggle on/off cycles
- Existing single-worker mode works identically when A/B is off

### Revert if
- Two workers slow per-gen wall time by >50% (compute-bound)
- Layout breaks at smaller window sizes
- Memory leak on toggle off

### Subagent prompt template
```
Add an A/B comparison mode toggle to VroomVector. When enabled, spin up a second
sim-worker.js instance with rvDisabled=true (the primary keeps ruvector enabled).
Render both populations side-by-side. Dual HUDs comparing best lap, max CP, survival
per generation. Delta indicator showing ruvector's survival contribution. Toggle off
cleanly restores single-worker mode. Verify no memory leak across 5 toggle cycles.
Verify A/B mode shows ruvector helping over 30 gens on Rect cold. Local commit, no push.
```

### Estimated effort
~1.5 day subagent run (this is genuinely a big task — UI layout, worker coordination, state management).

---

# Cross-cutting concerns

## Permission and safety

Per project memory `feedback_local_vs_external_scope`: all subagents commit locally only. Pushing requires explicit user OK. Each task should produce its own commit; the user can review and push the bundle when ready.

## Schema bumps

None of these tasks change `BRAIN_SCHEMA_VERSION`. Conservative-init (2.C) and brain-decision tooltip (2.D) read brain weights but don't change topology. Safe across the board.

## Ruvector archive impact

None of these tasks invalidate archived brains. Existing P5-trained brains continue to work. The schema gate at v6 is preserved.

## Performance budget

Per-task perf checks listed in each "Ship if" section. Combined budget: A/B mode (3.E) is the only task with material perf risk (doubles worker count). Tasks 1.A–2.D should each cost <5% of frame budget.

## Documentation

Each task's PROOF.md goes in `docs/plan/ruvector-proof/` only if the experiment is meaningful for future replication. UX tasks like 1.A–3.E don't need PROOFs — the commit message + this plan is sufficient. The PROOF discipline is for *experimental* changes (where outcome is uncertain), not *engineering* changes (where outcome is deterministic).

---

# Acceptance criteria for the whole plan

When all six tasks are shipped:

- A new user landing on VroomVector should be able to:
  1. See the eli15 "Why Cars Crash" chapter (Task 1.A)
  2. Read the death-cause HUD breakdown to understand population health (Task 1.B)
  3. Toggle "Conservative Init" to see how starting conditions affect learning (Task 2.C)
  4. Hover the elite car to see its brain reasoning (Task 2.D)
  5. Watch the Vector Memory panel show ruvector's seed contribution per gen (Task 3.F)
  6. Toggle A/B mode to compare ruvector ON vs OFF side-by-side (Task 3.E)

- The cars-crash-into-walls confusion should be resolved at multiple levels: educationally (1.A), per-population (1.B), per-policy (2.D), per-ruvector-contribution (3.F + 3.E).

- Ruvector's value should be *visible* without A/B-toggling — the seeding-source indicator (3.F) makes it visible in normal operation, and A/B mode (3.E) makes it provable on demand.

---

# Open questions for the user

1. **A/B mode UI placement:** split-screen (side-by-side) vs stacked vs separate window? Affects 3.E design.
2. **Conservative-init bias mechanism:** weight injection (current proposal) vs hand-coded "starter brain" archive entry? Latter is more interpretable but requires new infrastructure.
3. **eli15 chapter ordering:** insert "Why Cars Crash" after "sensors" or after "neural-network"? Read existing chapter order to decide.
4. **Death-cause categories:** the 5 proposed are reasonable starting points; user may want different buckets (e.g., separate "front wall" from "side wall"). Easy to refine post-Wave-1.

---

# Stopping criteria

This plan is six tasks. Stop after Wave 3 (Task 3.E) ships. Don't accumulate more clarity-improvement tasks reactively — if more emerge, write a new plan doc rather than extending this one. The session-2026-04-23 retrospective and this plan together should be sufficient for a future Claude or user to pick up the project's UX clarity work without re-deriving the motivation.
