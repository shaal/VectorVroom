# F1' — Tie-breaker-only fitness shaping, attempted and reverted

**Date:** 2026-04-23
**Plan ref:** `docs/plan/ruvector-proof/f1-fitness-shaping/PROOF.md` "Retry variants" option 1.
**Outcome:** attempted, regressed Triangle, reverted. A3 state preserved.
**Parent:** the reverted F1 α=0.3 attempt (`../f1-fitness-shaping/PROOF.md`).

## What was tried

The F1 retrospective proposed three variants; F1' is option 1, the "cleanest
risk-adjusted retry": use the forward-motion accumulator *only* as a
secondary sort key within the same integer progress tier. The math guarantees
the primary `checkpointsCount + laps * cpLen` tier boundary cannot be shifted
by shaping — shaping only decides who wins when two cars tie on primary.

Design:

- `car.js` gains a per-car `shapingScore` accumulator. Each tick while
  `!damaged && speed > 0`, the car adds `(speed / maxSpeed) / 900` (900 =
  60 fps × 15 s, so max ≈ 1.0 per gen). Reversing contributes 0. Same
  accumulator as the reverted F1.
- `sim-worker.js` bestCar scan becomes a **lexicographic** tuple compare:
  primary = `checkpointsCount + laps * cpLen`; secondary = `shapingScore`.
  NOT additive — `(primary + α * shaping)` was the F1 failure mode.
- `endGen` posts `fitness = primary + 0.5 * min(1, shapingScore)` to the
  archive. The `min(1, ·)` cap keeps the shaping contribution strictly
  below one checkpoint increment, so the float serialisation in
  `meta.fitness` preserves the "primary dominates" invariant that the
  tuple compare enforces in-memory.
- `brainCodec.js` + `main.js` bumped `BRAIN_SCHEMA_VERSION` 4 → 7 (skipping
  5 for A2 and 6 for F1) so any tester whose localStorage holds a v6 brain
  from the reverted F1 attempt gets cleanly wiped.

## Measurement (n=3 each, batchSize=1000, simSpeed=100, 30 gens cold)

Same methodology as `arch-a1-prime/PROOF.md` and `f1-fitness-shaping/PROOF.md`:
pre-run `__clearArchive()` + `localStorage.removeItem('bestBrain')` to
guarantee cold state; `__runBenchmark(30, { cold: true, track, download: false })`;
mean of last-5 `survival5s`.

Machine-calibration rep (A3 Rect, code at commit `dfa4f5b`): **0.4848**
(reps 0.480, 0.509, 0.471, 0.488, 0.476), Δ −0.007 vs Phase-2 baseline 0.492.
Well within ±0.04; the machine reproduces Phase-2 numbers.

| Metric | Baseline | F1' measured | Δ | Pass |
|---|---|---|---|---|
| Rectangle cold last-5 surv@5s | 0.492 (Phase 2) | **0.5169** (reps 0.549, 0.519, 0.482) | **+0.025** | ✓ |
| **Triangle cold last-5 surv@5s** | 0.714 (Phase 2) | **0.6525** (reps 0.663, 0.620, 0.675) | **−0.0615** | **✗** |
| Rectangle cold medCheckpoints (last-5) | 0 (Phase 2) | **1** in 2/3 reps, **0** in 1/3 | mixed | partial |
| Triangle cold medCheckpoints (last-5) | 2 (Phase 2) | 1 in 3/3 reps | −1 | regression |

**Primary criterion fails on Triangle by 0.012** — outside the ±0.05 band. The
magnitude of the regression is about half what F1 α=0.3 produced (−0.127);
F1' is quantitatively milder but qualitatively the same failure pattern.

## Why F1' still hurt Triangle

The lexicographic compare mathematically guarantees no primary-tier shift —
a car with 2 CPs always beats a car with 1 CP regardless of either car's
shaping score. So the F1 α=0.3 mechanism (shaping points pushing
sub-checkpoint cars over the tier boundary) is genuinely ruled out here.

What's left is the **within-tier selection effect on the archived elite**.
Triangle's 0-CP tier is densely populated in early gens (most cars crash
before reaching the first apex). Within that tier, the "most forward motion"
car is by construction the one that drove hardest before crashing. Archiving
that brain as the gen-elite biases the ruvector seed pool toward aggressive
policies even though primary ranking was untouched. On subsequent gens, seeds
drawn from the archive carry the aggressive-policy bias, and Triangle's apex
corridors punish it the same way they punished F1's reward-driven policies.

Restated: F1 α=0.3 shifted the primary tier itself; F1' preserves the tier
but shifts the **identity of the within-tier winner**, and that identity
propagates through the archive into the next generation's seed pool. The
archive-mediated second-order effect reproduces Triangle's asymmetric
sensitivity to forward-commitment rewards — just more weakly.

