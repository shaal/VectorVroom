# RuLake-inspired feature roadmap for VectorVroom

Plan date: 2026-04-24. Author-facing; consumed by `/ship-task` one
phase at a time. Each phase is a shippable unit with a confidence gate
and an ELI15 chapter. Phases are ordered by dependency; inside a phase,
tasks are marked **Parallel-safe** when they can be delegated to
independent subagents, or **Sequential** when they touch a shared
surface (`ruvectorBridge.js`, `eli15/tour.js`, the SONA engine).

The source of ideas is [ruvnet/RuLake](https://github.com/ruvnet/RuLake)
— a cache layer over vector search. We are **not** adopting RuLake as a
dependency. We are porting a subset of its ideas as user-visible,
teachable features that fit VectorVroom's existing stack (vendored
ruvector WASM + IndexedDB + the ELI15 tour).

## Status tracker

**Legend:** ⬜ todo · 🟡 in progress · ✅ done · 🚫 blocked · ⏸ deferred

**How to update:** when starting a task flip its box to 🟡 and add your
name; when finishing, flip to ✅ and add the date (YYYY-MM-DD) and the
PR/commit SHA. When blocked, flip to 🚫 and add a one-line reason
pointing to the blocker. Keep the "Current focus" line at the top
pointing at whichever phase is active so a newcomer knows where to
jump in without reading the whole doc.

**Current focus:** Phase 1 wave 2 — 1C only (1A landed; 1C is last remaining Phase 1 task)
**Last updated:** 2026-04-24

### Phase 0 — Foundations _(sequential, 1 owner)_

| Status | ID | Task | Owner | PR/SHA | Done date |
|:--:|:--:|------|-------|--------|-----------|
| ✅ | 0.1 | `ArchiveSnapshot` schema in `archive/snapshot.js` | Claude | — | 2026-04-24 |
| ✅ | 0.2 | Stub extension points in `ruvectorBridge.js` | Claude | — | 2026-04-24 |
| ✅ | 0.3 | `archive/hash.js` xxHash32 wrapper | Claude | — | 2026-04-24 |
| ✅ | 0.4 | ELI15 chapter stubs (7 new files) | Claude | — | 2026-04-24 |

**Phase 0 gate:** all four rows ✅ + existing tests pass + `grep
"not implemented"` shows exactly 4 hits.

### Phase 1 — Parallel implementations _(swarm-safe, 4 subagents)_

| Status | ID | Task | Owner | PR/SHA | Done date |
|:--:|:--:|------|-------|--------|-----------|
| ✅ | 1A | F3 — Warm-restart bundles + shareable snapshots | Claude (subagent) | — | 2026-04-24 |
| ✅ | 1B | F1 — 1-bit quantized archive (RaBitQ + Hadamard) | Claude (subagent) | — | 2026-04-24 |
| ⬜ | 1C | F4 — Consistency modes (Fresh/Eventual/Frozen) |  |  |  |
| ✅ | 1D | F5 — Content-addressed dedup + hash-keyed lineage | Claude (subagent) | — | 2026-04-24 |

**Phase 1 gate:** all four rows ✅ + each passes its own `/ship-task`
confidence gate + cross-track-variance memory applied for recall/speed
claims (n=6+ across ≥2 sessions, tested on both Rect and Tri tracks).

### Phase 2 — Integration _(sequential)_

| Status | ID | Task | Depends on | Owner | PR/SHA | Done date |
|:--:|:--:|------|-----------|-------|--------|-----------|
| ⬜ | 2A | F2 — Federated search with GNN rerank | 1B | |  |  |
| ⬜ | 2B | F6 — Cross-tab live training via BroadcastChannel | 1A, 1D |  |  |  |

**Phase 2 gate:** both rows ✅ + A/B convergence test (two-tab demo
for 2B; recall@10 ≥ max(E,H) for 2A).

### Phase 3 — Observability & polish _(swarm-safe, 3 subagents)_

| Status | ID | Task | Owner | PR/SHA | Done date |
|:--:|:--:|------|-------|--------|-----------|
| ⬜ | 3A | F7 — Observability dashboard |  |  |  |
| ⬜ | 3B | ELI15 tour integration pass |  |  |  |
| ⬜ | 3C | Shareable archive URLs + gallery |  |  |  |

**Phase 3 gate:** all three rows ✅ + ELI15 tour plays end-to-end with
no dead links + 3C passes the external-scope check (user OK before any
community-archive URL ships publicly).

### Release milestone

