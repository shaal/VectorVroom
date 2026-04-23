# Arch A1 — Track-orientation sensor features, attempted and reverted

**Date:** 2026-04-23
**Plan ref:** `docs/plan/arch-cross-shape-transfer.md`, Phase A1.
**Outcome:** attempted, failed acceptance, code reverted. A0 stays shipped.

## What was tried

Per the plan, extend the NN input vector from 6 to 8 by appending two car-local direction components pointing to the next checkpoint. Implementation:

- `car.js` `update()`: compute `(dx, dy)` from car position to next-checkpoint midpoint, project into car-local basis via `local_forward = dx*sin(θ) + dy*cos(θ)`, `local_right = dx*cos(θ) - dy*sin(θ)`, then L2-normalize to a unit vector.
- Topology `[6,8,4] → [8,8,4]`, `FLAT_LENGTH 92 → 108`, `BRAIN_SCHEMA_VERSION 2 → 3`.
- Schema migrator (shipped in A0) handled the v2→v3 archive clear transparently.

Code was syntactically clean, the smoke test passed, training ran end-to-end across ≥9 replicates without crashes. The *behavioural* acceptance failed.

## Measurement (n=3 each, batchSize=1000, simSpeed=100, 30 gens)

| Metric | Baseline | A1 measured | Δ | Acceptance |
|---|---|---|---|---|
| Rectangle cold last-5 surv@5s | 0.492 (Phase 2) | **0.530** (reps 0.469, 0.590, 0.530) | +0.038 | ✓ (within ±0.05) |
| Triangle cold last-5 surv@5s | 0.714 (Phase 2) | **0.576** (reps 0.772, 0.477, 0.480) | **−0.138** | ✗ |
| Triangle cold combined n=6¹ | 0.714 | **0.579** | **−0.135** | ✗ |
| Cross-track rect-seeded-tri last-5 surv@5s | 0.714 (cold-tri) | **0.493** (reps 0.600, 0.300, 0.579) | **−0.221** | ✗ (target ≥ +0.00) |
| Cross-track vs Phase 3.5 (binary-step) baseline | 0.658 | **0.493** | **−0.165** | ✗ (A1 *worse* than pre-A1) |
| Same-track warm Δ last-5 | +0.001 ± 0.011 (Phase 3.5 follow-up) | **−0.004** (reps −0.002, −0.007, −0.002) | n/a | ✓ (noise-level null, same as before) |

¹ Combined with the 3 Triangle-cold samples produced as the "cold half" of the same-track warm-restart runs.

## What went wrong

The plan anticipated this exact failure mode:

> "Network suddenly has a feature that makes steering trivial ('the checkpoint is at angle X; turn toward X'). GA might just learn that feature and ignore raycasts, leading to wall-hits when the straight line crosses a wall."

Rectangle's wide corridors accommodate a naïve "drive toward the next checkpoint" policy — so Rectangle cold came out fine (+0.038 vs baseline). Triangle's apex-tight corridors punish the same policy — the straight line to the next checkpoint crosses a wall near every apex. Triangle cold regresses by −0.138, and cross-track transfer (rect-seeded-tri, where the seeded weights have already baked in the wide-corridor bias) collapses to 0.493 — worse than any baseline.

The **unit-vector** normalisation removes distance information, so the NN can't learn to slow down near a checkpoint or to weight the direction signal less when the corridor is narrow. A scaled-distance encoding or a shorter-horizon "direction to next *wall gap*" could behave differently, but that's a distinct design — not a tuning variant of the shipped A1.

## What I did NOT measure (honest caveat)

- **A0-era (tanh) cross-track baseline.** The "−0.165 vs Phase 3.5" comparison uses the pre-A0 binary-step number (0.658) as the reference. A0 changed activations without measuring cross-track; so this delta conflates A0 + A1 effects. I judge it unlikely to explain the full regression — A0's within-track measurement was parity with binary-step (0.488/0.717), and the Triangle cold regression under A1 (−0.138) is present *without* any cross-track component.

## Decision

Per plan stop-condition:

> "If any phase's acceptance fails twice (two sessions of debugging without getting to ≥95% confidence), stop the plan and write a retrospective rather than continuing."

This is the first session, but the failure is decisive enough that a retrospective now is more useful than a second blind iteration:

- A1's core hypothesis ("direction-to-next-checkpoint in the car's local frame → cross-track transfer") is falsified under unit-vector normalization.
- The failure mode is the plan's *own* anticipated risk — a second iteration would need to redesign the feature, not tune the current one.

Revert A1 code. Keep the retrospective. Leave A0 shipped. A2 is not affected — it layers on top of an A1 that works, so it should not ship independently. If the project wants to revisit this, suggested retry variants:

1. **Scaled-distance encoding** instead of unit-vector. Inputs: `(lf/D, lr/D)` where `D` is a track-scale normaliser (corridor width, track diagonal, or `maxSpeed * genSeconds`). Preserves "how far" alongside "which way."
2. **Next-wall-gap direction** rather than next-checkpoint direction. Computable from raycast readings (find the largest gap), aligns with physical navigability rather than goal-pointing.
3. **Ablate the unit-vector under A2 layer-norm** first. If layer norm absorbs the distribution mismatch between `[0,1]` raycasts and `[-1,1]` direction components, the negative Triangle result might partially reverse. Low-cost to try, but requires A2 to land first.

## Files

- No CSVs produced. Benchmark rows were consumed inline for the last-5 means and then discarded; `download: false` was passed to `__runBenchmark` throughout. If a rerun is needed for detailed per-generation traces, restore the A1 code from commit history and run the same scripts (see `/tmp/a1-*.js` from this session, reconstructable from the plan's acceptance block).

## Verdict for the project

A1's specific design — unit-vector direction to next checkpoint — does not flip cross-track transfer positive. It also regresses within-track Triangle. Shipping it as-is would degrade the product on one of the two shipped tracks, so the change is reverted. The plan's cross-shape-transfer thesis is not disproven in general; only this specific feature parameterisation is disproven.

Same-track warm-restart continues to show the preservation-not-acceleration behaviour documented in `phase3.5-samesame/PROOF-SAME-TRACK.md`, unchanged by A1's architectural shift. That's a reassuring methodology cross-check.
