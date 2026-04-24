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

# Verify the current wasm build still produces byte-identical output.
# Exits non-zero on drift, and prints a small window around the first
# differing byte.
node tests/hnsw-wasm-baseline/verify.mjs
```

Both scripts print three `WARN ... HNSW requested but not available`
lines — that is the behavior being pinned.

## When this baseline should change

- **Expected to change**: the wasm artifact is rebuilt with a different
  backend enabled (e.g. P3 flips the `hnsw-wasm` feature on in
  `ruvector-wasm/Cargo.toml`). After that swap, this baseline is no
  longer the ground truth — it becomes the *reference* for recall
  comparison (plan P5 requires recall@5 ≥ 0.95 vs this fixture).
- **Unexpected to change**: any edit outside the ruvector submodule, or
  a re-vendor of the same wasm artifact. A drift in those cases means
  something determinism-breaking snuck in.