| Status | Milestone |
|:--:|-----------|
| ⬜ | M1 — F1+F3 demoable locally (flags on) |
| ⬜ | M2 — Phase 1 merged to `main` behind flags |
| ⬜ | M3 — F2+F6 shipping, flags default on for F1/F3 |
| ⬜ | M4 — Phase 3 complete, blog post / tour recording |

### Notes / decisions log

Append-only. Record any scope change, deferral, or non-obvious call
that future-you would want to find. Newest at the top.

- **2026-04-24 — Phase 1 wave 1 closed (1B + 1D).** Dispatched as two
  parallel general-purpose subagents in a single message; zero file
  overlap thanks to Phase 0's pre-partition. Live browser validation:
  `tests/quantization-recall.html` prints recall@10 = 0.9060 (≥ 0.9 gate);
  `tests/dedup-smoke.html` prints 3/3 PASS. Main app boots cleanly after
  edits to lineage/dag.js, lineage/viewer.js, brainExport.js. 1A + 1C
  deferred to wave 2 because both edit ruvectorBridge.js stubs and would
  race.

- **2026-04-24 — Phase 0 closed.** 0.4 shipped 7 stubs (not 6 as the
  tracker originally said) — the plan body referenced 7 distinct chapter
  files, so the original "6" was a typo. Tracker + task description now
  reconciled. `exportSnapshot` / `importSnapshot` / `setConsistencyMode`
  / `getIndexStats` are stubs that throw `not implemented` with a Phase
  label so swarm workers know which task owns each slot. Browser smoke
  test via agent-browser confirmed app still boots cleanly (no new
  console errors) and all 7 chapters render via `ELI15.openChapter()`.
  SHA column left blank by convention for Phase 0; `git log --grep="Phase
  0"` is authoritative.

---

## Feature slate (the seven we're scoping)

| ID | Feature | RuLake primitive | Chapter slot |
|----|---------|------------------|--------------|
| F1 | 1-bit quantized archive (RaBitQ + Hadamard) | RabitqPlusIndex | `quantization.js` |
| F2 | Federated search across Euclidean + Hyperbolic | Federation / adaptive rerank | `federation.js` |
| F3 | Warm-restart bundles + shareable snapshots | Save/warm-restart, Frozen | `warm-restart.js` |
| F4 | Consistency modes (Fresh / Eventual / Frozen) | Consistency taxonomy | `consistency-modes.js` |
| F5 | Content-addressed dedup + hash-keyed lineage | Witness chain | `content-addressing.js` |
| F6 | Cross-tab live training via BroadcastChannel | Cross-process sharing | `cross-tab-federation.js` |
| F7 | Observability dashboard | Per-backend observability | `where-the-time-goes.js` |

## Dependency graph

```
Phase 0 (Foundations, sequential)
       │
       ├──► Phase 1A — F3 Warm-restart bundles  ──┐
       ├──► Phase 1B — F1 Quantized archive     ──┤
       ├──► Phase 1C — F4 Consistency modes     ──┤── swarm-safe
       └──► Phase 1D — F5 Content-addressing    ──┘
                                │
                                ▼
       ┌─────────── Phase 2 (integration) ───────────┐
       │                                             │
       ▼                                             ▼
    Phase 2A — F2 Federation                   Phase 2B — F6 Cross-tab
    (needs F1's quantized path + F3 bundle API)  (needs F3 snapshot format)
                                │
                                ▼
                Phase 3 (observability + polish, swarm-safe)
                    3A F7 dashboard  3B ELI15 tour pass  3C share UI
```

---

## Phase 0 — Foundations (sequential, single owner)

One person, one small PR, unblocks everything else. **Do not parallelize.**

### Tasks

- **0.1** Define `ArchiveSnapshot` schema in
  `AI-Car-Racer/archive/snapshot.js` (new). Single source of truth for the
  on-disk shape:
  ```
  { version: 1,
    brains: [{ hash, flat, meta, parentIds }],
    hnsw:   { serialized: Uint8Array, params: {...} },
    consistency: 'fresh'|'eventual'|'frozen',
    witness: string /* SHA-256 of (brains + hnsw bytes) */ }
  ```
- **0.2** Extend `ruvectorBridge.js` with stubbed extension points (no
  behavior yet): `exportSnapshot()`, `importSnapshot(s)`,
  `setConsistencyMode(m)`, `getIndexStats()`. Each throws
  `Error('not implemented')` so swarm tasks can fill them in parallel
  without merge conflicts.
- **0.3** Add `archive/hash.js` — one 8-line xxHash32 wrapper over a
  flattened brain. Used by F3 and F5; having it exist up front removes
  a cross-task dependency.
