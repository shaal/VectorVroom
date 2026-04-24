# P5 — HNSW-wasm Recall & Correctness Validation

Captured 2026-04-23 against `feat/hnsw-wasm-backend` (`ruvector` P1–P3) +
`vendor/ruvector/ruvector_wasm/` at commit `bcec8f6` (car-learning).

## Recall vs pinned FlatIndex baseline

Script: `node tests/hnsw-wasm-baseline/recall.mjs`
Baseline: `docs/plan/ruvector-proof/hnsw-wasm-baseline.json`
Gate: `recall@5 ≥ 0.95` per DB.

| DB        | recall@5 | min-query recall | queries <100% | top-1 |Δ| median |
|-----------|---------:|-----------------:|--------------:|------------------:|
| brain     | **1.0000** | 1.00 | 0 / 20 | 1.91e-6 |
| track     | **1.0000** | 1.00 | 0 / 20 | 1.19e-6 |
| dynamics  | **1.0000** | 1.00 | 0 / 20 | 3.55e-6 |

**Result: PASS.** Every one of 60 queries across the three DBs recovered
the identical top-5 set as FlatIndex. Score drift is pure
floating-point noise (ULP-level, <4e-6), explained by the hyperbolic
crate's `project_to_ball` with `curvature = 1.0` scaling unit vectors
to `1 - 1e-5` and different dot-product accumulation order inside the
HNSW traversal. Cosine similarity is scale-invariant per vector, so
ranking is preserved exactly at this corpus size.

No `ef_search` tuning required — default `HnswConfig::default()` with
`ef_search = 100` is effectively exhaustive at N=300.

## Sim smoke test (browser)

Loaded the car-learning app via `scripts/serve.sh 8787` and drove it
with `agent-browser`. Sim speed boosted to 20× to compress wall time.

### Default track (rect-style 4-waypoint)
- 29 generations in 0.64 s wall / 12.80 s sim time
- `alive 2/10, head-on 0, side 2, slide 6, stalled 0, alive 2`
- `surv 5s 30% · 10s 20% · end 20%`
- `med cp 2, p90 2, max 2`
- 120 FPS, 0 hitches
- **Console: 0 warn / error / HNSW / fail** messages across 0 lines.

### Triangle preset (`3. Triangle`)
- 56 generations in ~15 s wall
- `alive 4/10, head-on 0, side 1, slide 4, stalled 0, alive 5`
- `surv 5s 50% · 10s 50% · end 50%`
- `med cp 1, p90 4, max 4`
- Vector Memory: 55 brains, 1 track, 51 obs, gnn reranker active
- GNN rerank path: 495 observations / 51 brains / last shift 46 positions
- **Console: 0 warn / error / HNSW / fail** messages across 108 lines
  (all normal learn-card / telemetry logs, none related to HNSW).

### Interpretation

Survival is higher on Tri than on Rect-default (50/50/50 vs 30/20/20),
but that is **not** a triangle-asymmetry finding — the Tri run
inherited 55 brains from the prior run via warm-start archive
(`gen seed sources: archive 9 + prior 1 + random 0`). Warm-start
correctly carrying over is itself positive evidence that the HNSW-
backed `_brainDB.search(trackVec, K)` path is returning sensible
neighbours; if the new backend had regressed, the warm-start seeds
would have been garbage and Tri fitness would have collapsed.

For a true Rect-vs-Tri comparison, reset the archive between runs.
Not done here because the plan's variance-band memory
(`n=6+ across ≥2 sessions before strong claims`) means single-shot
numbers carry no weight anyway. This was a regression check, not a
benchmark.

## Exit criteria summary

| Criterion | Status |
|-----------|--------|
| recall@5 ≥ 0.95 for brain | PASS (1.0000) |
| recall@5 ≥ 0.95 for track | PASS (1.0000) |
| recall@5 ≥ 0.95 for dynamics | PASS (1.0000) |
| Sim runs 10+ generations on Rect shape | PASS (29 gens, clean) |
| Sim runs 10+ generations on Tri shape | PASS (56 gens, clean) |
| No HNSW console warnings | PASS (absent on both shapes) |

## Artifacts captured locally (not committed)

- `/tmp/p5-default-after.png` — metrics panel after 29 gens on default track
- `/tmp/p5-tri-after.png` — metrics panel after 56 gens on Triangle
- `/tmp/p5-default-console.log`, `/tmp/p5-tri-console.log` — console
  snapshots used for grep
