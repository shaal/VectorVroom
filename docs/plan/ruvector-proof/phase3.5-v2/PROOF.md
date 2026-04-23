# Phase 3.5-v2 — Cross-shape transfer re-measured under Arch A1'

**Date:** 2026-04-23
**Code state:** A0 + A1' shipped (tanh hidden, scaled-distance direction features, schema v4). A1 and A2 attempted + reverted.
**Plan ref:** `docs/plan/arch-cross-shape-transfer.md`, Phase A3.
**Short answer:** cross-shape transfer is now **directional, roughly neutral, and architecturally safer** than under the pre-A0 code. The Phase 3.5 "actively hurts" result is gone. A positive Tri→Rect result appears; Rect→Tri stays roughly neutral. Save-and-resume on the same track remains the behaviour the archive most reliably delivers (unchanged since Phase 3.5 follow-up).

## Design

Per direction, n=3 replicates at batchSize=1000, simSpeed=100, 30 gens:

1. `__clearArchive()` — wipe brain archive + IndexedDB. SONA engine also resets via `sonaEngineDebugReset()`.
2. `__switchTrackInMemory(A)` — load source track.
3. 30 gens cold on A — archive fills with ~30 A-trained brains.
4. `__switchTrackInMemory(B)` — switch to target track (SONA pattern bank + track adapter preserved across the switch).
5. 30 gens on B with `cold: false` — population seeded from the A-archive.
6. Record last-5 survival@5s on both phases.

Two directions: Rect→Tri (matching Phase 3.5) and Tri→Rect (new, A3-specified).

## Headline numbers (survival@5s, last-5-generation mean)

| Direction | Phase 3.5 (pre-A0) | A1' session (2026-04-23) | A3 re-run (2026-04-23) | Combined n=6 |
|---|---|---|---|---|
| Rect→Tri | 0.658 (n=3) | 0.727 (n=3) | 0.638 (n=3) | **0.683** |
| Tri→Rect | not measured | not measured | 0.548 (n=3) | **0.548** (n=3) |

Baselines (Phase 2 cold, n=3 per shape, pre-A0):

| Track | Phase 2 baseline |
|---|---|
| Rectangle cold | 0.492 |
| Triangle cold | 0.714 |

### Deltas

| Metric | Value | Notes |
|---|---|---|
| Rect→Tri Δ vs cold-tri baseline (Phase 3.5) | **−0.056** | actively hurts; prior state |
| Rect→Tri Δ vs cold-tri baseline (A3 n=6) | **−0.031** | approximately neutral; A1' improved this ~2× |
| Tri→Rect Δ vs cold-rect baseline (A3 n=3) | **+0.056** | positive cross-track transfer, first time |

## Per-replicate detail

### Rect→Tri, A3 session

| Rep | Rect phase last-5 | Tri (rect-seeded) last-5 | Δ vs 0.714 |
|---|---|---|---|
| 1 | 0.604 | 0.610 | −0.104 |
| 2 | 0.491 | 0.730 | +0.016 |
| 3 | 0.547 | 0.575 | −0.139 |
| **mean** | **0.547** | **0.638** | **−0.076** |

### Tri→Rect, A3 session (new direction)

| Rep | Tri phase last-5 | Rect (tri-seeded) last-5 | Δ vs 0.492 |
|---|---|---|---|
| 1 | 0.784 | 0.568 | +0.076 |
| 2 | 0.637 | 0.517 | +0.025 |
| 3 | 0.794 | 0.560 | +0.068 |
| **mean** | **0.738** | **0.548** | **+0.056** |

All three Tri→Rect reps show positive cross-track Δ. Tight cluster (0.517–0.568). This is the clearest cross-track positive in the project so far.

## Interpretation

**Two findings, both novel:**

1. **A1' eliminated the "actively hurts" failure mode** that Phase 3.5 originally documented. At n=6, Rect→Tri is no longer reliably below cold-tri baseline — the Δ moved from **−0.056** (Phase 3.5) to **−0.031** (A1' + A3 combined). Whether you call that a fix depends on your threshold: the sign didn't flip at n=6, but the magnitude halved.