- **0.4** Add a new top-level ELI15 chapter stub for each feature — 7
  files (`warm-restart`, `quantization`, `consistency-modes`,
  `content-addressing`, `federation`, `cross-tab-federation`,
  `where-the-time-goes`). Each is a placeholder `export default { …,
  comingSoon: true }` registered in `eli15/index.js` so the Phase 1/2/3
  swarm workers replace the body without having to touch registration.

### Done criteria (confidence ≥95%)

- `npm test` / existing tests still pass.
- `AI-Car-Racer/index.html` still loads; bridge still functions.
- A `grep` for `not implemented` shows exactly the four stubs from 0.2.

### Why sequential

All four tasks touch `ruvectorBridge.js`. Doing them as one tiny PR
makes the downstream swarm phases conflict-free.

---

## Phase 1 — Parallel feature implementations (swarm of 4 subagents)

All four tasks are **Parallel-safe** after Phase 0 lands: each owns a
distinct directory and the shared surface (`ruvectorBridge.js`) was
pre-partitioned in 0.2. Dispatch via the Agent tool in one message,
four tool calls in parallel, per the `subagent_swarms` memory.

### 1A — F3: Warm-restart bundles + shareable snapshots

- **Files owned:** `AI-Car-Racer/archive/{snapshot.js,exporter.js,importer.js}`,
  `brainExport.js` extension, `uiPanels.js` (new Export/Import row), the
  `exportSnapshot` / `importSnapshot` slots in `ruvectorBridge.js`.
- **Implementation sketch:**
  1. Serialize the HNSW internal state via a new
     `vendor/ruvector/ruvector_wasm` export (if not available,
     serialize by replaying insertions in the same deterministic order
     — this is slow but shippable; note it as a follow-up).
  2. Bundle as a single `.vvarchive.json.gz` file.
  3. On load, call `importSnapshot` before any GA work begins.
  4. UI: `📦 Export archive` and `📥 Import archive` buttons.
- **ELI15 chapter (`warm-restart.js`):** "A brain archive is a museum.
  You can save it, reopen it tomorrow, or give the whole museum to a
  friend." Visual: boot-time bar graph (rebuild vs. restore), plus a
  file-drop zone that live-previews a bundle's brain count + generation
  stats before import.
- **Visible artifact:** boot-time timing pill in the top bar, "restored
  in 40ms" vs. "rebuilt in 1200ms".
- **Done criteria:** export → reload → import reproduces byte-identical
  retrieval results for a fixed query vector (equivalence harness,
  same style as the P3.B lineage DAG equivalence test).

### 1B — F1: 1-bit quantized archive (RaBitQ + Hadamard)

- **Files owned:** `AI-Car-Racer/quantization/{rabitq.js,hadamard.js,index.js}`
  (new), `eli15/chapters/quantization.js`, a new viewer at
  `quantization/viewer.js`, and a narrow slot in `ruvectorBridge.js`
  that toggles quantized vs. float storage.
- **Scope call:** implement the quantizer in **pure JS** first, not in
  Rust/WASM. Browser archives are small enough that JS is fast, and it
  keeps the plan free of the ruvector upstream patch dance documented
  in `ruvector-upstream-patches.md`. A WASM rewrite is a later phase.
- **Implementation sketch:**
  1. `hadamard.js`: in-place iterative Fast Walsh-Hadamard transform
     (O(D log D)), padded to the next power of 2.
  2. `rabitq.js`: rotate → take sign bits → pack into `Uint32Array`.
     Hamming distance via `popcount` from XOR.
  3. Keep a small float residual per vector (16 floats, say) for a
     rerank stage. Returned neighbours are 1-bit-ranked then
     float-reranked.
- **ELI15 chapter:** side-by-side heatmap (full float vs. 1-bit), a
  scatter plot of `true distance vs. quantized distance` that fills in
  live as brains arrive, and a memory meter showing the compression
  ratio (~32×).
- **Visible artifact:** toggle in the training panel: `Quantized
  archive (32× smaller)` on/off. When on, the archive-size readout
  drops visibly.
- **Done criteria:** recall@10 vs. float baseline ≥ 0.9 on the current
  archive for a fixed query set (cross-track-variance memory applies:
  n=6+ across ≥2 sessions before we claim numbers). Hyperbolic path is
  explicitly untouched — document that limitation in the chapter.

### 1C — F4: Consistency modes

