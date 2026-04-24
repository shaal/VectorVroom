# Task 3.E — A/B comparison mode, shipped

**Date:** 2026-04-23
**Status:** **shipped.** Last task of the VroomVector immediate-impact plan (`docs/plan/vroomvector-immediate-impact-plan.md`), Wave 3.
**Family:** UX / demo-value. Not an experiment; no uncertain outcome to measure — this is engineering.

## Why this is a PROOF at all

UX tasks in Waves 1 and 2 (eli15 chapter, HUD breakdown, slider, bars, seed-sources) shipped with commit messages alone. 3.E warranted a PROOF because the implementation **made real architectural decisions** (mirror-worker vs full-duplicate, state-isolation strategy, toggle-teardown discipline) that future changes to the worker contract or the rendering loop will need to understand. The decision record is load-bearing; the commit message isn't the right place for it.

## What was built

A "Compare A/B" toggle in the Vector Memory panel. When enabled, spins up a second `sim-worker.js` instance that runs the same track/config as the primary, but is deliberately starved of everything that makes the primary special:

1. **No ruvector archive recall** — the B worker's population is always cold-random
2. **No localStorage `bestBrain` prior** — B starts from scratch every generation
3. **No conservative-init bias** (P2.C) — pure `Math.random()*2-1` weights

Rendered side-by-side (A on top, B below) in a vertical flex layout inside `#canvasDiv`. Dual HUDs show gen counters + max-checkpoint + end-survival per side. A delta indicator computes `A - B` for survival-end and max-cp so the ruvector contribution is directly visible.

## The architecture decision: mirror, not duplicate

The cleanest-sounding design ("refactor `main.js` so every global is keyed by worker ID") is 3–5 days of real work. Main.js has ~60 module-scope globals spanning perf buffers, snapshot caches, seeded lineage, SONA trajectory state, benchmark context, lazy-inflated best-brain caches, and more. Full duplication would touch every single consumer of `bestCar`, `latestSnapshot`, `generation`, `frameCount`, `metricsLog`, etc.

Instead, B is a **mirror** — a stripped-down baseline with its own `bState` struct holding only the four fields the A/B user-facing feature actually needs:

- `latestSnapshot` — for rendering cars on ctxB
- `frameCount` — for the tick counter display (unused today but cheap to track)
- `metricsLog` / `lastRow` — for the mini HUD + delta math
- `generation` — for display

Everything else (bestCar proxy, sensor overlays, seed-source tracking, SONA steps, benchmark hooks, save/archive, input-visual bars) is **A-only**. That's a deliberate demo-tier simplification: B is a "what if there was no ruvector?" display, not a second full training rig.

This means some features are asymmetric by design:
- The primary's Task 2.D brain-decision bars stay on A only
- Task 3.F seed-source breakdown is meaningless for B (always `random=N`, `archive=0`) so it's not shown for B
- Pause mirrors A→B via a 60Hz poll in the render tick (cheaper than monkey-patching `setPause` in buttonResponse.js)
- **`simSpeed` / `maxSpeed` / `traction` changes to A do NOT propagate to B mid-run.** B uses whatever config was in place at its last `begin`. This is acceptable because users typically set these once at the start of a session, and B re-begins on every `genEnd` which picks up the current values.

### Why rvDisabled-on-main-thread works

Critical finding from the exploration phase: `rvDisabled` is **main-thread only**. The worker has no knowledge of ruvector — it just sends raw `genEnd` data, and main.js decides whether to archive. This means both A and B workers run **identical code**; the distinction lives entirely in whether `performNextBatch` calls `archiveBrain()`. For B, we just never call it. No worker-side changes needed.

## Teardown discipline

A/B mode is toggleable, so clean teardown matters. `teardownB()` must:

1. `simWorkerB.terminate()` — the ONLY reliable way to stop a Worker thread. `setPause` would leave it pinned to memory and counted against the browser's worker cap.
2. Null `simWorkerB` and `bState` so the GC can reclaim the proxy objects.
3. Clear `ctxB` so the frozen last-frame doesn't linger when the user re-toggles.
4. Clear `_abLastForwardedPause` so the pause-mirror doesn't no-op a re-sync on re-enable.