This is consistent with the pattern documented in `../arch-a1/PROOF.md`,
`../f1-fitness-shaping/PROOF.md`, and the Triangle-asymmetry memory: any
reward signal that correlates with "commit forward" — primary-tier, tiebreak,
unit-vector direction, you name it — biases the Triangle archive toward
policies that crash at apex corridors. Features that preserve caution
(magnitude-scaled direction, raw raycast signals) work on both tracks; any
form of forward-motion reward shaping works on Rectangle but hurts Triangle.

## Rectangle positives (incidental)

Rect mean **+0.025** on survival — same direction as F1 α=0.3's +0.043,
smaller magnitude. Rectangle acceptance alone would be a clean pass. The
medCheckpoints bonus (Rect 0 → 1) lifted in 2 of 3 reps — same hit rate as
F1, also landing outside the baseline of 0. Like F1, the Rect-only signal
suggests the GA *is* finding more progress-reaching brains under within-tier
shaping; the within-track trade-off just continues to favour Rect at
Triangle's expense.

## Decision

Revert. Primary acceptance criterion fails on Triangle (−0.0615, outside
±0.05). Same outcome as F1 α=0.3 attempt; softer magnitude doesn't flip the
decision. Code restored to A3 state (commit `dfa4f5b`) via
`git checkout HEAD -- AI-Car-Racer/car.js AI-Car-Racer/sim-worker.js
AI-Car-Racer/brainCodec.js AI-Car-Racer/main.js`. This PROOF.md is the sole
committed artefact of the attempt.

## What this rules out

F1' tested the strongest mathematical isolation available for forward-motion
shaping — lexicographic primary/secondary with no additive coupling.
Triangle still regresses. Combined with F1 α=0.3's failure:

- **Additive shaping on the primary scalar regresses Triangle.** (F1)
- **Tie-breaker-only shaping with a bounded archive scalar regresses Triangle.** (F1' — this PROOF)

Two of the three F1 retry variants are now eliminated. Remaining:

- Option 2: α reduced to 0.05 or 0.10 (strictly additive at smaller magnitude).
  Still additive, so still shifts tier boundaries — likely to fail the same
  way F1 did, just harder to detect.
- Option 3: pair speed reward with wall-proximity penalty. This reshapes the
  reward, not just its magnitude — "reward cautious-fast driving" is the
  only formulation that doesn't blindly encourage forward commitment. It's
  harder to tune but theoretically the only one that attacks the Triangle
  failure mode at its mechanism.

Any future fitness-shaping work in this project should probably skip
option 2 and go straight to option 3, or find a Triangle-safe signal
entirely outside the forward-motion family.

## Consistency check

Same-track warm Δ was not re-measured — shaping affects which brain becomes
gen-elite but not the archive's preservation property (see five-arch-variant
replicated finding in `phase3.5-samesame/PROOF-SAME-TRACK.md`). The holds-
by-argument claim from the F1 PROOF continues to apply: F1' touches fitness
selection, not archive storage/retrieval.

## Files

No CSVs produced. `__runBenchmark` consumed with `download: false`; per-rep
last-5 means captured inline above.

## Reproducibility

Methodology identical to `arch-a1-prime/PROOF.md` §Reproducibility.
Canonical snippet, adapted for the six F1' reps:

```js
// per rep:
window.batchSize = 1000;
setSimSpeed(100);
await window.__clearArchive();
try { localStorage.removeItem('bestBrain'); } catch(_) {}
window.__switchTrackInMemory(track); // 'Rectangle' or 'Triangle'
const rows = await window.__runBenchmark(30, { cold: true, track, download: false });
const last5mean = rows.slice(-5).reduce((a,r)=>a+r.survival5s,0)/5;
```

Run against `http://localhost:8765/AI-Car-Racer/index.html` via
`./scripts/serve.sh`, F1' branch active (schema v7, `shapingScore` present
on `Car`). Reload page between reps to ensure the migrator wipes
`localStorage.bestBrain` before each cold run.

## Verdict for the project

F1' helps Rectangle within-track (+0.025, medCp 0→1 in 2/3 reps) but
regresses Triangle (−0.0615, outside ±0.05 band). As a drop-in default it
trades one track against the other — the same failure pattern as F1
α=0.3, at about half the magnitude. Reverted.

Two of three retry variants from the F1 PROOF are now eliminated by direct
measurement. Option 3 (speed reward paired with wall-proximity penalty) is
the only remaining forward-motion-family variant with a plausible path
through Triangle's apex-corridor constraint, but it's out of scope for this
session and may itself be subsumed by a different direction entirely
(Triangle-safe signals that aren't in the forward-motion family at all).