- **Files owned:** `AI-Car-Racer/consistency/mode.js` (new), the
  `setConsistencyMode` slot in `ruvectorBridge.js`, `uiPanels.js`
  additions for the radio row, `sim-worker.js` hook for the A/B
  baseline worker.
- **Implementation sketch:**
  1. Three modes backed by a single integer flag read by the bridge's
     query path:
     - `fresh`: re-query every generation (current behavior).
     - `eventual`: TTL cache; re-query every N generations (default 10).
     - `frozen`: pin the archive snapshot at mode-entry time; no
       re-queries until the user unfreezes.
  2. A/B mode fix: the baseline worker **must** start in `frozen` and
     inherit the primary's pinned snapshot. This is the principled fix
     for the race that commit `4c2527b` patched.
- **ELI15 chapter:** a timeline strip under the radio row showing
  ticks where the archive is actually re-queried. Under Frozen the
  ticks stop; under Eventual they're periodic; under Fresh they fire
  every generation.
- **Done criteria:** A/B equivalence harness — with `frozen` mode the
  baseline worker's per-generation fitness series is deterministic
  across reruns (same RNG seed).

### 1D — F5: Content-addressed dedup + hash-keyed lineage

- **Files owned:** `AI-Car-Racer/archive/dedup.js` (new),
  `lineage/dag.js` additions (hash as canonical ID), `brainExport.js`.
- **Implementation sketch:**
  1. On insertion, compute `hash(flat(brain))` via `archive/hash.js`.
  2. If the hash is already in the archive, short-circuit — increment
     a `duplicateCount` instead.
  3. Lineage DAG keys by hash; `parentIds` becomes a fallback only used
     when a hash isn't available (legacy imports).
- **ELI15 chapter:** DAG viewer grows a dedup badge on collided nodes;
  a "% duplicates" stat pill in the training panel.
- **Done criteria:** importing the same archive twice is a no-op
  (archive size + generation count unchanged after the second import).

### Swarm dispatch notes

- Each subagent gets the plan URL and the names of *only its own files*
  to avoid context bleed. Prompts should include the memory on
  local-vs-external scope (these are all local-only tasks) and the
  cross-track-variance discipline for anything that makes a quality
  claim.
- `/ship-task` is invoked **per subagent** inside Phase 1; the swarm
  doesn't replace /ship-task's confidence gate, it runs it four times
  in parallel.

### Phase 1 merge order

Each subagent lands its own PR. Recommended order of review:
0.1 foundations already landed → 1D (smallest surface) → 1C → 1A → 1B
(largest surface, so it benefits from rebasing onto the other three).

---

## Phase 2 — Integration (sequential)

Two tasks, sequential because each depends on Phase 1 outputs.

### 2A — F2: Federated search (Euclidean + Hyperbolic with GNN rerank)

**Depends on:** F1 (quantized Euclidean path) for the speed needed to
query both indexes without a user-visible stall.

- **Files owned:** `AI-Car-Racer/federation/{fanout.js,rerank.js}`
  (new), `ruvectorBridge.js` query-path branch, `gnnReranker.js`
  integration, `eli15/chapters/federation.js`, a split-screen viewer.
- **Implementation sketch:**
  1. Query both `VectorDB` and `HyperbolicVectorDB` in parallel
     (Promise.all — both are WASM, both are fast).
  2. Per-shard over-request: `k' = k + ⌈√(k · ln S)⌉` with S=2.
  3. Union results; dedupe by hash (F5 wired up for free).
  4. GNN rerank (existing `gnnReranker.js`) produces the final ranking.
- **ELI15 chapter:** split-screen animation — left graph, right graph,
  candidate flows merging into a central rerank box. The formula `k' =
  k + ⌈√(k ln S)⌉` is rendered live with the current k and S.
- **Done criteria:** recall@10 on a held-out query set is ≥ max(E-only,
  H-only) across 2 sessions × 6 runs (cross-track-variance memory).

### 2B — F6: Cross-tab live training

**Depends on:** F3 (snapshot format is the wire format between tabs).

- **Files owned:** `AI-Car-Racer/crosstab/channel.js` (new), UI pulse
  indicator, `eli15/chapters/cross-tab-federation.js`.
- **Implementation sketch:**
  1. `BroadcastChannel('vectorvroom-archive')` per tab.
  2. On archive insertion in tab A, broadcast `{ type: 'brain',
     snapshot-fragment: ... }` using the F3 shape.
  3. Other tabs call `importSnapshot` on the fragment (incrementally —
     not a full archive rebuild).
  4. A small connection indicator and a pulse animation on each
     received brain.
