# F1 — Fitness shaping (forward-motion reward), attempted and reverted

**Date:** 2026-04-23
**Plan ref:** `docs/plan/generalization-fix.md` Phase 4 stretch ("Fitness shaping: currently fitness is checkpoints + laps*N. Add a small penalty for proximity to walls, reward for staying centered in the corridor").
**Outcome:** attempted, regressed Triangle, reverted. A0 + A1' + A3 state preserved.

## What was tried

Added a continuous shaping reward to the GA fitness to address the Phase 0 diagnosis:

> "Median checkpoints reached is 0 in every single generation of every single run. Only the best 10% ever crosses a checkpoint. ... the GA isn't getting enough signal out of 15-second rollouts with a coarse fitness function."

Design:

- `car.js` gains a per-car `shapingScore` accumulator. Each tick while `!damaged`, the car adds `(forward_speed / maxSpeed) / 900` (900 = 60 fps × 15 s, so max = 1.0 per gen). Forward-only: reversing contributes 0.
- `sim-worker.js` adds `FITNESS_SHAPING_ALPHA = 0.3` and changes both fitness call sites to `checkpointsCount + laps * cpLen + α * shapingScore`. Shaping contribution capped at 0.3, below 1 checkpoint — checkpoint progress still dominates primary ranking.
- `brainCodec.js` + `main.js` bumped `BRAIN_SCHEMA_VERSION` 4→6 (skipping 5 from reverted A2) since `meta.fitness` values archived under the old formula would be incoherent with new-formula rankings.

## Measurement (n=3 each, batchSize=1000, simSpeed=100, 30 gens cold)

| Metric | Baseline | F1 measured | Δ | Pass |
|---|---|---|---|---|
| Rectangle cold last-5 surv@5s | 0.492 (Phase 2) | **0.535** (reps 0.591, 0.480, 0.535) | +0.043 | ✓ (within ±0.05; slight improvement) |
| **Triangle cold last-5 surv@5s** | 0.714 (Phase 2) | **0.587** (reps 0.562, 0.602, 0.596) | **−0.127** | **✗** |
| Rectangle cold medCheckpoints (last-5) | 0 (Phase 2) | **1.00** in 2/3 reps | +1 on median | improvement |
| Triangle cold medCheckpoints (last-5) | 2 (Phase 2) | 1.00 in 3/3 reps | −1 | regression |

**Primary criterion fails on Triangle by 0.127** — well outside the ±0.05 band.

## Why F1 hurt Triangle

α=0.3 was too strong. The reward pushes the GA toward aggressive forward-motion policies. Rectangle's wide corridors accommodate this — cars drive faster and straighter, survive longer on average. Triangle's apex corridors do not — the same aggressive-forward policy crashes more often at narrow turns, dropping the 5-second survival rate.

This is **the same asymmetric pattern as A1** (unit-vector direction → "drive toward CP" shortcut, Tri regressed; Rect fine). There's a persistent structural property of the Triangle preset: any reward shape that encourages *commitment* to forward progress — whether via direction features or speed shaping — tends to help Rectangle and hurt Triangle. Features that preserve *caution* (raycasts weighted against speed, magnitude-scaled direction) tend to work in both.

The positive F1 signal: **median checkpoints on Rectangle went 0 → 1** in 2 of 3 reps, which is the first time any change in this repo has moved that metric off zero. The GA *is* finding more progress-reaching brains under shaping; it just optimises them unsafely on tight corridors.

## Decision

Code reverted back to A3 state (commit `dfa4f5b`). `car.js`, `sim-worker.js`, `brainCodec.js`, `main.js` restored via `git checkout HEAD --`.

## Retry variants for a future F1'

Three concrete retries from most to least principled:

1. **Tie-breaker-only shaping.** Use `shapingScore` as a secondary sort key between cars with the *same* integer `checkpointsCount + laps * cpLen`. Primary ranking by progress is literally unchanged; shaping only decides who wins when two cars are in the same tier. Guaranteed not to shift the frontier that survival metrics measure against.

2. **α reduced to 0.05 or 0.10.** Same design, smaller magnitude. Would need re-measurement on both tracks.

3. **Pair speed reward with wall-proximity penalty.** `+0.3 * speed/maxSpeed` every tick, `−0.3 * max(rayReading)` every tick. Net: reward *cautious fast driving*. Closer to the plan's original suggestion ("reward for staying centered in the corridor"). More complex; harder to tune.

Option 1 is the cleanest risk-adjusted retry — if it fails, it can only fail in ways the F1 α=0.3 experiment already explored, so the retrospective cost is low.

## Consistency check

Same-track warm Δ was not re-measured under F1 (shaping affects fitness, which affects which brains get elite status but not the archive's *preservation* property). The five-arch-variant replicated finding that "archive preserves, doesn't accelerate" holds by argument, since F1 doesn't touch the storage or retrieval path.

## Files

- No CSVs produced. Benchmark rows consumed inline for last-5 means.
- Retrospective committed as the sole artefact of this attempt.

## Verdict for the project

α=0.3 fitness shaping helps Rectangle within-track (+0.043, medCp 0→1) but regresses Triangle (−0.127, medCp 2→1). As a drop-in default, it trades one track against the other. Reverted.

A future session trying tie-breaker-only shaping (option 1 above) is the natural retry — it has the same GA-signal benefit in principle (more information within a checkpoint tier) without moving the frontier between tiers. If tie-breaking alone lifts median-cp on Rectangle without hurting Triangle, it ships cleanly.
