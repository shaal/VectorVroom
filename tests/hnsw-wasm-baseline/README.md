# hnsw-wasm-baseline

Deterministic snapshot of the current ruvector WASM search behavior, used
as a ground-truth reference while the `ruvector-core` wasm build is
migrated from the FlatIndex fallback to a true HNSW backend.

See `docs/plan/ruvector-hnsw-in-wasm.md` for the migration plan. This
directory implements that plan's **P0 — Baseline capture** phase.

## What it pins

For each of the three DBs the bridge constructs
(`ruvectorBridge.js:202-204`):

| DB        | Dim | Corpus size | Queries | K |
|-----------|-----|-------------|---------|---|
| brain     | 244 | 300         | 20      | 5 |
| track     | 512 | 300         | 20      | 5 |
| dynamics  |  64 | 300         | 20      | 5 |

All vectors and queries are generated from fixed `mulberry32` seeds so
the fixture is stable across runs. Scores are cosine distance, rounded
to 9 decimal places (more than enough to detect real reordering; avoids
trailing-ULP diff noise).

The committed JSON lives at
`docs/plan/ruvector-proof/hnsw-wasm-baseline.json`.

## Commands

```
# Regenerate the fixture (needed only if you deliberately change the
# generator — corpus size, query count, etc.)
node tests/hnsw-wasm-baseline/build.mjs

# Verify the current wasm build produces byte-identical output. Now
# expected to FAIL since the hnsw-wasm backend shipped — kept because
# it was the original pass gate and still useful if someone reverts
# the backend.
node tests/hnsw-wasm-baseline/verify.mjs

# Measure recall@K of the current wasm HNSW against the pinned
# FlatIndex baseline. This is the live correctness gate. Exits
# non-zero if any DB is below 0.95. See
# docs/plan/ruvector-proof/hnsw-wasm-recall.md for P5's result.
node tests/hnsw-wasm-baseline/recall.mjs
```

Both scripts print three `WARN ... HNSW requested but not available`
lines — that is the behavior being pinned.

## Current status (post-P4)

The `hnsw-wasm` backend is now live in `vendor/ruvector/ruvector_wasm/`,
so `verify.mjs` is **expected to fail** with ULP-level score drift
(matching top-K IDs for small-N queries). That is the correct new
behavior: the baseline is now a **recall reference** used by the P5
validation script, not a pass gate.

## When this baseline should change

- **Expected to change**: never again under normal development. This
  file is a historical snapshot of FlatIndex top-K behavior, pinned so
  the HNSW → flat swap could be measured. If you regenerate it, you
  are resetting the recall reference; do that only if the underlying
  corpus fixture intentionally changes (`N_PER_DB`, `N_QUERIES`,
  seeds).
- **Unexpected to change**: the generator (`generate.mjs`) drifts.
  Since the current wasm is HNSW-backed, a fresh generator run is
  already non-identical to this file — that's fine. What would be
  surprising is if two back-to-back `build.mjs` runs diverged from
  each other (that would indicate non-determinism in the HNSW
  construction, which uses `rand::random()` for level selection).
