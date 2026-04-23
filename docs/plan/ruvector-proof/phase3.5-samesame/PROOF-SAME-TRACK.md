# Phase 3.5 follow-up — Same-track warm-restart proof run

**Date:** 2026-04-22
**Question:** Does ruvector's archive + SONA patterns make **same-track** warm-restart measurably better than cold-restart on that track? This is the scenario ruvector is architecturally *designed* to help; the cross-track version (earlier Phase 3.5) showed the archive hurts on shape mismatch.

**Short answer:** **No, not at the 30-gen horizon.** Warm-restart preserves what the prior session already learned — it doesn't accelerate further learning. If the cold phase performed well, the warm phase starts well. If the cold phase was mediocre, the warm phase stays mediocre. Last-5 averages are indistinguishable between cold and warm.

The interesting diagnostic finding: **the GA plateaus at ~30 generations with batch=1000.** Adding another 30 gens doesn't extract more signal. That's a training-recipe finding, not a ruvector finding.

## Design

Per replicate (n=3), all on the Triangle preset, batchSize=1000, simSpeed=100, offset-forward spawn, jitter off:

1. `__clearArchive()` — wipe brain archive + IndexedDB
2. Run 30 generations `cold` (archive empty at gen-0) — `cold.csv`
3. Without any reset, run 30 generations `warm` (archive has ~30 brains + accumulated SONA patterns from step 2) — `warm.csv`
4. Compare `cold` gen-0 and last-5 to `warm` gen-0 and last-5.

The `__switchTrackInMemory` helper is idempotent on the already-loaded track but still ensures SONA pattern state persists (no page reload in the loop).

## Results

### Per-replicate summary (survival@5s)

| Rep | Cold gen-0 | Cold gen-1 | Cold last-5 | Warm gen-0 | Warm last-5 | Δ gen-0 | Δ last-5 |
|-----|------------|------------|-------------|------------|-------------|---------|----------|
| r1  | 0.540      | 0.734      | 0.760       | 0.767      | 0.753       | **+0.227** | −0.007 |
| r2  | 0.579      | 0.455      | 0.458       | 0.453      | 0.453       | **−0.126** | −0.005 |
| r3  | 0.539      | 0.431      | 0.444       | 0.439      | 0.459       | **−0.100** | +0.015 |

### Aggregated deltas (warm − cold, n=3)

| Metric | Mean | Stddev | Interpretation |
|---|---|---|---|
| Δ gen-0 surv@5s | **+0.000** | 0.165 | Zero, huge variance — no signal |
| Δ last-5 surv@5s | **+0.001** | 0.011 | Zero, tight variance — real null result |

## What happened

The gen-0 delta isn't really measuring what I thought it was measuring. It's measuring:

> `(warm gen-0)` ≈ `(cold last-5)` ≈ "whatever state the cold phase ended in."

This is visible in every row:
- r1: cold last-5 = 0.760; warm gen-0 = 0.767. Difference: 0.007.
- r2: cold last-5 = 0.458; warm gen-0 = 0.453. Difference: 0.005.
- r3: cold last-5 = 0.444; warm gen-0 = 0.439. Difference: 0.005.

**The archive is faithful to the state it captured.** Warm-restart resumes where cold stopped. It doesn't find a better basin than cold did; it doesn't degrade gains either.

The apparent gen-0 Δ mean of zero is an artifact of comparing two different things:
- `cold gen-0` = random-init population performance (narrow range 0.54–0.58)
- `warm gen-0` = population seeded from prior archive (range 0.44–0.77)

Subtracting these tells you "did cold training help or not," not "did warm-restart help." Across three reps, cold training helped once (r1: 0.54 → 0.76) and not much twice (r2: 0.58 → 0.46, r3: 0.54 → 0.44). The archive faithfully reflects those three outcomes.

## The actual null result

**Δ last-5 ≈ 0 with tight stddev (0.011).** This is the clean finding. Running another 30 generations on the *same* track after a 30-gen cold start produces no measurable improvement. The population plateaus.

This implies:
1. 30 generations × 1000 cars is the point where the current GA + fitness function extract all the signal they can from a Triangle corridor.
2. The archive's ability to seed future generations with "good brains" doesn't help push past that plateau — the brains you'd seed with are the same brains already being mutated.
3. SONA pattern bank (which grew from 0 to 32 in r1, 32→64 in r2, 64→96 in r3) isn't moving the needle within 30 additional gens.

## Ruvector's value, re-characterized

Across both 3.5 experiments we now have three data points:

| Scenario | Archive+SONA effect |
|---|---|
| Cross-track (Rect→Tri, earlier Phase 3.5) | **Hurts** (−0.056 last-5 survival) |
| Same-track continuation, gen-0 | Preserves prior state (not a gain, not a loss) |
| Same-track continuation, last-5 | **Null** (+0.001 ± 0.011) |

So the archive's measurable behavior is **preservation, not acceleration**. This is consistent with its design — it stores weight vectors, and seeding from them resumes training at the checkpoint the weights represent. It is *not* doing meta-learning or extracting transferable skill in the current setup.

Where this feature could still be valuable (not tested here):
- Across page reloads (user trains Monday, comes back Tuesday — archive restores progress).
- As a safety net against a bad mutation generation (best-of-all-time seeding beats elite-of-last-gen).
- With a fitness function that escapes the 30-gen plateau — e.g. training horizon of 100+ gens, or shaped rewards that expose more signal.

## Caveats

1. **n=3** is too small for the gen-0 delta (σ=0.165). Even at n=10, the gen-0 metric is confounded by cold-phase outcome variance. Better metric: Δ last-5, which already converges cleanly at n=3.
2. **30-gen horizon.** At 60 gens (cold+warm) the population plateaus. A longer horizon (100+ gens cold then 30 gens warm) might show different dynamics if GA can continue to learn.
3. **Single track** (Triangle). Rectangle might show different warm-restart behavior because it's easier; we already know its elite hits max_cp=3 from gen 1.
4. **Pattern bank accumulates across reps.** r1 starts with 0 patterns, r3 starts with 64. Absolute numbers shift across reps but delta within each rep is independent.
5. **Elite-inheritance is already a form of warm-restart.** Every generation seeds from the previous best. Warm-restart vs cold-restart tests whether the *archive's* seeding adds value on top of elite inheritance. The answer seems to be: no additional value when the GA has plateaued.

## Files

- `r{1,2,3}-cold.csv` — gens 0–29 (archive empty at gen 0)
- `r{1,2,3}-warm.csv` — gens 30–59 (archive populated by the cold phase)

## Verdict for the project

Take this together with the earlier Phase 3.5 cross-track finding:

> **Ruvector's archive and SONA pattern bank preserve state; they do not, in the current architecture, extract transferable skill.** They work as a save-load mechanism, not as a learning accelerator.

That still makes the feature worth keeping — users coming back to the same track in a future session benefit from archived progress. But any claim that it makes the AI "smarter across sessions" or "carries experience to new tracks" overstates. The UI should reflect "your best brains are remembered" rather than "the AI gets smarter over time."
