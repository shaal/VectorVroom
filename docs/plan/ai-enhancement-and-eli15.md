# VectorVroom — AI enhancement + ELI15 mode plan

**Purpose.** Organise every remaining ruvector integration and the new ELI15
("explain-like-I'm-fifteen") teaching layer into *shippable phases*. Each phase
is self-contained, has a confidence gate, and is sized for a single `ship-task`
invocation. Phases that do not share files may run in parallel; explicit
dependencies are called out per phase.

This is a plan document, not a spec. Requirements live in
`docs/plan/ruvector-integration-prd.md`; progress in
`docs/plan/ruvector-integration-progress.md`. This file is purely phase
orchestration.

---

## How to drive this with `ship-task`

- Each Phase N.X below is one invocation: `/ship-task <phase-id>`.
- The phase ID matches the section heading (e.g. `P0.A`, `P1.B`).
- Phases in the same "wave" (same horizontal row in the diagram) can be
  spawned as parallel `ship-task` agents — they touch disjoint files.
- Every phase ends in a hard confidence gate: browser smoke test + ELI15
  chapter review. Don't advance waves until both gates pass.

```
              ┌─ P0.A ─────────┐
Wave 0       │  ELI15 shell    │   (must ship first)
              │  + vendor tool  │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┬────────────────┐
Wave 1  │              │              │                │
        ▼              ▼              ▼                ▼
      P1.A           P1.B           P1.C            P0.B
   GNN rerank    MicroLoRA on    Temporal sensor   Glossary:
   (P2.C           track vecs     trajectory        existing AI
   completion)                    embedding         explained
        │              │              │
        │              ▼              │
Wave 2  │           P2.A              │
        │        SONA upgrade         │
        │        (on top of 1.B)      │
        │              │              │
        └──────┬───────┴──────┬───────┘
               ▼              ▼
Wave 3       P3.A           P3.B
          Hyperbolic      Lineage DAG
          HNSW swap       viewer
               │              │
               └──────┬───────┘
                      ▼
Wave 4              P4.A
                  ELI15 guided tour
                  + A/B toggle strip
```

---

## Design primitives (read once before picking a phase)

**ELI15 framework (created in P0.A, reused by every later phase).**
A single registry — `AI-Car-Racer/eli15/registry.js` — maps chapter IDs to
`{title, oneLiner, body, diagram, related}` records. A floating drawer
(toggleable via `?` key or a 🎓 button in the phase bar) renders the chapter
for the currently focused UI element. Inline `<span data-eli15="chapter-id">?</span>`
badges next to widgets open the matching chapter. Chapters are lazy-loaded ES
modules so adding one is a one-file PR.

**Vendoring rule.** The repo's no-build promise for end users stands. Any new
WASM crate ships as a committed `vendor/ruvector/<name>/` directory with
`.wasm` + JS glue + `.d.ts`. P0.A delivers `scripts/vendor-ruvector.sh` so
maintainers rebuild with one command. The script is never required by end
users — it only runs when you pull a newer ruvector revision.

**`?rv=0` contract.** Every AI enhancement must be bypassable by the existing
URL flag. If `rv=0` is set, the feature falls back to today's behaviour so A/B
comparison stays meaningful. P4.A turns this contract into a visible UI.

---

## Wave 0 — foundation

### P0.A — ELI15 shell + vendoring tool

**Goal.** Stand up the teaching framework and the reusable WASM-vendor helper
so every later phase can focus on content, not infrastructure.

**Dependencies.** None.

**Deliverables.**
- `AI-Car-Racer/eli15/index.js` — registry, drawer renderer, keyboard shortcut
  (`?`), state lives in-memory (no persistence needed for v1).
- `AI-Car-Racer/eli15/chapters/` — empty directory with one example chapter
  (`ga-mutation.md` or `.js`) to lock the schema.
- `AI-Car-Racer/eli15/eli15.css` — drawer styling, matches existing UI panels.
- Badge pattern wired into at least one existing element (e.g. the
  generation counter → `chapter: genetic-algorithm`).
- `scripts/vendor-ruvector.sh CRATE_DIR` — runs `wasm-pack build --target web
  --release`, copies `pkg/` to `vendor/ruvector/<crate>/`, writes a
  `VENDORED.md` header with the source commit SHA.
- README update: one short section on "What ELI15 is + how to toggle it."

**Confidence gate.**
- Drawer opens/closes without errors; example chapter renders markdown.
- `scripts/vendor-ruvector.sh` re-vendors the existing `ruvector-cnn-wasm`
  against the same committed bytes (byte-diff = 0 or only wasm-pack metadata).
