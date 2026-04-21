# RuVector Integration — Implementation Progress Board

**Authoritative spec:** [`ruvector-integration-prd.md`](./ruvector-integration-prd.md)
**Phase-1 swap notes:** [`replace-ai-racing-base.md`](./replace-ai-racing-base.md)

This file is the coordination point for multiple Claude Code sessions implementing the PRD in parallel. Each session: (1) read this file, (2) pick the first `[ ]` task whose dependencies are all `[x]`, (3) claim it, (4) do the work, (5) check it off here.

---

## How to use this file (read first, every session)

1. **Pick a task.** Scan the phase tables top-to-bottom. The first task whose status is `[ ]` *and* whose `Depends on` cells are all `[x]` is yours to claim.
2. **Claim it atomically.** Edit this file to flip the status from `[ ]` → `[~]` and fill in the **Owner** column with a short tag (e.g. `sess-2026-04-21-a`, your terminal hostname, or your initials). Save before doing any other work. If two sessions race, the one whose edit lands second will see the first's claim and pick a different task.
3. **Do the work** described in the PRD section linked from the task row. Don't expand scope — if you discover the task is bigger than described, append to **Working notes** and split it; do not silently grow it.
4. **Verify** using the "Verification" cell. If verification fails, leave status `[~]` (do not check it off) and write a blocker in **Working notes**.
5. **Mark done.** Flip `[~]` → `[x]`, leave the Owner column populated for traceability, and update the **What's next** pointer at the top if your task unblocks something obvious.
6. **Commit.** One commit per task is ideal: `Phase N.X: <subject>`. No Co-Authored-By, no Claude Code attribution (per repo convention).

### Status legend

| Mark | Meaning |
|---|---|
| `[ ]` | Not started — claimable if all deps are `[x]` |
| `[~]` | In progress — owned by the listed session |
| `[x]` | Done — verified |
| `[!]` | Blocked — see Working notes for reason |

### Don'ts

- Don't claim a task whose dependencies aren't all `[x]` — even if you "could start it." Hidden coupling lives in shared files.
- Don't edit files outside your task's listed outputs. If you must, write a note here first.
- Don't skip verification to "ship faster." A `[x]` from one session is what the next session trusts.

---

## What's next (quick pointer)

> **Now ready to claim:** `P4.B` (`index.html` module conversion) — `P3.B` and `P4.A` are `[x]`. Phase 4 is the remaining game-wiring block; P4.B → P4.C → P4.D → P4.E run sequentially because they share `index.html`/`main.js` context. `P4.E` can go parallel with `P4.D` since they touch different files.
>
> **Phase 4 heads-up:** because `network.js` declares `NeuralNetwork`/`Level` as classic-script top-level classes, those bindings are NOT on `globalThis`. Phase 4 `index.html` edits must add a one-line bridge after `network.js` loads: `<script>window.NeuralNetwork = NeuralNetwork; window.Level = Level;</script>`. Without it, `brainCodec.unflatten` (a module) cannot see the class. Validation page at `docs/validation/phase2-verify.html` is the reference pattern.

(Maintainers: keep this paragraph 1–3 sentences; it is the only thing a fresh session needs to read to get moving.)

### Known gotchas (survive across sessions)

Short, high-leverage list — read before you touch these areas:

