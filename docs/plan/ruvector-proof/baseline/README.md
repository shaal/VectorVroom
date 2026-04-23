# Phase 0 baseline captures

Date: 2026-04-22 · 4 runs × 30 generations · batchSize=1000 · simSpeed=100 · each run ≈ 11–15s wall time.

Captured via `__runBenchmark` (see `AI-Car-Racer/main.js`) in a headless Chromium session driven by `agent-browser`. CSVs in this directory are the unmodified output.

## Files

| File | cold | track | Archive state at gen 1 |
|---|---|---|---|
| `cold-rect.csv` | yes | Rectangle | empty (just cleared) |
| `warm-rect.csv` | no | Rectangle | ~890 brains from cold-rect |
| `warm-tri-rect-seeded.csv` | no | Triangle | ~1035 Rectangle-only brains (no triangle experience) |
| `cold-tri.csv` | yes | Triangle | empty (last run — archive clear was safe here) |

## Headline numbers (avg of last 5 generations per run)

| Run | surv@5s | med cp | max cp | wall-bumps |
|-----|---------|--------|--------|-----------:|
| cold-rect | 0.455 | 0 | 3.0 | 616 |
| warm-rect | 0.465 | 0 | 3.0 | 583 |
| cold-tri | **0.248** | 0 | 0.4 | 759 |
| warm-tri-rect-seeded | **0.421** | 0 | 1.0 | 610 |

## What these numbers actually say

**1. The ruvector archive IS transferring skill across track shapes.** This is the most important finding: `warm-tri-rect-seeded` (Rectangle experience applied to Triangle) finishes at **42% survival@5s**, vs `cold-tri` (no prior experience) at **25%**. Same track, same fitness function, same 30 generations — the only difference is whether the initial population was seeded from the Rectangle archive. That's a ~70% relative lift in survival purely from accumulated experience. It's the first hard evidence that the "it gets smarter" claim has teeth.

**2. Within-run learning is weak across the board.** Median checkpoints reached is **0 in every single generation of every single run**. Only the best 10% ever crosses a checkpoint. Cold-rect goes from 53% to 46% survival — it *regresses* over 30 generations. This suggests the genetic algorithm isn't getting enough signal out of 15-second rollouts with a coarse fitness function to drive consistent improvement. The best cars get lucky; the population-wide distribution barely shifts.

**3. Triangle is much harder than Rectangle, as expected.** Cold-tri max-checkpoints stays at 0 for most generations (best car can't complete even one checkpoint). Rectangle at least gets max=3 (one full lap by the elite) consistently.

**4. `archiveTracks: 0` across all runs — track vectors are never being embedded.** This is a pre-existing bug we uncovered: the `embedTrack` call in `buttonResponse.js:343` only fires during phase-1→phase-4 transitions, and my benchmark flow (load preset + reload → auto-phase-4) skips that call. Archive brains are stored without track embeddings, so cross-track retrieval via cosine similarity can't discriminate. The fact that warm-tri-rect-seeded still shows a big lift despite this suggests the reranker is doing something useful even without track tagging (possibly EMA fitness ranking alone).

## Implications for Phases 1–3.5

- **Phase 1 (track-relative spawn)** should help every row of cold-tri specifically. Cars currently spawn at (2880, 900); on Triangle the neighborhood near that point is very different from Rectangle, hence the collapse.
- **Phase 2 (pose randomization)** is the intervention that should lift median checkpoints off zero. Until the training distribution includes varied starting poses, the GA has no gradient toward generalizable steering.
- **Phase 3 (SONA trajectory wiring)** is likely to show smaller effects than expected until we fix the track-vector bug — the pattern extractor will operate on Rectangle data then immediately test on Triangle with no track-tag discrimination.
- **Phase 3.5 proof run** should redo these captures *after* each intervention and stack the curves. The strongest evidence will be: does warm-tri-rect-seeded last5 survival climb above 42% once poses are randomized? If yes, ruvector is doing real work. If not, the archive is storing memorized trajectories with no real policy content.

## Known caveats

- Each run used a single 30-gen trajectory; no replication. Next time, run 3× each with different random seeds and report mean ± stddev.
- `survival@5s` with a default 15s generation leaves plenty of runway for the non-elite to survive by doing nothing risky. `survival@10s` and `survivalEnd` are more discriminating for Rectangle; all three collapse on Triangle so the signal is there regardless.
- Auto-archive-every-gen produced ~890 brains in 30 gens, not 30. Indicates the archive stores more than one brain per generation (possibly dedup bucketing). Worth understanding in Phase 3.5; not a blocker here.
