# Enable HNSW in the ruvector WASM build

**Status:** In progress — P0 done, P1 next
**Owner:** Ofer (with Claude)
**Created:** 2026-04-23
**Scope:** `ruvector/` submodule + `AI-Car-Racer/ruvectorBridge.js` + `vendor/ruvector/ruvector_wasm/*`

## Context / problem

Browser console shows, three times per page load:

```
WARN crates/ruvector-core/src/vector_db.rs:93
HNSW requested but not available (WASM build), using flat index
```

Root cause: `AI-Car-Racer/ruvectorBridge.js:202-204` constructs three `VectorDB` instances without the third `use_hnsw` arg, so the WASM constructor defaults to `true` and requests HNSW. `ruvector-core` is built with `default-features = false, features = ["memory-only"]` (no `hnsw` feature), because the default `hnsw_rs` backend pulls in `mmap-rs`, `rayon`, `num_cpus`, and `cpu-time` — all incompatible with `wasm32-unknown-unknown`. `vector_db.rs:84-95` logs the warning and falls back to `FlatIndex`.

## Why the "full" solution, not "silence the warning"

The user accepts that at the current workload (N≈300 per index, 48-D cosine) FlatIndex is already microseconds per query and HNSW won't measurably win. The goal here is **capability**, not present-moment performance: ruvector-core should be able to serve a real ANN index to wasm clients so future datasets and other demos are unblocked without re-plumbing.

## The lucky break: donor code already exists

`ruvector/crates/ruvector-hyperbolic-hnsw/src/hnsw.rs` (650 lines) implements HNSW in pure safe Rust with:
- `DistanceMetric::Poincare | Euclidean | Cosine | Hybrid`
- Public API: `HyperbolicHnsw::new(config)`, `.insert(vec) -> usize`, `.insert_batch(vecs)`, `.search(query, k) -> Vec<SearchResult>`
- `rayon` gated behind `feature = "parallel"` (off by default when `default-features = false`)
- No filesystem, no threads, no `mmap-rs`, no `cpu-time` — builds for wasm32 today (`ruvector-hyperbolic-hnsw-wasm` is the proof)

Only gap vs `VectorIndex` trait: no `remove(id)` — same limitation as `hnsw_rs` (see `index/hnsw.rs:339` comment). We'll tombstone.

## Plan

Six phases. Phases 1–5 are strictly sequential. Phase 0 is capture-before-we-change.

### P0 — Baseline capture (no code changes) — **DONE**

Deterministic Node harness under `tests/hnsw-wasm-baseline/` loads the
vendored wasm via `initSync`, constructs the three DBs the bridge
constructs (`new VectorDB(dim, 'cosine')` — no third arg, so the wasm
falls back to FlatIndex and logs the warning, matching production), runs
a fixed 20 queries × top-5 sweep per DB, and writes the committed fixture
to `docs/plan/ruvector-proof/hnsw-wasm-baseline.json`.

**Exit criteria met:**
- Fixture committed (1517-line JSON, `_doc` field self-describes scope).
- `node tests/hnsw-wasm-baseline/verify.mjs` asserts byte-identity; three
  fresh-process runs and two back-to-back in-process runs all pass.
- Three `HNSW requested but not available` warnings fire during the
  baseline run, confirming we are truly pinning the FlatIndex path.

**Re-run after any ruvector-wasm rebuild** to check whether the swap is
still exact (P1–P3) or now drifts because HNSW is live (P5 — at which
point byte-identity flips from a pass gate to a recall-comparison
reference).

### P1 — New `HnswWasmIndex` backend inside ruvector-core

Files touched:
- `ruvector/crates/ruvector-core/Cargo.toml` — add feature `hnsw-wasm = ["ruvector-hyperbolic-hnsw"]`; add optional dep `ruvector-hyperbolic-hnsw = { path = "../ruvector-hyperbolic-hnsw", default-features = false, optional = true }`. Do **not** enable `parallel` or `simd` on the hyperbolic crate — those break wasm.
- `ruvector/crates/ruvector-core/src/index.rs` — add `#[cfg(feature = "hnsw-wasm")] pub mod hnsw_wasm;`
- `ruvector/crates/ruvector-core/src/index/hnsw_wasm.rs` (new, ~150 lines):
  - `pub struct HnswWasmIndex { inner: HyperbolicHnsw, id_map: Vec<VectorId>, tombstones: BitVec }`
  - `new(dimensions, distance_metric, hnsw_config)` — map core's `DistanceMetric::Cosine` / `Euclidean` to the hyperbolic crate's variants; `Manhattan` / `DotProduct` → error ("unsupported in wasm HNSW").
  - `impl VectorIndex`: `add` appends to `id_map` and calls `.insert`; `search` calls `.search` then translates internal `usize` → `VectorId` via `id_map` and filters tombstoned entries; `remove` marks tombstone (returns true if was present).
  - Unit tests: build→insert→search→remove cycle, round-trip with a known k=5 query, tombstone skip.

**Exit criteria:** `cargo test -p ruvector-core --no-default-features --features memory-only,uuid-support,hnsw-wasm --target wasm32-unknown-unknown` passes *(or, if wasm32 test runner is unavailable, the equivalent test under default target with all non-wasm features off)*.

### P2 — Wire into `vector_db.rs`

Change `ruvector/crates/ruvector-core/src/vector_db.rs:82-99`:

```rust
let mut index: Box<dyn VectorIndex> = if let Some(hnsw_config) = &options.hnsw_config {
    #[cfg(feature = "hnsw")]
    { Box::new(HnswIndex::new(...)?) }

    #[cfg(all(not(feature = "hnsw"), feature = "hnsw-wasm"))]
    { Box::new(HnswWasmIndex::new(
        options.dimensions, options.distance_metric, hnsw_config.clone(),
    )?) }

    #[cfg(all(not(feature = "hnsw"), not(feature = "hnsw-wasm")))]
    {
        tracing::warn!("HNSW requested but no backend available, using flat");
        Box::new(FlatIndex::new(options.dimensions, options.distance_metric))
    }
} else {
    Box::new(FlatIndex::new(...))
};
```

**Exit criteria:** `cargo check -p ruvector-core` with each feature permutation compiles.

### P3 — Flip the feature on in `ruvector-wasm`

`ruvector/crates/ruvector-wasm/Cargo.toml:16` — change:
```toml
ruvector-core = { path = "../ruvector-core", default-features = false, features = ["memory-only", "uuid-support"] }
```
to add `"hnsw-wasm"` to the features list.

**Exit criteria:** `cargo build -p ruvector-wasm --target wasm32-unknown-unknown --release` succeeds.

### P4 — Rebuild + re-vendor the wasm artifact

This is the awkward part (user's memory note on "ruvector upstream patches" flagged this pipeline).

Steps:
1. `cd ruvector/crates/ruvector-wasm && wasm-pack build --target web --release` (produces `pkg/`).
2. Record old size: `du -sh vendor/ruvector/ruvector_wasm/` and `wc -c vendor/ruvector/ruvector_wasm/ruvector_wasm_bg.wasm`.
3. Copy `pkg/*` → `vendor/ruvector/ruvector_wasm/`, preserving the ESM entry point name used by the bridge (`ruvector_wasm.js`).
4. Record new size; expect growth on the order of tens of KB (hyperbolic HNSW module isn't free).
5. Commit vendor delta separately from the Rust changes for clean review.

**Exit criteria:** `npm run dev` boots the app; console shows no "HNSW not available" warning; the three bridge DBs construct without error.

**Risk:** If bundle size balloons (>100 KB added), reconsider — user may prefer a slimmer backend or to revert. Halt and report size delta before proceeding to P5.

### P5 — Recall & correctness validation

Run the baseline harness from P0 against the new HNSW-backed build:
1. Compare top-K sets — expect **recall@5 ≥ 0.95** with `ef_search = 50` (default). If below, raise `ef_search`.
2. Compare top-1 distances — should differ only at floating-point noise level for exact-match queries; allow up to 1% relative delta for near-ties.
3. Smoke-test the sim: run 10 generations in RL-shape-transfer on Rect and Tri (per user's memory on triangle asymmetry), verify best-car selection behaves sanely.

**Exit criteria:** Recall @ 5 ≥ 0.95 for all three DBs; sim training curve on Rect + Tri within the known session-to-session variance band (user memory: n=6+ before strong claims — here we're only sanity-checking, not claiming improvement).

### P6 — Perf A/B (optional, only if curious)

Benchmark search latency before/after for k=5, N=300, across 1000 queries in the browser. Expected outcome: **HNSW slightly slower at this N** due to traversal overhead vs cache-friendly linear scan. That's fine — the point is capability, and this result is worth documenting so nobody "re-optimizes" later. Save to `docs/plan/ruvector-proof/hnsw-wasm-latency.md`.

## Risks & how we'll handle them

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `ruvector-hyperbolic-hnsw` doesn't build for wasm with `default-features = false` (untested combo) | Medium | P1 compile check catches it. Fallback: port just `hnsw.rs` + needed helpers from `poincare.rs` into `ruvector-core/src/index/hnsw_wasm.rs` as a vendored chunk. |
| Wasm bundle grows materially | Medium | Size check in P4; halt if >100KB added before compression. |
| Recall regression vs FlatIndex | Low at N=300 with `ef_search=50` | P5 recall gate; tune `ef_search` up if needed. |
| Tombstone-only removal causes stale-result bugs in long-running sessions | Low (bridge rarely removes) | Audit `ruvectorBridge.js` for `remove` calls; if present, add a compaction threshold. |
| `wasm-pack` version mismatch with existing vendored artifact | Medium | Pin version in rebuild script; note it in `docs/plan/ruvector-upstream-patches.md`. |
| Hyperbolic crate uses `rand_distr` — may need `getrandom/js` feature pass-through | Medium | Add `getrandom = { workspace = true, features = ["wasm_js"] }` check in ruvector-hyperbolic-hnsw's wasm-compat testing. |

## Rollback plan

All changes are additive (new feature, new module). To revert:
1. Drop `"hnsw-wasm"` from `ruvector-wasm/Cargo.toml`.
2. Rebuild + re-vendor wasm.
3. Bridge sees the old "flat fallback" warning again — same behavior as today.

No data format changes. Persistent storage is unaffected (WASM build is `:memory:` anyway).

## Out of scope

- Native (non-wasm) behavior — `hnsw_rs` path remains primary for native builds.
- Upstreaming to `ruvnet/ruvector` — tracked separately in `docs/plan/ruvector-upstream-patches.md` per user's memory note (pending user approval).
- Switching the car-learning bridge to actually benefit from HNSW at scale (would require growing vector counts >10k). Not this plan.

## Effort estimate

- P0: 1–2 h
- P1: 3–5 h (new module + tests)
- P2: 30 min
- P3: 15 min
- P4: 1–2 h (rebuild pipeline quirks)
- P5: 1–2 h
- P6: 1 h if done

**Total:** 1–2 focused days.