1. **Vendored `@ruvector/cnn/index.js` carries two local patches** (ESM conversion + ctor field-read order). There's a banner comment at the top of the file, but if you re-run `cp ruvector/npm/packages/ruvector-cnn/* vendor/ruvector/ruvector_cnn_wasm/`, **both patches will be clobbered silently**. After any re-vendor, diff against `HEAD` and re-apply, or use `git checkout vendor/ruvector/ruvector_cnn_wasm/index.js` to restore.
2. **`wasm-pack` writes `pkg/.gitignore` = `*`** — it assumes `pkg/` is ephemeral. For vendoring workflows (`P2.A`, any future WASM re-build), `rm -f pkg/.gitignore` before `git add`, or `git add -f`.
3. **Classic-script `class` declarations aren't on `globalThis`.** `NeuralNetwork` and `Level` in `network.js` are visible to other classic scripts by bare name but invisible to ES modules. `brainCodec.unflatten` depends on `globalThis.NeuralNetwork`, so `index.html` (after Phase 4) needs `<script>window.NeuralNetwork = NeuralNetwork; window.Level = Level;</script>` right after `<script src="network.js">`.
4. **Re-run the verifier after any vendor change:** `python3 -m http.server 8765` from repo root, then open `http://localhost:8765/docs/validation/phase2-verify.html` (phase-2) and `phase3-verify.html` (phase-3 bridge round-trip). All checks should read `OK`.
5. **Upstream `VectorDB.saveToIndexedDB` / `loadFromIndexedDB` are stubs** — `save` is a no-op that resolves `true`, `load` always rejects `"Not yet implemented"` (see `ruvector/crates/ruvector-wasm/src/lib.rs:402-421`). `ruvectorBridge.js` therefore owns persistence itself via `window.indexedDB` under the DB name `rv_car_learning` with stores `brains_6_8_4`, `tracks`, `observations`. Don't waste time debugging why ruvector's own persistence "isn't working" — it was never implemented upstream.
6. **VectorDB's `.score` is cosine DISTANCE, not similarity.** For the `"cosine"` metric, `score = 1 - cosine_similarity` (range `[0, 2]`; lower is better). If you pass a `score` into a formula expecting similarity, negative fitness weights will appear and low-distance matches will look "bad". Convert with `sim = 1 - score` before ranking. The bridge already does this in `recommendSeeds`.

---

## Phase 1 — Replace base (DONE)

PRD ref: *Implementation phases → 1. Replace base (mechanical)*

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P1.1 | Clone `Apgoldberg1/AI-Car-Racer`, strip nested `.git/`, delete `AI-Racing/` | `[x]` | initial-session | — | `AI-Car-Racer/` exists, `AI-Racing/` gone | `ls` confirms; cloned game served on `python3 -m http.server` renders track editor |
| P1.2 | Reconcile PRD with cloned-code reality (topology, network.js vs networkArchive.js, file plan) | `[x]` | initial-session | P1.1 | edits in `ruvector-integration-prd.md` | PRD references resolve against `AI-Car-Racer/` files |

---

## Phase 2 — Vendor WASM (3 parallel sessions)

PRD ref: *Vendoring the WASM*

All three rows below have **no shared files** and **no order dependency** — fan out freely. Each writes to its own subdirectory under `vendor/ruvector/`.

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P2.A | Build `ruvector-wasm` crate with `wasm-pack build --target web --release` and copy `pkg/` into `vendor/ruvector/ruvector_wasm/`. Commit the `.wasm` + glue `.js` + `.d.ts` (vendor pre-built). | `[x]` | sess-2026-04-21-mac (swarm) | P1.1 | `vendor/ruvector/ruvector_wasm/{ruvector_wasm.js, ruvector_wasm_bg.wasm, *.d.ts, package.json}` | `import initVec, { VectorDB } from './vendor/ruvector/ruvector_wasm/ruvector_wasm.js'` resolves; `await initVec()` succeeds in browser; `new VectorDB(92, "cosine")` constructs without throwing |
| P2.B | Copy contents of `ruvector/npm/packages/ruvector-cnn/` into `vendor/ruvector/ruvector_cnn_wasm/`. Already pre-built — no compilation. | `[x]` | sess-2026-04-21-mac (swarm) | P1.1 | `vendor/ruvector/ruvector_cnn_wasm/{ruvector_cnn_wasm.js, ruvector_cnn_wasm_bg.wasm, *.d.ts, index.js}` | `import initCnn, { CnnEmbedder } from '...'` resolves; `await initCnn()` succeeds; `new CnnEmbedder()` constructs |
| P2.C | (Optional) Vendor a pre-built `gnn-wasm` from `ruvector/npm/packages/`. If no pre-built artifact exists, mark `[!]` with reason and proceed — JS fallback is acceptable per PRD. | `[!]` | sess-2026-04-21-mac (swarm) | P1.1 | `vendor/ruvector/ruvector_gnn_wasm/...` **OR** a `[!]` note explaining that the JS fallback path will be used | `await initGnn()` succeeds **OR** documented blocker that activates the EMA-reranker fallback |