- **ELI15 chapter:** animated demo of two tab previews side-by-side;
  explain "shared storage by convention, not by mutex" — no locking,
  because every brain is content-addressed (F5 wires in here).
- **Done criteria:** with two tabs open on different tracks,
  tab B's archive converges to tab A's within 1s of a new best brain
  being produced.

---

## Phase 3 — Observability & polish (swarm of 3 subagents)

All three tasks are **Parallel-safe** — distinct dirs.

### 3A — F7: Observability dashboard

- **Files owned:** `AI-Car-Racer/observability/{timings.js,panel.js}`,
  `eli15/chapters/where-the-time-goes.js`. Hooks into bridge via
  `getIndexStats()` (stubbed in Phase 0).
- **Visible artifact:** a collapsible "⏱ Where the time goes" panel
  with a stacked bar showing `HNSW / rerank / LoRA / sensor embed / GA
  ops` per generation.

### 3B — ELI15 tour integration pass

- **Files owned:** `eli15/tour.js`, `eli15/index.js`. Registers the six
  new chapters (warm-restart, quantization, consistency-modes,
  content-addressing, federation, cross-tab-federation,
  where-the-time-goes) in the correct pedagogical order.
- **Scope:** ordering + cross-links only. No chapter content edits
  (those were written inside each Phase 1/2 task).
- **Done criteria:** tour plays end-to-end with no dead links; each new
  chapter has a "see also" pointing to at least one existing chapter.

### 3C — Shareable archive URLs

- **Files owned:** `AI-Car-Racer/share/{url.js,gallery.js}` (new),
  `uiPanels.js` addition.
- **Implementation sketch:**
  1. Upload archive bundle to a user-pasted URL (Gist, S3, IPFS — the
     user supplies; we don't host).
  2. `?archive=<url>` query param auto-imports on load.
  3. A small curated list of "community archives" (hardcoded URLs in
     `gallery.js` to start) shows up as clickable thumbnails.
- **ELI15 chapter:** extends `warm-restart.js` rather than adding a new
  chapter — keeps the tour lean.
- **External-scope gate:** publishing a community archive URL requires
  explicit user OK per the local-vs-external-scope memory.

---

## Cross-cutting discipline

- **Testing cadence:** every phase ends with `/ship-task`'s 95% gate.
  For anything that makes a recall or speed claim, apply the
  cross-track-variance rule (n=6+ across ≥2 sessions). Triangle apex
  corridors from `triangle-asymmetry` memory are a mandatory test
  track alongside Rect.
- **Deploy:** no changes to the Cloudflare Pages pipeline needed — all
  features are pure static JS + the existing vendored WASM. If 1B
  eventually moves to WASM, the `_headers` / `_redirects`
  `no-transform` pattern from commit `219896b` must be extended to any
  new `/vendor/...` path.
- **Rollback strategy:** each feature is gated behind a URL flag:
  `?snapshots=1` (F3), `?quant=1` (F1), `?consistency=frozen` (F4), …
  This is how the hyperbolic HNSW shipped (`?hhnsw=1`) and it lets a
  `/ship-task` phase land in `main` without bricking the default
  experience.

## Effort estimate (rough)

| Phase | Tasks | Parallel? | Wall-clock (with swarm) |
|-------|-------|-----------|--------------------------|
| 0     | 4     | no        | half a day              |
| 1     | 4     | yes (4×)  | 1–2 days                |
| 2     | 2     | no        | 1–2 days                |
| 3     | 3     | yes (3×)  | half a day              |

Total: roughly a week of wall-clock with swarms; ~3 weeks solo. Budget
for one extra day to handle whichever Phase 1 task ends up needing a
ruvector upstream patch (the F1 scope call tries to avoid this, but
the F3 HNSW-serialization path may not).

---

## Why this order

The tier-1 features (F1, F2, F3) are the flagship chapters. F2 is
gated on F1 for speed, and F6 is gated on F3 for its wire format — so
F1 and F3 land first, F2 and F6 follow. F4 and F5 are smaller surfaces
that plug into everyone else (Frozen mode stabilizes A/B runs; hash
dedup makes F6 safe and F5's DAG benefits immediately). F7 lands last
because it's most useful once there's a lot of new instrumented code
to observe.

The parallelizable phases (1 and 3) are structured so four or three
subagents can work simultaneously with zero shared-file conflicts
after Phase 0's scaffolding. The sequential phases (0 and 2) are
deliberately small — Phase 0 is a single tiny PR, Phase 2 is two
focused integration tasks — to keep the critical path short.