- `?rv=0` still works unchanged.

**ELI15 chapter shipped.** *"What is this project even doing?"* — two
paragraphs that frame the whole pipeline. Everything else hangs off this.

---

### P0.B — Backfill ELI15 chapters for existing AI

**Goal.** Write ELI15 content for every piece of AI that already exists, so
learners have a complete map before new features arrive.

**Dependencies.** P0.A.

**Parallel with.** P1.A, P1.B, P1.C — this is pure content and doesn't touch
their files.

**Chapters to ship.** (One file each under `eli15/chapters/`.)
- `sensors.md` — ray-cast sensors as the car's eyes (`sensor.js`).
- `neural-network.md` — 92 weights, 6→8→4 topology (`network.js`).
- `genetic-algorithm.md` — mutation + selection + fitness (`main.js:85-97`).
- `fitness-function.md` — what the car is scored on (`main.js:167`).
- `cnn-embedder.md` — what "embedding" means, why cosine similarity
  (`ruvectorBridge.js:152`).
- `vectordb-hnsw.md` — why nearest-neighbour search is fast
  (`ruvectorBridge.js:46-48`).
- `ema-reranker.md` — the current feedback loop
  (`ruvectorBridge.js:162-172`).
- `lineage.md` — `parentIds`, how family trees of brains form
  (`ruvectorBridge.js:200`).
- `track-similarity.md` — the whole warm-start idea, one level up.

Each chapter ≈ 200–400 words + one inline ASCII / SVG diagram + a "try it
yourself" bullet that names a concrete UI action.

**Confidence gate.** Every existing AI feature in the UI has a linked ELI15
badge, and clicking any badge lands on a chapter that references the correct
file path.

---

## Wave 1 — three independent AI enhancements

Wave 1 phases share no files. Spawn them as parallel `ship-task` agents.

### P1.A — GNN reranker (complete the original P2.C)

**Goal.** Replace the EMA scalar in `recommendSeeds()` with a genuine graph
neural network over the lineage DAG. This closes the `[!]` note at
`ruvectorBridge.js:5`.

**Dependencies.** P0.A (needs `scripts/vendor-ruvector.sh`).

**Parallel with.** P1.B, P1.C, P0.B.

**Deliverables.**
- `vendor/ruvector/ruvector_gnn_wasm/` (via the vendor script).
- `AI-Car-Racer/gnnReranker.js` — assembles a graph from `_brainMirror`:
  nodes = brains, edges = `meta.parentIds`, node features =
  `[fitnessNorm, generationNorm, trackSim]`. Runs one GNN forward pass,
  returns per-node scores.
- Hook into `ruvectorBridge.recommendSeeds()`: if the GNN module is loaded,
  replace `obsTerm` with `gnnScore`. Keep EMA path as automatic fallback when
  the archive has fewer than N nodes (GNNs need graph to work on).
- Telemetry: stats panel shows `reranker: gnn | ema | none`.

**ELI15 chapter.** `gnn.md` — "how a GNN is *like* the EMA reranker but with
peer pressure" — explain message passing in three bullets, show one diagram
of scores flowing along `parentIds`.

**Confidence gate.**
- With GNN enabled: top-1 retrieved seed's fitness is ≥ EMA baseline across
  a scripted replay of 3 saved archives (tracks + brains committed to
  `tests/fixtures/`).
- `?rv=0` still fully disables the bridge.
- ELI15 chapter opens via the badge on the new "reranker: gnn" stats row.

---

### P1.B — MicroLoRA adapter on track embeddings

**Goal.** Replace the static CNN track embedding with a learnable adapter:
the 512-dim vector passes through a rank-2 LoRA before nearest-neighbour
search, and the adapter updates from the generation's fitness outcome.

**Dependencies.** P0.A.

**Parallel with.** P1.A, P1.C, P0.B.

**Deliverables.**
- `vendor/ruvector/ruvector_learning_wasm/`.
- `AI-Car-Racer/lora/trackAdapter.js` — wraps `WasmMicroLoRA(512, 0.1, 0.01)`,
  exposes `adapt(trackVec) → trackVec'` and `reward(fitness)`.
- Integration point: `ruvectorBridge.embedTrack()` returns *raw* vector;
  `recommendSeeds()` calls `trackAdapter.adapt()` before searching.
  `archiveBrain()` calls `trackAdapter.reward(fitness)` after archive write.
- Persist adapter state in its own IndexedDB store (`lora_track` store),
  mirrored in the existing hydrate/persist pipeline.