2. **Cross-shape transfer is direction-asymmetric.** Tri→Rect is positive (+0.056 at n=3); Rect→Tri is neutral/slightly negative (−0.031 at n=6). One plausible mechanism: Triangle's tight corridors force the GA to evolve more cautious, wall-proximity-sensitive behaviour — those weights still work on Rectangle's wider corridors. Rectangle's wider corridors let the GA evolve behaviours that *over-trust* straight lines, which then fail at Triangle apexes. Curriculum-learning intuition: train on harder first.

The direction asymmetry echoes the Phase 0 baseline finding that Triangle is measurably harder than Rectangle (cold-tri max cp was 0.4, cold-rect was 3.0 in the original Phase 0 captures). Triangle stresses the architecture more, so the brains that survive there have broader applicability.

## Same-track warm-restart (v2)

Not re-run in A3 — the A1' session already measured n=3 on Triangle:

| Rep | Cold last-5 | Warm last-5 | Δ |
|---|---|---|---|
| 1 | 0.759 | 0.756 | −0.003 |
| 2 | 0.587 | 0.595 | +0.008 |
| 3 | 0.541 | 0.542 | +0.001 |
| **mean Δ** | | | **+0.002** |

Replicates the Phase 3.5 follow-up finding (+0.001 ± 0.011). The archive's "save-and-resume" behaviour is **stable across all four architectural variants** now:

| Arch variant | Same-track warm Δ last-5 |
|---|---|
| Pre-A0 (binary step, 6→8→4) | +0.001 ± 0.011 |
| A1 (reverted, unit-vector) | −0.004 |
| A1' (shipped, scaled-distance) | +0.002 |
| A2 (reverted, layer-norm) | +0.006 |

All within the one-σ band of the original measurement. This is an architectural property of the system, not an artifact of any one configuration: **the archive preserves prior state faithfully; it does not accelerate learning beyond the GA's 30-gen plateau**. Five replications across four architectures is enough evidence to stop re-measuring this.

## Caveats

1. **n=3 is small for cross-track metrics.** Session-to-session variance bit us: A1' session's Rect→Tri mean 0.727 looked like a clean positive result; A3 rerun's 0.638 put it at ~neutral. Honest answer needs n=6 at minimum, and we only have that on one direction. Tri→Rect is n=3; a second session could reveal the same kind of variance.
2. **SONA pattern bank carries state across replicates within a session** (the engine only resets on `_debugReset`, which `__clearArchive` does call). So reps 1/2/3 within a session are not fully independent — pattern variance tied to seeding stays correlated. Cross-session independence is cleaner; that's why A1' session and A3 session give different means even for the "same" experiment.
3. **Same-track warm-restart only tested on Triangle.** Rectangle same-track warm not measured. Plausibly the same null result based on 4-architecture consistency, but not directly verified.
4. **Only two track shapes tested.** The project has 10 presets; cross-shape transfer across, say, Zigzag→Rectangle or Figure-8→Triangle is untested. Rectangle and Triangle were picked as wide/easy vs tight/hard extremes; intermediate shapes could give intermediate results.

## What this means for the product

- The pre-A1' "cross-shape transfer actively hurts" caveat is no longer accurate and should be softened.
- A triumphant "cross-shape transfer works!" overclaim would also be inaccurate — the data shows a directional effect with meaningful variance, not a clean lift.
- The honest framing is: the archive is a faithful save-and-resume mechanism; with A1's track-orientation features, cross-shape transfer is no longer actively harmful, and training on harder tracks first shows modest positive transfer to easier ones.

## Files

- `r{1,2,3}-rect.csv` — Rect→Tri, Rectangle phase (30 gens each)
- `r{1,2,3}-tri-from-rect.csv` — Rect→Tri, Triangle phase (seeded from Rectangle)
- `r{1,2,3}-tri.csv` — Tri→Rect, Triangle phase (30 gens each)
- `r{1,2,3}-rect-from-tri.csv` — Tri→Rect, Rectangle phase (seeded from Triangle)

All CSVs share the schema emitted by `__runBenchmark` (see `main.js`). Each row is one generation.