---

## Phase 3 — Bridge + codec

PRD ref: *Implementation phases → 3. Bridge + codec*; *Architecture overview*

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P3.A | Write `AI-Car-Racer/brainCodec.js`: `flatten(brain)` and `unflatten(float32, topology)` for the `[6, 8, 4]` topology (92 dims). Add a self-check at module load that round-trips a random brain and compares `feedForward` outputs. | `[x]` | sess-2026-04-21-mac (swarm) | P1.1 | `AI-Car-Racer/brainCodec.js` | `unflatten(flatten(b))` is structurally equal to `b`; `feedForward` produces identical outputs on a fixed input vector |
| P3.B | Write `AI-Car-Racer/ruvectorBridge.js`: exports `ready()`, `archiveBrain(brain, fitness, trackVec, gen, parentIds)`, `recommendSeeds(trackVec, k)`, `embedTrack(canvasImageData)`, `observe(retrievedIds, outcomeFitness)`, `persist()`, `hydrate()`. Loads VectorDB + CnnEmbedder. If GNN package vendored, wire it; else use EMA-weighted in-JS reranker. | `[x]` | sess-2026-04-20-ship-task | P2.A, P2.B, P3.A | `AI-Car-Racer/ruvectorBridge.js` | Verified 2026-04-20 via `docs/validation/phase3-verify.html`: archive → persist → fresh-module hydrate → `recommendSeeds` returns same `vec_0`, `feedForward` outputs match, EMA shifts score 0.9393→1.0208 after `observe`, cold-start returns `[]`, dissimilar-track sim drops to -0.031. Native-IDB persistence (upstream stubs bypassed). |

---

## Phase 4 — Game wiring

PRD ref: *Implementation phases → 4. Game wiring*; *File plan → Edited files*

P4.A is the only one that has zero deps on the bridge — claim it first if you have a session free. P4.B–E all touch game files, so they run **sequentially** in the order shown to avoid merge conflicts (each touches a distinct file, but they share a verification: "the game must still boot at every step").

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P4.A | Delete `AI-Car-Racer/networkArchive.js` (orphan dead code, not loaded by `index.html`). | `[x]` | sess-2026-04-20-ship-task | P1.1 | `networkArchive.js` removed | Verified 2026-04-20: game boots at `http://localhost:8766/AI-Car-Racer/index.html`, track-editor buttons (Next/Save Track/Delete Track/Delete Point) render correctly. |
| P4.B | `AI-Car-Racer/index.html`: change `<script src="main.js">` → `type="module"`. Import `ruvectorBridge.js`. Add `<div id="rv-panel">` placeholder. Other game scripts stay classic for now (or convert to imports inside `main.js`). | `[ ]` |  | P3.B | edited `index.html` | Game boots; `[ruvector] ready` logs to console; `rv-panel` div exists in DOM |
| P4.C | `AI-Car-Racer/main.js`: in `begin()`, replace the `localStorage.bestBrain` block (lines 50-58) with `bridge.recommendSeeds(currentTrackVec, k=10)` and seed cars per the PRD (elitism + light/heavy mutation + novelty). In `nextBatch()`, call `bridge.archiveBrain(bestCar.brain, fitness, currentTrackVec, gen, parents)` and `bridge.observe(...)`. Keep cold-start fallback (random init when archive empty). Honor `?rv=0` URL flag to disable bridge. | `[ ]` |  | P3.A, P3.B, P4.B | edited `main.js` | Cold start (empty archive) is behaviorally identical to stock. Refresh after one generation → `recommendSeeds` returns prior winner. `?rv=0` falls back to stock behavior. |
| P4.D | `AI-Car-Racer/roadEditor.js`: at track-finalize (the transition from `phase=2` track-editing into `phase=3/4` — find the exact hook in `buttonResponse.js`), rasterize the canvas to ~224×224, call `bridge.embedTrack(imageData)`, store the result on a module-level `currentTrackVec`. | `[ ]` |  | P3.B, P4.B | edited `roadEditor.js` (and likely `buttonResponse.js`) | Drawing two near-identical tracks → cosine sim of the resulting vectors > 0.9. Wildly different track → sim drops. |
| P4.E | Add `AI-Car-Racer/uiPanels.js`: render the "similar past brains" sidebar and "this track resembles…" badge into `#rv-panel`. Add styles in `style.css` (or a new `rv-panel.css`). | `[ ]` |  | P4.B | `uiPanels.js`, css edits | Panel renders; badge appears on track-finalize when archive is non-empty |

