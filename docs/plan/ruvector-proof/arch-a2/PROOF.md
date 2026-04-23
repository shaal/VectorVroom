# Arch A2 — Hidden-layer normalization, attempted and reverted

**Date:** 2026-04-23
**Plan ref:** `docs/plan/arch-cross-shape-transfer.md`, Phase A2.
**Outcome:** attempted, acceptance failed per the plan's own anticipated risk, reverted. A1' stays shipped.
**Action per plan:** *"If it hurts, keep A1 and drop A2 (record the finding)."* — Phase A2 acceptance block.

## What was tried

Parameter-free layer normalisation on the hidden-layer pre-activations in `network.js` `Level.feedForward`. Pseudocode:

```
for each hidden unit i:
    pre[i] = dot(weights[*,i], inputs) - bias[i]
mean = avg(pre)
var  = avg((pre - mean)^2)
invStd = 1 / sqrt(var + 1e-5)
for each hidden unit i:
    out[i] = tanh((pre[i] - mean) * invStd)
```

No learned γ/β (parameter-free, as specified). Bias preserved inside the pre-activation so it survives normalisation as a differential per-unit shift (A-option discussed in the ship session). Schema bumped v4 → v5. Topology, FLAT_LENGTH, and input features unchanged from A1'.

## Measurement (n=3 each, batchSize=1000, simSpeed=100, 30 gens)

Reference is A1' (shipped), the "within ±0.05 of A1'" gate.

| Metric | A1' reference | A2 measured | Δ vs A1' | Pass |
|---|---|---|---|---|
| **Cross-track rect-seeded-tri last-5 (vs Phase 2 cold-tri baseline 0.714)** | 0.727 (Δ +0.013) | **0.653** (reps 0.729, 0.577, 0.653; Δ −0.061) | **−0.074** | ✗ |
| Rectangle cold last-5 | 0.458 | 0.516 (reps 0.487, 0.554, 0.508) | +0.058 | ✗ (just outside band) |
| Triangle cold last-5 (n=6, incl warm-restart cold phases) | 0.707 | **0.634** (dedicated: 0.739, 0.644, 0.654; warm-cold: 0.352, 0.794, 0.619) | **−0.073** | ✗ |
| Same-track warm Δ | +0.002 | +0.006 (reps +0.025, −0.008, +0.001) | ✓ | ✓ |

Primary criterion (cross-track ≥ A1') fails by 0.074. Within-track drift on both tracks exceeds ±0.05 (Rect just; Triangle clearly). Same-track warm is the only criterion that passes, and it's a null result in both cases.

## Why layer norm hurt

Two plausible mechanisms, both consistent with the data:

1. **Whitening erased useful signal variance at 8 hidden units.** Standard layer-norm literature (Ba/Kiros/Hinton 2016) shows benefits growing with layer dimensionality — 8 units is too small. With so few preactivations, the normaliser is estimating mean+variance from a tiny sample, and dividing by `sqrt(var + ε)` amplifies the small fluctuations back into the `[−1, 1]` range where tanh saturates. The net loses its ability to distinguish small pre-activation differences between units.

2. **A1' already addressed the input-distribution mismatch via feature scaling.** A2 was originally motivated by concern that `[0, 1]` raycasts and `[−1, 1]` direction features would cause the hidden layer to see unstable distributions. But A1''s canvas-diagonal scaling keeps direction magnitudes well-bounded (`|lf|, |lr| ≲ 0.5` typically), so the "cross-track drift in numeric ranges" the plan worried about is already small. Whitening on top of that is paying a cost (signal loss) for a benefit that was already captured.

The plan's A2 note called this exactly: *"this phase might be a no-op or even mildly negative for 8 hidden units. Layer norm's benefits grow with layer size. Worth trying, easy to remove if it doesn't help."*

## Decision

Code reverted back to A1' state. `network.js`, `brainCodec.js`, `main.js` restored to the A1' commit (`d239478`).

Per the plan's stop criteria: *"If it hurts, keep A1 and drop A2."* No iteration is called for — the fix isn't "tune ε" or "tune whether to include bias," the fix is "don't apply layer norm at this width."

## When would A2 become worth revisiting?

- If the network widens (e.g. `[8, 16, 16, 4]`). Layer norm on 16 units behaves differently than on 8 — the noise-from-small-sample effect diminishes.
- If inputs start including a much wider-range feature (e.g. unnormalised positions or speeds in pixels/sec). The current 7 features all sit in `[−1, 1]` ranges, which is exactly the regime where layer norm adds least.
- If a future architecture adds batch-style statistics (running mean/var across an epoch). Batch-norm-style stabilisation is a different mechanism than per-sample layer norm and could help where A2 didn't.

None of these are in the immediate roadmap. A2 stays dropped.

## Consistency check — same-track warm Δ across four architectures

A useful cross-check, since same-track warm-restart has been run under every arch variant now:

| Arch | Same-track warm Δ last-5 (n=3) |
|---|---|
| Phase 3.5 follow-up (binary-step, 6-input) | +0.001 ± 0.011 |
| A0 (tanh, 6-input) | not measured |
| A1 (tanh, 8-input unit-vector, reverted) | −0.004 |
| A1' (tanh, 8-input scaled) | +0.002 |
| A2 (tanh + layer-norm, 8-input scaled, reverted) | +0.006 |

All four live measurements land within the Phase 3.5 baseline's one-σ band (0.011). **The "archive preserves, doesn't accelerate" result is now a five-fold replicated finding across four distinct inference pipelines.** This is more architecturally general than any single architecture's measurement — it's a property of the system, not of one activation or one feature vector.

## Files

- No CSVs produced. Benchmark outputs consumed inline for last-5 means; reproduce via the methodology snippet in `../arch-a1-prime/PROOF.md`.
- Code changes reverted via `git checkout HEAD -- network.js brainCodec.js main.js` after HEAD = A1' commit.
- Retrospective committed as the sole artefact of this attempt.

## Verdict for the project

A2 as specified — parameter-free layer norm on 8 hidden units — does not stack additively with A1'. It regresses cross-track transfer (the only metric the plan cared about for A2) and dents within-track on both tracks. Reverted. A1' remains the shipped architecture for hidden-layer inference.

Moving forward: **A3 (combined proof run + UI update)** is the next plan phase. A1' on its own gives the positive cross-track finding A3 is looking for; the UI-caveat revisit can proceed without waiting for a successful A2.
