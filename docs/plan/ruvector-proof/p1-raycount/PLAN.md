# P1 — Perception widening: rayCount 5 → 7

**Date:** 2026-04-23
**Status:** code shipped; benchmark pending
**Family:** perception (NOT a reward-shape change)
**Predecessor topology:** A1' `[8, 8, 4]` (5 rays + speed + local_forward + local_right)
**This topology:** P1 `[10, 8, 4]` (7 rays + speed + local_forward + local_right)

## Hypothesis

The Triangle apex regressions documented in `arch-a1/PROOF.md`, `f1-fitness-shaping/PROOF.md`,
and `f1-prime/PROOF.md` are all **reward-shape** failures in the forward-motion family.
P1 is the first **perception-side** intervention against the same target.

**Mechanism:** with `rayCount=5` and `raySpread=120°`, adjacent rays are 30° apart. The linear
gap between two adjacent ray tips at `rayLength=400` is `2 × 400 × sin(15°) ≈ 207 px`. The
Triangle preset's left apex (inner converges to `(500, 900)`, outer to `(150, 900)`) is exactly
the kind of converging-walls geometry that lives in those gaps — a wall corner aligned with
the gap is invisible until the car is essentially on top of it.

Bumping `rayCount` to 7 reduces angular spacing to 20° and the linear gap to ~139 px, making
apex corners detectable earlier. Combined with the existing brake force (`maxSpeed/60 = 0.25
px/frame²`) and stopping distance from `v=15` (~450 px), the extra detection range is at the
margin where it could plausibly matter.

**Critical caveat:** P1 only adds *capability*, not *gradient*. The GA reward signal is
unchanged. If the brain doesn't learn to use the extra rays, P1 will be neutral on Triangle.
This is consistent with the "preserves caution near walls" family that A1' validated — the
extra rays preserve more caution information without rewarding speed.

## Code changes

All ten constants/comments were updated in lockstep — `TOPOLOGY` lives in three mirrors
(brainCodec.js, sim-worker.js, main.js) by design, because the worker uses `importScripts`
(no ES modules) and main.js is a classic script.

| File | Change |
|---|---|
| `sensor.js:4` | `rayCount=5` → `rayCount=7` |
| `brainCodec.js:4` | `TOPOLOGY = [8, 8, 4]` → `[10, 8, 4]` |
| `brainCodec.js:5` | `FLAT_LENGTH = 108` → `124` |
| `brainCodec.js:15` | `BRAIN_SCHEMA_VERSION = 4` → `5` (+ comment block updated) |
| `brainExport.js:108` | expected topology `[8, 8, 4]` → `[10, 8, 4]` (+ error message) |
| `sim-worker.js:67-68` | `FLAT_LENGTH 108`/`TOPOLOGY [8,8,4]` → `124`/`[10,8,4]` (+ comment) |
| `sim-worker.js:453` | comment "topology is [8, 8, 4]" → `[10, 8, 4]` |
| `main.js:460` | proxy stub `rayCount: 5` → `7` |
| `main.js:586` | `FLAT_LENGTH = 108` → `124` |
| `main.js:591` | `BRAIN_SCHEMA_VERSION = 4` → `5` |
| `main.js:609` | `new NN([8, 8, 4])` → `new NN([10, 8, 4])` |
| `eli15/chapters/sensors.js` | doc text updated (5 rays → 7 rays, fixed stale `+1` to `+3`) |

`FLAT_LENGTH = 124` math: layer 0→1 = 10×8 + 8 = 88; layer 1→2 = 8×4 + 4 = 36; total 124. ✓

### Deliberately not changed

- **`dynamicsEmbedder.js`** — intentionally fixes 5 ray channels for embedding-shape stability.
  The existing comment at line 86 explicitly documents the intent: "shorter input pads with 1.0
  and longer input is silently truncated." With `rayCount=7`, rays 5 and 6 will be silently
  truncated from the trajectory embedding, which is correct behaviour — downstream consumers
  (SONA, GNN reranker) depend on the 5-channel contract.
- **`eli15/chapters/{vectordb-hnsw,neural-network}.js`** — both reference a pre-existing stale
  "92-d" / "FLAT_LENGTH = 92" from before A1'. Not introduced by P1; out of scope.

## Smoke test (already done)

Page loaded against http://127.0.0.1:8765/AI-Car-Racer/index.html:

- `[brainCodec] self-check passed — 124-dim round-trip ok` (built-in flatten/unflatten test)
- `[ruvector] brain schema v1 → v5 — clearing archive` (auto-migration triggered)
- `phase=4`, `frameCount=48` after 8s wait — generation loop alive
- 119.8 fps; sim 0.04 ms — perf nominal
- Visual confirmation: 7 rays render in lidar fan at the START car

Build is clean. Effectiveness benchmark pending.

## Benchmark protocol

Per `project_triangle_asymmetry` checklist + `project_cross_track_variance` (n≥6 across ≥2
sessions before strong claims):

1. **Baseline reminder** — A1' shipped values (rect-seeded-tri last-5 survival@5s = 0.727,
   Δ vs Phase 2 cold-tri = +0.013). P1 must preserve A1''s positive transfer to ship.
2. **Cold n=3 on Rectangle** with `rayCount=7` brain. Compare vs A1' Rectangle baseline.
3. **Cold n=3 on Triangle** with `rayCount=7` brain. Compare vs A1' Triangle baseline.
4. **Cross-track n=3** rect-seeded-tri (the original arch-cross-shape-transfer metric).
5. (Recommended per cross-track-variance memory) repeat in a second session for n≥6 total.

### Ship / revert criteria

| Outcome | Action |
|---|---|
| Tri Δ ≥ 0 AND Rect Δ ≥ −0.05 | Ship. Promote to `PROOF.md`. |
| Tri Δ < −0.05 | **Revert**, regardless of Rectangle benefit. (Per `project_triangle_asymmetry`.) |
| Tri Δ in `[−0.05, 0)` AND Rect Δ ≥ 0 | Inconclusive. Run second session for n=6 before deciding. |
| Both regress | Revert. Indicates extra rays are noise that the existing topology can't usefully exploit. |

## Possible follow-ups (do NOT start until P1 results are in)

- **P1.b** — `rayCount=9` if P1 helps. Tighter angular spacing (~13° gap, ~91 px linear at apex).
  Diminishing returns expected; only worth running if P1 is conclusively positive.
- **P2 — wall-proximity penalty** scaled by speed. Adds anticipation gradient to fitness. This is
  the *gradient*-side complement to P1's *capability*-side change. Belongs in the "preserves
  caution near walls" family that A1' validated.
- **P3 — `rayLength` 400 → 600** (originally rated low–medium; reconsider only if P1 + P2 stall).
  Note: changes input scale (offsets are normalised by rayLength), so requires retraining and
  another schema bump.