---

## Phase 5 — Polish & demo legibility (parallelizable: 3 sessions)

PRD ref: *Implementation phases → 5. Polish*; *Goals → 4. Make the demo legible*

These items are independent of each other — each touches a different UI affordance — so claim freely once Phase 4 is done.

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P5.A | Track-match badge text & animation: *"This track is N% similar to one you've trained on — loading K best candidate brains as seeds."* Numbers come from the cosine similarity returned by `embedTrack` + `recommendSeeds`. | `[ ]` |  | P4.D, P4.E | edits in `uiPanels.js`, `style.css` | Badge appears on track-finalize, shows correct % and K, fades after 4s |
| P5.B | "Similar past brains" sidebar: per seed, show fitness, fastest lap, generation, and a tiny sparkline of its lineage. | `[ ]` |  | P4.C, P4.E | edits in `uiPanels.js`, `style.css` | Sidebar populates after `begin()`; updates on `nextBatch()` |
| P5.C | GNN-observations indicator (or EMA-reranker indicator if P2.C was skipped): "GNN observations: N · last reranking shifted top-K by M positions." | `[ ]` |  | P4.C | edits in `uiPanels.js` | Indicator increments each generation; visible during phase=4 |
| P5.D | Annotated fitness-over-generations graph in `grapher.js`: mark generations where `recommendSeeds` returned a non-empty result, and where the GNN reranker promoted/demoted a seed. | `[ ]` |  | P4.C | edits in `grapher.js` | Graph shows annotations on the right generations |

---

## Cross-cutting verification (run after every phase)

The PRD's *Verification* section lists six gates. Re-run the relevant ones whenever a phase closes.

- [ ] **Boot**: page loads, no console errors, both WASM modules log `[ruvector] ready` (after P2 + P3.B) — *bridge logs `[ruvector] ready` correctly in isolation; full-game boot is still P4.B.*
- [ ] **Cold start**: empty archive → behaves identically to stock AI-Car-Racer (after P4.C)
- [x] **Archive round-trip**: `archiveBrain` → refresh → `recommendSeeds` returns the same vector (after P3.B) — verified 2026-04-20 via `docs/validation/phase3-verify.html`. Bridge owns persistence directly via native IndexedDB; upstream `VectorDB.saveToIndexedDB/loadFromIndexedDB` are stubs.
- [x] **Codec**: `unflatten(flatten(b))` is structurally equal to `b`; `feedForward` outputs match (after P3.A) — verified 2026-04-21 via `docs/validation/phase2-verify.html`, `feedForward` output `[1,0,1,1]` matches on both brains.
- [ ] **Track similarity**: similar tracks → cosine sim > 0.9 (after P4.D)
- [ ] **Seeded GA improves**: with seeding ON, reaches a target fitness in fewer generations than `?rv=0` on a repeat track (after P5)
- [ ] **GNN effect** (only if P2.C succeeded): retrieved IDs cluster around productive ancestors after 20+ generations (after P5)

---