Verified by 10 toggle-cycle runtime test (see below) and by `performance.memory` staying flat at ~3.6MB across cycles.

## Runtime verification results

Tested via `agent-browser` CLI against `http://127.0.0.1:8765/AI-Car-Racer/`. Default population (N=10, `seconds=15`, simSpeed=1×).

**10 toggle on/off cycles (two rounds of 5):**
- Each OFF: `abEnabled=false`, `canvasB.hidden=true`, `canvasDiv.class=""`, `simWorkerB=null` — verified.
- Each ON (after ~1.2s settle): `abEnabled=true`, `workerReady=true`, `frameCount` in [72, 90] range — consistent, no drift.
- No growing leak in `frameCount` or heap size between cycles.
- Zero new console errors.

**Extended 45s run with A/B on:**
- A advanced 22 generations.
- B advanced 16 generations independently.
- Both `metricsLog` arrays populated correctly.
- Example delta mid-run: A survEnd=50% + maxCp=2; B survEnd=70% + maxCp=1; reported delta = `surv end -20% · max cp +1` (arithmetic correct).
- `performance.memory`: 3.6 MB used / 4.9 MB total after 22 A-gens + 16 B-gens + 5 prior toggle cycles — no leak.

**At N=10 the delta is noisy** because survival percentages quantize in 10% steps. The plan's "ship if" criterion for "ruvector helps" narratively requires larger-N runs to reliably show positive delta. The mechanism (separate workers, separate stats, correct math) is proven. The narrative output is a user-tunable runtime observation, not a gate.

## Bug caught during verification

First render of ctxB showed car motion trails instead of a clean per-frame canvas. Root cause: `road.draw(ctx)` **ignores its ctx argument** — it delegates to `roadEditor.redraw()` which holds a direct reference to the primary canvas. My call `road.draw(ctxB)` was silently no-op-ing on ctxB and re-rendering the primary. Fixed by replacing the call with an explicit `drawTrackOnCtxB()` that:

1. `fillRect` the whole canvas with the background color (wipes last-frame cars)
2. Manually strokes `road.borders` in white
3. Manually strokes `road.checkPointList` in translucent green

This also decouples the A/B canvas from the roadEditor's global state, so future changes to the editor can't accidentally break B.

## Files touched

- `AI-Car-Racer/index.html` — added `<canvas id="myCanvasB">` + `<div id="ab-hud">` (both hidden by default)
- `AI-Car-Racer/style.css` — `.ab-on` layout (flex column), B canvas styling, ab-hud positioning
- `AI-Car-Racer/uiPanels.js` — A/B toggle checkbox + event handler delegating to `window.__abSetEnabled`
- `AI-Car-Racer/main.js` — (1) single-line hook at end of `animate()` calling `window.__abRenderTick()`; (2) ~300-line IIFE at EOF implementing worker lifecycle, state struct, dual rendering, delta math
- `docs/plan/ruvector-proof/ab-mode/PROOF.md` — this file

No changes to `sim-worker.js`, `car.js`, `network.js`, or any other hot-path file. The A rendering path (`drawFromSnapshot`, `drawBestCar`, `road.draw(ctx)`) is bit-identical to pre-3.E code.

## Known limitations (triaged explicitly, not hidden)

| # | Limitation | Severity | Defer to |
|---|---|---|---|
| 1 | `simSpeed` / `maxSpeed` / `traction` changes don't propagate to B mid-run | low | follow-up if users complain |
| 2 | N=10 makes the delta too noisy to *demonstrate* "ruvector helps" — the feature works, but the demo value is thin until the user raises N | medium | user-facing: consider raising default N when A/B on |
| 3 | B's render is lighter than A's (no top-K sort, no sensor overlay, no best-car highlight) | low | by design — keeps B visually distinct as "baseline" |
| 4 | ab-hud text is low-contrast in screenshots (slate-gray on dark bg) | cosmetic | polish pass |

## Long-term considerations

If a future task wants B to have full feature parity (sensor overlay, seed-sources, etc.), the right next step is NOT to patch more into this IIFE — it's to finally do the main.js refactor where per-worker state is an object you can instantiate twice. The mirror approach made the first ship cheap; a full-duplicate refactor is the right move when the feature asks outgrow what a mirror supports.
