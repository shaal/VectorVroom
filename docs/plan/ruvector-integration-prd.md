# PRD: Integrate ruvector into AI-Car-Racer

## Context

`car-learning` currently contains `AI-Racing/` — a small p5.js supervised-learning demo (rule-based teacher → TensorFlow.js student, single car, no population). The user has decided this is the wrong base. The new base is **[Apgoldberg1/AI-Car-Racer](https://github.com/Apgoldberg1/AI-Car-Racer)**, a browser-based racing game with **evolutionary learning**, a **population of AI cars**, a **custom neural network** (plain JS, no TF.js), a **track editor**, and a best-brain archive. This is a much better canvas for showcasing ruvector, whose core story is *vector memory that learns from use*.

Adjacent to this repo is `ruvector/` — a symlink to a Rust vector-DB monorepo with a rich family of WASM packages (`@ruvector/wasm`, `@ruvector/cnn`, `@ruvector/gnn-wasm`, `@ruvector/learning-wasm`, etc.). The user wants a **full-redesign, full-stack showcase**: pull in several ruvector features, vendor pre-built WASM (no npm/bundler), and swap in vector-memory + GNN re-ranking + CNN visual embeddings + IndexedDB persistence for the existing GA flow.

**Intended outcome:** A live browser demo where the user draws a track, spawns a population of cars, and the GA is visibly smarter than the stock one — because every generation's brains are stored as vectors, similar past brains are recalled as seeds, track images are embedded and used to transfer knowledge across tracks, and the GNN layer re-ranks retrievals based on which ancestors actually produced good descendants.

---

## Goals

1. **Replace the base project** — Clone `AI-Car-Racer` into this repo and remove the existing `AI-Racing/` folder.
2. **Showcase ruvector end-to-end** — wire in four distinct ruvector capabilities, each doing real work:
   - `VectorDB` (HNSW + cosine) as the brain archive
   - `CnnEmbedder` for track fingerprinting
   - GNN-based result re-ranking that improves over generations
   - IndexedDB persistence, replacing `localStorage`
3. **Keep the no-bundler feel** — vendor pre-built WASM, load via ES modules, no `npm install`.
4. **Make the demo legible** — add UI affordances that *show* ruvector working: a "similar past brains" panel, a "this track resembles…" hint, a fitness-over-generations graph annotated with retrieval events.

## Non-goals

- Rewriting the game engine, physics, or car rendering.
- Replacing the custom NN implementation. The NN stays; ruvector operates **around** it (stores, retrieves, selects).
- Cloud sync, multi-device, or Node-side tooling.
- Proving ruvector is faster than alternatives. This is a feature showcase, not a benchmark.

---

## Target experience (user-visible)

1. **Boot**: the page loads; WASM modules initialize in the background.
2. **Track editor phase**: user draws a track (pre-existing behavior). On "done", a small badge appears: *"This track is 72% similar to one you've trained on — loading 3 best candidate brains as seeds."* (Powered by CNN embedding + `VectorDB.search`.)
3. **Training phase**: 10 cars spawn. Instead of all sharing `bestBrain` + mutation, the population is seeded from a similarity-weighted retrieval over the brain archive. The side panel shows each seed brain's past fitness.
4. **End of generation**: top-k brains get inserted into the archive with metadata (fitness, lap time, track embedding, generation, parent IDs). The GNN layer observes which retrievals led to improvement and adjusts future rankings.
5. **Reload**: everything survives, because the entire archive now lives in IndexedDB via ruvector — not 5MB-capped `localStorage`.

---

## Design

### Architecture overview

```
┌─────────────────── AI-Car-Racer (existing) ──────────────────┐
│  Road / Car / Controls / Sensors / animate() loop            │
│  NeuralNetwork (weights + biases, JSON-serializable)         │
│  roadEditor.js · main.js · network.js · inputVisual.js       │
└──────────────┬──────────────────────────────────▲────────────┘
               │                                  │
          brain vectors                     seed brains for
          + track embeddings                next generation
               ▼                                  │
┌──────────────────────────────── new: ruvectorBridge.js ──────┐
│  init()  →  loads ruvector-wasm (VectorDB) + ruvector-cnn    │
│  archiveBrain(brain, fitness, trackVec, gen, parentIds)      │
│  recommendSeeds(trackVec, k) → top-k brains (GNN-reranked)   │
│  embedTrack(canvasImageData) → Float32Array (512-dim)        │
│  observe(retrievedIds, outcomeFitness) → feedback to GNN     │
│  persist() / hydrate()    (IndexedDB via ruvector)           │
└──────────────────────────────────┬───────────────────────────┘
                                   ▼
              vendor/ruvector/          (pre-built WASM)
                ├─ ruvector_wasm/        (HNSW + VectorDB; built once)
                ├─ ruvector_cnn_wasm/    (copy from ruvector/npm/packages/ruvector-cnn/)
                └─ ruvector_gnn_wasm/    (copy from @ruvector/gnn-wasm)
```

The integration lives almost entirely in **one new file**, `ruvectorBridge.js`, exposing a minimal surface. The game files get small, surgical edits (no logic rewrites).

### Brain → vector mapping

A brain in `network.js` is `{ levels: [{ inputs, outputs, biases, weights }] }`. The network topology is fixed at game start — `car.js:37-39` instantiates `new NeuralNetwork([this.sensor.rayCount+1, 8, 4])` and `sensor.js:4` sets `rayCount=5`, giving a default of `[6, 8, 4]`. Every brain has the same flat length. The mapping:

```js
flatten(brain) = concat(
  brain.levels[0].biases,
  flatten2D(brain.levels[0].weights),
  brain.levels[1].biases,
  flatten2D(brain.levels[1].weights),
  ...
) as Float32Array
```

For the default `[6, 8, 4]` topology this is `8 + 6*8 + 4 + 8*4 = 92` dims. This lives inside VectorDB with metric `"cosine"` (orientation of the policy matters, not magnitude).

Metadata stored alongside each vector:
- `fitness` (checkpoints + laps × checkpointCount)
- `fastestLap`
- `trackEmbedding` (a foreign key → the track's embedding id)
- `generation`
- `parentIds` (for GNN-learnable ancestry graph)
- `timestamp`

### Track → vector mapping

On "track done", rasterize the road polygons to an offscreen canvas at ~224×224, feed `ImageData.data` (strip alpha) into `CnnEmbedder.extract()` → 512-dim Float32Array. Store in a second `VectorDB` keyed by a stable track hash. The track-embedding DB is small (dozens of entries at most).

### Retrieval-driven seeding

`begin()` currently pulls a single `bestBrain` from localStorage and mutates it N-1 times. The new flow:

1. Embed the current track → `trackVec`.
2. `recommendSeeds(trackVec, k=5)`: VectorDB search on the track-embedding DB to find similar past tracks, pull their best brains, merge-rank by fitness.
3. Seed the population as:
   - `cars[0]` = best retrieved brain (unchanged — elitism)
   - `cars[1..4]` = retrieved brains, lightly mutated
   - `cars[5..8]` = retrieved brains, heavily mutated (diversity)
   - `cars[9]` = random (novelty)
4. If no archive exists yet (cold start), fall back to the existing random-init behavior.

### GNN re-ranking

`@ruvector/gnn-wasm` (if available as a pre-built artifact; see risks) learns which retrievals predict good outcomes. After each generation:

```js
bridge.observe(retrievedBrainIds, resultingBestFitness)
```

Over many generations, the GNN layer tilts `recommendSeeds` toward brains that have historically produced winning descendants on similar tracks — not just the statically most-fit brain. If the GNN package is not pre-built and building it is non-trivial, this feature degrades to a simpler in-JS reranker (EMA-weighted recency + fitness) and the PRD is still delivered; this is called out under **Risks**.

### IndexedDB persistence

`VectorDB` exposes `saveToIndexedDB()` / `loadFromIndexedDB()`. Bridge wires these in on page `beforeunload` (save) and at module init (hydrate). The existing `localStorage.bestBrain` write-path is kept for one version as a fallback, then removed.

---

## File plan

### New files (created inside the new project root)

| File | Purpose |
|---|---|
| `ruvectorBridge.js` | The single integration surface. Loads WASM, exposes `archiveBrain`, `recommendSeeds`, `embedTrack`, `observe`, `persist`, `hydrate`. |
| `brainCodec.js` | `flatten(brain)` / `unflatten(float32, topology)` — symmetric, covered by a quick sanity script. |
| `vendor/ruvector/ruvector_wasm/` | Pre-built browser WASM for `crates/ruvector-wasm` (VectorDB + HNSW). See "Vendoring" below. |
| `vendor/ruvector/ruvector_cnn_wasm/` | Copied from `ruvector/npm/packages/ruvector-cnn/` (already pre-built). |
| `vendor/ruvector/ruvector_gnn_wasm/` | Copied from the gnn-wasm package if pre-built; otherwise omitted and the JS fallback activates. |
| `uiPanels.js` | Small additions: "similar brains" sidebar, "track-match" badge. Keeps changes out of existing files. |

### Edited files (surgical)

| File | Change |
|---|---|
| `index.html` | Switch main script tag to `type="module"`. Import `ruvectorBridge.js`. Add `<div id="rv-panel">` hook. |
| `main.js` | In `begin()`, replace the `localStorage.bestBrain` block with `bridge.recommendSeeds(...)`. In `nextBatch()`, call `bridge.archiveBrain(bestCar.brain, fitness, trackVec, gen, parents)` and `bridge.observe(...)`. |
| `roadEditor.js` | On "finish track", call `bridge.embedTrack(canvas)` → store the result on a module-level `currentTrackVec`. |
| `networkArchive.js` | **Deleted.** It is not loaded by `index.html` (confirmed against the cloned repo) and its contents are syntactically broken dead code. Archive/retrieval is done by `ruvectorBridge` instead — no shim needed. |
| `network.js` | Unchanged. No pre-existing syntax bugs block the game (see Risk #4). Optionally remove the unreachable first `mutate` definition for tidiness; not required. |
| `style.css` | Styles for the new panel + badge. |

### Files unchanged

`car.js`, `controls.js`, `grapher.js`, `inputVisual.js`, `sensor.js`, `road.js`, `utils.js`, `buttonResponse.js`, `slider.css`.

---

## Vendoring the WASM

Three modules to place under `vendor/ruvector/`:

1. **`ruvector_wasm/`** (VectorDB + HNSW — the core).
   - Source: `ruvector/crates/ruvector-wasm/`.
   - Not shipped pre-built in the npm `@ruvector/wasm` meta-package (that package only fans out to learning/economy/exotic/nervous-system/attention sub-packages; `VectorDB` is not in any of them).
   - **One-time build**: `cd ruvector/crates/ruvector-wasm && wasm-pack build --target web --release`. Copy the resulting `pkg/` directory into `vendor/ruvector/ruvector_wasm/`.
   - Commit the `.wasm` + glue `.js` + `.d.ts` to git (user chose "Vendor pre-built WASM").

2. **`ruvector_cnn_wasm/`** (CNN embedder).
   - Copy `ruvector/npm/packages/ruvector-cnn/` contents (`ruvector_cnn_wasm_bg.wasm`, `ruvector_cnn_wasm.js`, type defs, `index.js`).
   - Already pre-built, no compilation needed.

3. **`ruvector_gnn_wasm/`** (GNN re-ranker — *optional*).
   - Check `ruvector/npm/packages/` for a pre-built artifact. If missing, either `wasm-pack build` the gnn crate, or skip and use the JS fallback.

Load pattern in `ruvectorBridge.js`:

```js
import initVec, { VectorDB } from './vendor/ruvector/ruvector_wasm/ruvector_wasm.js';
import initCnn, { CnnEmbedder } from './vendor/ruvector/ruvector_cnn_wasm/ruvector_cnn_wasm.js';
// optionally: import initGnn, { Reranker } from './vendor/ruvector/ruvector_gnn_wasm/...';

export async function ready() {
  await Promise.all([initVec(), initCnn()]);
  // ...build singletons
}
```

---

## Implementation phases

1. **Replace base (mechanical)** — *done in a prior commit; described here for completeness.*
   - `rm -rf AI-Racing/`
   - `git clone https://github.com/Apgoldberg1/AI-Car-Racer.git` → keep as a tracked directory (strip the nested `.git/`).
   - Commit on the current `main` branch.
   - Verify the cloned game runs. The orphaned, syntactically-broken `networkArchive.js` can be deleted during this phase; it is not loaded and therefore does not block running.

2. **Vendoring**
   - `wasm-pack build` the `ruvector-wasm` crate; copy `pkg/` → `vendor/ruvector/ruvector_wasm/`.
   - Copy CNN package → `vendor/ruvector/ruvector_cnn_wasm/`.
   - Attempt GNN; if not available, mark as TODO and proceed with JS fallback.

3. **Bridge + codec**
   - Write `brainCodec.js` with `flatten` / `unflatten`. Add a self-check at module load that round-trips a random brain.
   - Write `ruvectorBridge.js` with the five functions from the architecture diagram.

4. **Game wiring**
   - Edit `index.html`, `main.js`, `roadEditor.js`, `networkArchive.js` per the file plan.
   - Add `uiPanels.js` + css.

5. **Polish**
   - Add the "track-match" badge, "similar brains" panel, and a small indicator for "GNN observations: N" so the demo tells its own story.

Each phase ends with a manual smoke test in the browser.

---

## Verification

- **Boot**: page loads with no console errors; both WASM modules initialize (log `[ruvector] ready`).
- **Cold start**: with an empty archive, game behaves identically to stock AI-Car-Racer (random init + mutation). Regression bar: stock gameplay must not get worse.
- **Archive round-trip**: manually `bridge.archiveBrain(...)` → refresh page → `bridge.recommendSeeds(...)` returns the same vector. Confirms IndexedDB persistence.
- **Codec**: `unflatten(flatten(b))` is structurally equal to `b` and produces identical `feedForward` outputs on a fixed input.
- **Track similarity**: draw two nearly-identical tracks → `embedTrack` results have cosine similarity > 0.9. Draw a wildly different track → similarity drops.
- **Seeded GA improves**: run N generations with seeding on vs. off (a URL flag `?rv=0` disables the bridge). Compare best-fitness-per-generation curves using `grapher.js`. Expect seeded runs to reach a given fitness in fewer generations on repeat tracks (cold runs may be similar).
- **GNN effect (if enabled)**: after 20+ generations, retrieved brain IDs should cluster around ancestors of prior winners, not just the highest static-fitness brains. Log retrievals and spot-check.

---

## Risks & open questions

1. **`ruvector-wasm` requires a one-time build**. Even though the user picked "vendor pre-built", the VectorDB/HNSW crate has no pre-built browser artifact in the monorepo. Mitigation: treat `wasm-pack build` as a prerequisite step, not an ongoing build dependency. After the first build, the `pkg/` dir is committed and nothing in AI-Car-Racer needs a toolchain.
2. **GNN package may not be pre-built**. If so, degrade to JS fallback (EMA reranker). The demo still shows the other three capabilities; call this out in UI text rather than hiding it.
3. **`networkArchive.js` has the syntax bugs, not `network.js`** (verified against the freshly-cloned repo). The real bugs — `neirpmCpimts[i+1]`, `Level.feedForward(givenInputs,network,levels[0])` (comma instead of dot), `for(let i=0;9<inputCount;i++)`, and the malformed `for(let i=0;j=i<level.outputs.length;j=i++)` in `feedForward` — all live in `networkArchive.js`. **`index.html` does not load `networkArchive.js`**, so these bugs are dead code and don't prevent the game from running. `network.js` itself is functional (see #4).
4. **No runtime `NeuralNetwork` collision.** `network.js` declares `NeuralNetwork` with two back-to-back `mutate` definitions; the first uses an undefined `biases[i]` and mis-iterates weights, but JS's last-definition-wins semantics mean the second (correct) `mutate` is the one actually called. Since `networkArchive.js` is not in the `<script>` list, there's no second `NeuralNetwork` class at runtime. Action: **delete `networkArchive.js`** (dead code) rather than shim it. Optionally remove the dead first `mutate` in `network.js` for clarity, but it's not required for correctness.
5. **WASM cross-origin**: `wasm-pack --target web` output needs a real HTTP server to load (not `file://`). Add a note in README about `python -m http.server` or similar.
6. **Brain topology changes would invalidate the archive**. If the user later changes the hidden-layer size, all stored vectors become the wrong dimensionality. Mitigation: include topology in the DB name (e.g. `brains-6-8-4`), so changes start a fresh archive instead of crashing.

---

## Critical files to read before implementing

- `AI-Car-Racer/main.js` (begin/nextBatch — the GA hook points)
- `AI-Car-Racer/network.js` (brain structure; note broken duplicate)
- `AI-Car-Racer/roadEditor.js` (where track-finalize happens)
- `ruvector/crates/ruvector-wasm/src/lib.rs:189-420` (VectorDB Rust API — source of the JS bindings we'll consume)
- `ruvector/npm/packages/ruvector-cnn/index.d.ts` (CnnEmbedder contract)
- `ruvector/npm/packages/ruvector-wasm/package.json` (confirms VectorDB is not in the meta-package)