## Working notes / blockers (append-only)

Sessions: append a dated entry below — don't edit prior entries.

```
2026-04-20 · initial-session · Phase 1 (P1.1, P1.2) complete.
  Notes for next sessions:
    - Game files live flat in AI-Car-Racer/ (no src/ subdir).
    - networkArchive.js is dead code — P4.A can ship as a one-line PR anytime.
    - Topology is [6, 8, 4] = 92 dims (NOT [5, 6, 4] / 64 as PRD originally said; PRD is now corrected).
    - The "track-finalize" hook is not obvious in roadEditor.js itself — likely in buttonResponse.js
      where phase transitions are wired. P4.D will need to grep for the phase=2 → phase=3 transition.
    - There's a `slider tests/` directory in the cloned repo not mentioned in the PRD; appears unused, leave it.

2026-04-21 · sess-mac (swarm) · Phase 2 + P3.A complete (4-agent fan-out).
  Results:
    - P2.A [x]: wasm-pack build ran in ~44s (warm target/ cache — budget 3-8 min on cold).
              `vendor/ruvector/ruvector_wasm/` now has glue JS (42 KB) + .wasm (237 KB) + .d.ts.
              Verified in a real browser: `new VectorDB(92, "cosine")` constructs.
    - P2.B [x]: CNN package copied (~52 KB wasm + 28 KB glue + 7 KB wrapper).
              TWO upstream bugs patched in the vendored copy (see below).
    - P2.C [!]: SKIPPED — no pre-built GNN package in ruvector/npm/packages/; the crate
              ruvector-gnn-wasm depends on ruvector-gnn which transitively pulls rayon +
              dashmap + parking_lot (rayon is a known wasm32 headache). Per PRD risk #2,
              ruvectorBridge.js will use the in-JS EMA-reranker fallback. Probe path for
              future re-attempts: vendor/ruvector/ruvector_gnn_wasm/ruvector_gnn_wasm.js
              (matches cnn-wasm naming so bridge can lazy-probe with try/catch).
    - P3.A [x]: brainCodec.js written. Float32Array(92). Layout: L0 biases(8), L0 weights
              row-major 6x8 (48), L1 biases(4), L1 weights row-major 8x4 (32). Round-trip
              feedForward verified identical outputs on fixed input [0.1..0.6].

  Patches applied to vendored @ruvector/cnn (documented here so future vendor re-pulls
  know what to reapply):
    (1) index.js converted from CommonJS `module.exports = {...}` to ESM
        `export { init, CnnEmbedder, ... }; export default init;` with a guarded CJS
        tail for Node compatibility. Upstream is authored for Node+bundler only; in a
        no-bundler browser context the `module` global throws ReferenceError at parse.
    (2) index.js CnnEmbedder constructor (line ~79-80): swap the order of
        `this._embeddingDim = wasmConfig.embedding_dim; this._inner = new wasm.WasmCnnEmbedder(wasmConfig);`.
        Upstream reads the field AFTER the ctor consumes wasmConfig, which panics
        "null pointer passed to rust" because wasm-bindgen has taken the inner ptr.

  Notes for downstream sessions:
    - `class NeuralNetwork {}` in network.js is declared in a classic script. Classic-
      script top-level class/let/const declarations do NOT land on globalThis (only
      `var` and `function` do). Modules cannot see them by bare name OR via
      globalThis.NeuralNetwork. Fix: add one-line bridge in index.html right after
      `<script src="network.js">`:
        <script>window.NeuralNetwork = NeuralNetwork; window.Level = Level;</script>
      The validation page docs/validation/phase2-verify.html is the reference pattern
      and is kept in-tree for re-runs.
    - P3.B (bridge) is now fully unblocked: P2.A [x], P2.B [x], P3.A [x], P2.C [!]
      (EMA fallback path required).
    - P4.A (delete networkArchive.js) is also unblocked and independent of the bridge —
      a zero-risk parallel claim.

  Verification trail:
    - docs/validation/phase2-verify.html — re-runnable verifier (serves from repo root).
    - docs/validation/screenshots/phase2-verify.png — captured "all green" state.
    - Browser console output (headless Chromium via agent-browser):
        [P3.A] OK — flatten length=92, feedForward match=true, o1=[1,0,1,1] o2=[1,0,1,1]
        [P2.A] OK — initVec() + new VectorDB(92,"cosine") constructed (type=VectorDB)
        [P2.B] OK — initCnn() + new CnnEmbedder() constructed; embeddingDim=512
        [verify] done

2026-04-20 · sess-ship-task · Phase 3 (P3.B) + P4.A complete.
  Work:
    - P3.B [x]: ruvectorBridge.js (~270 LOC). Module-singleton bridge with five
              PRD-mandated functions plus `info()` and `_debugReset()`. Two
              VectorDBs (brains 92-d, tracks 512-d) + CnnEmbedder. EMA reranker
              as the GNN fallback (α=0.3). Retrieval joins trackDB search hits
              against brainMirror via meta.trackId (VectorDB's filter semantics
              weren't worth reverse-engineering).
    - P4.A [x]: `/bin/rm -f AI-Car-Racer/networkArchive.js`. (Note: the user's
              shell has `rm` aliased to `rm -i`; the `/bin/rm` form bypasses it.)

  Discoveries that became cross-session gotchas (added to §Known gotchas):
    (5) Upstream VectorDB.saveToIndexedDB/loadFromIndexedDB in
        ruvector/crates/ruvector-wasm/src/lib.rs:402-421 are STUBS — save is a
        no-op that resolves `true`, load always rejects. The bridge owns
        persistence via native `window.indexedDB` (DB: `rv_car_learning`,
        stores: `brains_6_8_4`, `tracks`, `observations`). Topology-scoped
        store name handles PRD risk #6 for free.
    (6) VectorDB's `.score` is cosine DISTANCE (1 - sim, range [0,2]),
        NOT similarity. First pass of the bridge scored identical tracks at
        `trackSim=-0.0000` because I treated distance as similarity in the
        0.5+0.5*s map. One-line fix in `recommendSeeds`: `const sim = 1 - th.score`.

  Verification trail:
    - docs/validation/phase3-verify.html — re-runnable verifier; five checks
      (round-trip, observe→EMA, cold-start, dissimilar-track, feedForward-match).
    - Headless-Chromium output via agent-browser:
        [session A] archived id=vec_0 info={brains:1,tracks:1,observations:0,...}
        [session B] after hydrate info={brains:1,tracks:1,observations:0,...}
        [session B] recommendSeeds → id=vec_0 trackSim=1.0000 score=0.9393
        [P3.B] OK — id-match=true feedForward-match=true o1=[1,1,0,0] o2=[1,1,0,0]
        [observe] OK — after hydrate obs count=1 seed.score=1.0208
        [cold-start] OK — recommendSeeds on empty archive returned 0 results
        [dissimilar] OK — same-track trackSim=1.0000 > different-track trackSim=-0.0309
        [verify] done
    - P4.A boot check: http://127.0.0.1:8766/AI-Car-Racer/index.html loads the
      track editor with buttons Next / Save Track / Delete Track / Delete Point.

  Notes for downstream sessions:
    - P4.B (next) converts index.html's main script to `type="module"` and
      imports ruvectorBridge. Add the window.NeuralNetwork/Level bridge line
      right after `<script src="network.js">` (see known gotcha #3).
    - Bridge is module-singleton. All state lives in closure-scoped Maps; a
      page reload blows state away and `hydrate()` restores from IDB on the
      next `ready()`. Do not try to construct a second bridge in the same tab.
    - `recommendSeeds` returns `{id, vector, meta, score, trackSim}[]`. Caller
      (main.js, in P4.C) is responsible for `unflatten(vec)` → NeuralNetwork.
      This keeps `network.js`-coupled code on the caller side and the bridge
      free of globalThis lookups.
```