- UI: tiny sparkline next to the track picker showing "adapter drift" — L2
  norm between raw and adapted vectors.

**ELI15 chapter.** `lora.md` — "why we add a *small* matrix instead of
retraining the big one" + diagram of rank-2 decomposition as two skinny
matrices.

**Confidence gate.**
- Adapter state survives page reload.
- On a fresh archive (`_debugReset()`), adapter starts as near-identity
  (drift ≈ 0); after 10 generations on the same track, drift > 0 and top-1
  retrieval fitness ≥ un-adapted baseline.
- `?rv=0` fully skips the LoRA path.

---

### P1.C — Temporal sensor trajectory embedding

**Goal.** Add a second retrieval key that describes *how* the car drove the
track — sensor-readings-over-a-lap — not just what the track *looks like*.

**Dependencies.** P0.A.

**Parallel with.** P1.A, P1.B, P0.B.

**Deliverables.**
- `vendor/ruvector/ruvector_temporal_tensor_wasm/`.
- `AI-Car-Racer/dynamicsEmbedder.js` — records per-frame
  `[sensor0…sensor5, speed, steering]` tensor for the best car's fastest
  lap, projects to a fixed-dim (64 or 128) dynamics vector.
- New VectorDB instance `_dynamicsDB` in `ruvectorBridge.js`, populated at
  `archiveBrain()` time. Brain meta gains `dynamicsId`.
- `recommendSeeds()` gains an optional third term: `dynamicsSim` between the
  *currently running generation's mid-training dynamics* and archived
  dynamics. Off by default, toggleable via a checkbox in the stats panel.
- ELI15 badge on the toggle.

**ELI15 chapter.** `dynamics-embedding.md` — "two photos of a hill vs two
videos of running down it: which one tells you more?"

**Confidence gate.**
- Dynamics vectors persist and hydrate.
- Toggle visibly changes seed recommendations without crashing on archives
  that predate the field (backwards-compat for old IDB entries).

---

## Wave 2 — upgrade one of the Wave 1 branches

### P2.A — SONA upgrade on top of P1.B

**Goal.** Replace the bare MicroLoRA adapter with the full `@ruvector/sona`
engine: trajectories, ReasoningBank clusters, EWC++ anti-forgetting.

**Dependencies.** P1.B (swaps its adapter). Blocks nothing.

**Parallel with.** P3.A, P3.B.

**Deliverables.**
- `vendor/ruvector/sona/` (published npm artifact vendored via the script).
- Refactor `lora/trackAdapter.js` → `sona/engine.js`:
  - `beginTrajectory(trackVec)` at phase-4 entry.
  - `addStep(activations, attention, reward)` each generation with
    `activations = bestCar.sensor.readings`, `reward = generationFitness`.
  - `endTrajectory(id, normalizedFinalFitness)` when the player exits phase 4.
- `findPatterns(trackVec, 5)` powers a new "similar circuits" side panel —
  shows the cluster's avg quality and member count.
- Stats panel gains `trajectories`, `patterns`, `micro_updates`, `ewc_lambda`.

**ELI15 chapters.**
- `trajectory.md` — "what a trajectory is, and why recording the whole thing
  beats just recording the final score."
- `reasoningbank.md` — "clustering similar situations so the system can say
  *'this reminds me of that'*."
- `ewc.md` — "why learning new things sometimes makes you forget old things,
  and how EWC++ fixes that."

**Confidence gate.**
- After 20 generations across 3 different track presets, SONA's
  `patterns_stored` ≥ 3. Pattern-cluster panel shows distinct clusters.
- No regressions on P1.B's confidence gate (adapter drift, persistence,
  `?rv=0` skip).

---

## Wave 3 — structural optimisations

### P3.A — Hyperbolic HNSW swap

**Goal.** Swap the Euclidean HNSW in `_trackDB` and `_brainDB` for
`ruvector-hyperbolic-hnsw-wasm`. Tree-like data (lineage, track taxonomy)
embeds with lower distortion in hyperbolic space.

**Dependencies.** Wave 2 complete (so we have enough data to notice a
difference).

**Parallel with.** P3.B.

**Deliverables.**
- `vendor/ruvector/ruvector_hyperbolic_hnsw_wasm/`.
- Feature flag `?hhnsw=1` (default off) that swaps the index class in
  `ruvectorBridge.js` constructor.
- Benchmark harness `tests/bench-hnsw.html` that loads a saved archive,
  runs 100 random queries under both indices, reports recall@5 + p99
  latency.

