# P6 — HNSW-wasm search-latency A/B

Captured 2026-04-24. Node v22.22.0. wasm from
`vendor/ruvector/ruvector_wasm/ruvector_wasm_bg.wasm`.

## Methodology

Same wasm build, two DB instances per section: one with
`new VectorDB(dim, 'cosine')` (HNSW-backed via `hnsw-wasm` feature)
and one with `new VectorDB(dim, 'cosine', false)` (FlatIndex, the
`else` branch in `vector_db.rs` when `hnsw_config = None`).
Both DBs populated with the same deterministic 300-vec corpus.
50 × 20 = 1000 timed `.search(q, 5)` calls per
combination, preceded by 200 warmup queries discarded.

Ran in Node, not the browser. Same wasm bytecode, but Node has less
UI-thread jitter and sharper `performance.now()` resolution —
cleaner numbers for the wasm-internal search path which is what the
bridge pays to call either way.

## Results (microseconds per `.search()`)

| DB | dim | backend | p50 | p95 | p99 | mean |
|----|----:|---------|----:|----:|----:|-----:|
| brain | 244 | HNSW | 166.7 | 190.2 | 245.6 | 170.8 |
| brain | 244 | FlatIndex | 96.5 | 110.4 | 131.5 | 101.8 |
| track | 512 | HNSW | 251.4 | 326.5 | 502.5 | 266.8 |
| track | 512 | FlatIndex | 179.4 | 219.5 | 317.2 | 190.3 |
| dynamics | 64 | HNSW | 100.6 | 115.2 | 209.9 | 109.6 |
| dynamics | 64 | FlatIndex | 37.3 | 43.7 | 81.4 | 44.2 |

### HNSW / Flat ratio (p50)

| DB | dim | ratio |
|----|----:|------:|
| brain | 244 | 1.73× |
| track | 512 | 1.40× |
| dynamics | 64 | 2.70× |

## Interpretation

HNSW has O(log N) asymptotic search complexity with large
constants; FlatIndex is O(N) with very small constants and
cache-friendly linear access. The crossover where HNSW wins is
typically N ≈ 10⁴ – 10⁵. At N = 300, FlatIndex is expected to
win on absolute latency — capability (not performance) was the
goal of this migration, and recall@5 = 1.0000 (P5) confirms the
HNSW backend is behaviorally equivalent to FlatIndex at this
scale. Keep this file as evidence so nobody proposes "switching
back to FlatIndex for speed" without recognising the capability
tradeoff.

### Frame-budget sanity check

At 60 FPS the per-frame budget is 16,667 µs. The worst observed tail
(track HNSW p99 ≈ 500 µs) consumes ~3% of one frame; the common case
(brain HNSW p50 ≈ 170 µs) is ~1%. In the actual app the bridge's
`ruvector.query()` fires once per parent selection, not per frame —
so even the pessimistic framing overstates impact. The measured sim
at P5 ran a steady 120 FPS with 0 hitches on both the default and
Triangle tracks under the HNSW backend.

### Why dynamics takes the biggest penalty (2.70×)

FlatIndex at low-dim / low-N is a tight cache-friendly loop — 300 ×
64-dim × 4 bytes ≈ 77 KB, comfortably in L1 data cache on any
modern CPU. Every cosine is just a short SIMD-friendly reduction.
HNSW still pays graph-traversal overhead (visiting ~`ef_search`
nodes, irregular memory access, plus the `project_to_ball` query-
time shrink) regardless of dim. At 512-dim (track) FlatIndex spends
more time in the per-cosine inner loop, so HNSW's "visit fewer
vectors" payoff closes the ratio to 1.40×. Brain at 244-dim sits
between.

### Re-running

`node tests/hnsw-wasm-baseline/latency.mjs`. Two back-to-back runs
during P6 produced ratios 1.71/1.42/2.62× and 1.73/1.40/2.70× —
stable within 5%, so session-to-session jitter is low for this
harness. What matters is the ratio shape (HNSW > FlatIndex at this
N), not absolute µs, which will shift with CPU / Node version.
