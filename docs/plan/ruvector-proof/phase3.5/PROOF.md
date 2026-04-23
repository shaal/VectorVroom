# Phase 3.5 — Ruvector cross-track transfer proof run

**Date:** 2026-04-22
**Question:** Does ruvector's archive + SONA pattern bank make cars measurably smarter on a track they haven't been trained on?

**Short answer:** **No — not with the current seeding mechanism.** Rectangle-trained brains seeded into a fresh Triangle population *hurt* Triangle performance relative to cold-starting on Triangle. Phase 1's track-relative spawn is the real cross-shape generalization mechanism; ruvector's archive works for same-track warm-restarts but not for different-shape transfer.

This is a genuine finding, not a Phase 3.5 failure. The experiment did what it was designed to do: measure, and report honestly.

## Design

For each of 3 replicates:
1. `__clearArchive()` — wipe brain archive and IndexedDB
2. Train 30 generations on **Rectangle** (cold=true) at batchSize=1000, simSpeed=100, offset-forward spawn, jitter off. Archive fills with ~30 Rectangle brains.
3. `__switchTrackInMemory('Triangle')` — rebuilds `road.borders` / `road.checkPointList` and re-embeds the track vector without a page reload, so the SONA pattern bank persists.
4. Train 30 generations on **Triangle** (cold=false — archive keeps the 30 Rectangle brains and whatever SONA patterns crystallized on Rectangle).
5. Record gen-0, gen-1, gen-2, and last-5-generation averages.

**Control:** Phase 2 `cold-tri` runs (3 replicates) — Triangle with empty archive and no prior track experience.

## Results

### Triangle survival@5s

| Metric | Phase 2 cold-tri (control, n=3) | Phase 3.5 rect-seeded-tri (n=3) |
|---|---|---|
| Mean gen-0 | ~0.65 (varies 0.535–0.804) | **0.519 ± 0.127** |
| Mean last-5 | 0.714 ± 0.066 | **0.658 ± 0.030** |

**Rectangle-seeded archive on Triangle performs worse than empty archive on Triangle, at both the first generation and across the full 30-gen run.** The last-5 gap (0.714 → 0.658, −8%) is roughly 1σ of the control's stddev; the gen-0 gap is larger (~−0.13). Not a massive regression, but definitely not the lift the plan was looking for.

### Per-replicate detail

| Replicate | Patterns in bank at Tri start | Gen-0 surv5 | Gen-1 surv5 | Last-5 surv5 | Last-5 med cp |
|---|---|---|---|---|---|
| r1 | ~0 (fresh SONA agent) | 0.697 | 0.682 | 0.689 | 1 |
| r2 | 32 (accumulated Rect+Tri patterns from r1) | 0.448 | 0.530 | 0.618 | 1 |
| r3 | 64 | 0.411 | 0.421 | 0.667 | 1 |

The decline from r1 → r3 in gen-0 survival is suggestive but confounded: `cold=true` on the Rectangle phase clears the brain archive but NOT the SONA pattern bank, so patterns accumulate across reps in this design. Either:
- Patterns from a *different* track actively interfere (consistent with the overall finding that Rectangle→Triangle transfer hurts)
- Pure random-seed variance at n=3

Can't distinguish these without a proper A/B where patterns are cleared between reps.

## Interpretation

**Why Rectangle-seeded brains hurt Triangle performance.** The 6→8→4 MLP sees heading-relative sensor readings plus speed. On Rectangle, the weights specialize to the particular *sequence of sensor patterns* that its rectangular corridor produces — short-long-short readings on straights, symmetric spikes on the 90° corners. On the Triangle, the corridor produces a different sequence (long readings on the open right side, narrow-narrow on the apex approach). Weights that encoded "when sensor 0 reads short, turn left" might make exactly the wrong move when sensor 0 is short for a different geometric reason.

The GA's elite-inheritance logic then has to *unlearn* the Rectangle bias before it can make progress on Triangle — which costs generations. An empty-archive Triangle run skips that unlearning step.

**What actually generalizes across track shapes (per prior phases).** Heading-relative sensors (car.js:177-180) plus track-relative spawn (Phase 1). These make the *input distribution* at the start of each generation similar across tracks, so a random-init GA finds basic driving behavior fast. Phase 2 confirmed this: track-relative spawn alone took Triangle survival from 0.248 → 0.714 with zero architectural changes.

**What this means for ruvector's value proposition.** The archive + SONA are valuable for **same-track continuation** (warm-restart a track you've trained on before) — that's where storing brain weights and successful trajectory patterns pays off, because the input distribution is identical. They are **not** a cross-shape transfer mechanism in the current system. That role belongs to the sensor model + the spawn rule, which don't need persistent storage.

## Caveats

1. **n=3 replicates.** The point estimates are unstable (r1 gen-0 = 0.697 is well above the Phase 2 control mean; r2/r3 are well below). A 5-replicate or 10-replicate study would sharpen error bars.
2. **Pattern bank accumulates across replicates.** `cold=true` clears brains, not patterns. Cleaner design would force a pattern-bank reset between reps.
3. **Only one cross-shape pair tested** (Rectangle → Triangle). Rect → Oval, Tri → Oval, etc. untested.
4. **30-gen horizon is short.** Maybe Rect-seeded brains eventually outperform cold-Tri after 100+ generations by finding a shared driving primitive. Didn't measure.
5. **SONA pattern-bank transfer specifically was tested.** The bridge also supports reranker-based seed selection and LoRA track-adapter drift; those weren't A/B tested in this run. Different question, separate experiment.

## What to do with this finding

- **Leave the archive seeding on by default.** It doesn't help cross-shape, but Phase 0's baseline showed it helps same-track warm-restart (cold-rect → warm-rect had a small positive delta). Don't pay for a feature that helps sometimes by turning it off.
- **Don't claim cross-track transfer in the UI.** If the user's mental model is "train on one shape, it'll know the next," the data says that's not what happens.
- **Re-test after sensor or network changes.** If the NN gets a normalization layer or the sensors get track-orientation features, cross-shape transfer might start working — re-run this experiment.
- **Optional follow-up:** test same-track warm-restart with Phase 3's SONA wiring on. Control: cold-rect. Treatment: cold-rect followed by warm-rect (same track). Does pattern bank + archive lift gen-0 of warm-rect? That's the scenario where ruvector's architecture is *designed* to help.

## Files

- `r1-rect.csv`, `r1-tri.csv` — replicate 1 (Rectangle phase + Triangle phase)
- `r2-rect.csv`, `r2-tri.csv` — replicate 2
- `r3-rect.csv`, `r3-tri.csv` — replicate 3

All CSVs use the standard schema (see `AI-Car-Racer/main.js __downloadCSV`). Row 0 per file = generation 0.