**ELI15 chapter.** `hyperbolic-space.md` — "why trees fit better on a
saddle than on a table" with a two-panel diagram (Euclidean embedding of a
tree = crowded; hyperbolic = breathable).

**Confidence gate.** Recall@5 on the saved archive is ≥ Euclidean baseline;
p99 latency within 1.5× of Euclidean. If either fails, keep the flag off
but ship the chapter — hyperbolic space is worth teaching even if we don't
adopt it.

---

### P3.B — Lineage DAG viewer

**Goal.** Formalise the lineage graph (currently a hand-walked `parentIds`
chain at `ruvectorBridge.js:200`) into a proper DAG crate, and add a
visualisation panel.

**Dependencies.** Wave 2 complete (P1.A's GNN already uses the graph;
this phase makes the structure reusable).

**Parallel with.** P3.A.

**Deliverables.**
- `vendor/ruvector/ruvector_dag_wasm/`.
- `AI-Car-Racer/lineage/dag.js` — builds the DAG once, incrementally updates
  on each `archiveBrain`. Replaces the in-function traversal in
  `getLineage()` with an O(depth) DAG query.
- `AI-Car-Racer/lineage/viewer.js` — small canvas panel that renders the
  DAG with fitness-coloured nodes, generation on the y-axis. Click a node
  → ELI15 chapter on that brain's lineage.

**ELI15 chapter.** `lineage-dag.md` — "a DAG is a family tree where you can
have two parents but never a time-loop."

**Confidence gate.**
- `getLineage()` returns identical output pre- and post-swap on 50
  randomly-sampled brains from a seeded archive.
- Viewer renders without errors on the largest saved archive.

---

## Wave 4 — teaching capstone

### P4.A — Guided tour + A/B toggle strip

**Goal.** Turn the whole feature set into a coherent learning experience. A
first-time visitor can press "Start tour" and be walked through every AI
concept, each with a live A/B toggle so they can *feel* the contribution of
each layer.

**Dependencies.** All prior phases.

**Deliverables.**
- `AI-Car-Racer/eli15/tour.js` — ordered chapter playlist (matches the
  order taught in P0.B + P1 + P2 + P3). Tour UI highlights the relevant
  UI element as each chapter opens.
- A/B toggle strip in the stats panel:
  - Reranker: `none | ema | gnn`
  - Track adapter: `off | micro-lora | sona`
  - Dynamics key: `off | on`
  - Index: `euclidean | hyperbolic`
- Each toggle has an ELI15 badge that opens the responsible chapter.
- README "Learning mode" section.

**Confidence gate.**
- Full tour runs end-to-end without a missing chapter or broken reference.
- Every A/B toggle does what its label says (verified against feature flags
  added in previous phases).
- Landing-page copy updated to mention ELI15.

---

## Out of scope (documented rejections)

These ruvector crates were considered and explicitly *not* included. If
scope later changes, start here.

- **`ruvector-consciousness-wasm`, `ruvector-nervous-system-wasm`,
  `ruvector-cognitive-container`** — compute footprint far exceeds this
  project; no signal in a 2D racer that would exercise them.
- **`ruvector-sparse-inference`, `ruvector-fpga-transformer`** — the
  driver net is 92 floats; sparse inference is a scale mismatch.
- **`ruvector-raft`, `ruvector-replication`, `ruvector-postgres`,
  `ruvector-server`** — distributed-systems infra, irrelevant for a
  browser-local demo.
- **Using SONA as the driver itself** — would break the evolvable-genome
  property the GA is built on. SONA is used only as the retrieval-side
  adaptor (P2.A).

---

## Phase status tracker

Fill in as phases ship. `ship-task` writes back here on completion.

| Phase | Status | Agent | Shipped commit | ELI15 chapters |
|------|--------|-------|----------------|----------------|
| P0.A | ✅ shipped | claude-opus-4-7 | (see git log) | `what-is-this-project` |
| P0.B | ✅ shipped | claude-opus-4-7 | 2c9bf6e | `sensors`, `neural-network`, `genetic-algorithm`, `fitness-function`, `cnn-embedder`, `vectordb-hnsw`, `ema-reranker`, `lineage`, `track-similarity` |
| P1.A | ✅ shipped | claude-opus-4-7 | 8c994c1 | `gnn` |
| P1.B | ☐ | — | — | — |
| P1.C | ☐ | — | — | — |
| P2.A | ☐ | — | — | — |
| P3.A | ☐ | — | — | — |
| P3.B | ☐ | — | — | — |
| P4.A | ☐ | — | — | — |
