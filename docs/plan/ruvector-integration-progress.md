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

> **All Phase-5 tasks done.** P5.D landed three small files of changes (`grapher.js`, `buttonResponse.js`, `main.js`) plus one screenshot. The annotated graph now overlays cyan dots ("seeded from archive" — generations where `recommendSeeds` returned non-empty) and amber upward ticks ("reranker shift" — top-K seed-ordering displacement vs the previous batch, scaled by magnitude with an 18px cap). Annotations persist in `localStorage.rvAnnotations` parallel to `localStorage.progress` and are recorded inside `save()` so they stay length-aligned even with the manual "Save Best and Restart" button. `graphProgress()` is now also called from `nextBatch()` so the chart updates live during training rather than only on phase-4 (re)entry.
>
> **Phase 5 heads-up:** (a) The panel's render loop in `uiPanels.js` is memoised against `{ready, brains, tracks, observations, phase, trackVecId, seedIdsKey}` — if you add a new input (e.g., a "last-reranked-at" timestamp for P5.C's GNN/EMA indicator), extend both the `last` struct and the fast-path comparison. (b) `recommendSeeds` returns `{id, vector, meta, score, trackSim}` per hit. (c) `window.NeuralNetwork`/`Level` + `window.__rvUnflatten` are still exposed on the window for any classic-script needs — don't duplicate those bridges. (d) **P5.A pattern for one-shot CSS animations:** uiPanels.js uses `remove-class → force reflow (`void el.offsetWidth`) → re-add class` to restart `@keyframes` from frame 0, and listens for `animationend` to flip state after. Reuse this if P5.C wants the GNN/EMA indicator to pulse on observations tick. (e) **P5.B added `bridge.getLineage(id, maxDepth=6)`** — returns `[{id, fitness, generation}, ...]` oldest→newest, walks the highest-fitness parent at each step, visited-set + depth-cap both protect against cycles. Use this for any ancestry-aware rendering rather than walking `_brainMirror` from the UI. (f) **Narrow-sidebar gotcha**: the panel is in `grid-column: 2` and shares vertical space with the button strip; a single-row grid of many columns (>6) clips off the right edge. Prefer a two-row layout (header fields + a bottom row for visuals). The P5.B sidebar is the reference pattern — see `.rv-item-top` / `.rv-item-bottom` in `style.css`.

(Maintainers: keep this paragraph 1–3 sentences; it is the only thing a fresh session needs to read to get moving.)

### Known gotchas (survive across sessions)

Short, high-leverage list — read before you touch these areas:

1. **Vendored `@ruvector/cnn/index.js` carries two local patches** (ESM conversion + ctor field-read order). There's a banner comment at the top of the file, but if you re-run `cp ruvector/npm/packages/ruvector-cnn/* vendor/ruvector/ruvector_cnn_wasm/`, **both patches will be clobbered silently**. After any re-vendor, diff against `HEAD` and re-apply, or use `git checkout vendor/ruvector/ruvector_cnn_wasm/index.js` to restore.
2. **`wasm-pack` writes `pkg/.gitignore` = `*`** — it assumes `pkg/` is ephemeral. For vendoring workflows (`P2.A`, any future WASM re-build), `rm -f pkg/.gitignore` before `git add`, or `git add -f`.
3. **Classic-script `class` declarations aren't on `globalThis`.** `NeuralNetwork` and `Level` in `network.js` are visible to other classic scripts by bare name but invisible to ES modules. `brainCodec.unflatten` depends on `globalThis.NeuralNetwork`, so `index.html` (after Phase 4) needs `<script>window.NeuralNetwork = NeuralNetwork; window.Level = Level;</script>` right after `<script src="network.js">`.
4. **Re-run the verifier after any vendor change:** `python3 -m http.server 8765` from repo root, then open `http://localhost:8765/docs/validation/phase2-verify.html` (phase-2) and `phase3-verify.html` (phase-3 bridge round-trip). All checks should read `OK`.
5. **Upstream `VectorDB.saveToIndexedDB` / `loadFromIndexedDB` are stubs** — `save` is a no-op that resolves `true`, `load` always rejects `"Not yet implemented"` (see `ruvector/crates/ruvector-wasm/src/lib.rs:402-421`). `ruvectorBridge.js` therefore owns persistence itself via `window.indexedDB` under the DB name `rv_car_learning` with stores `brains_6_8_4`, `tracks`, `observations`. Don't waste time debugging why ruvector's own persistence "isn't working" — it was never implemented upstream.
6. **VectorDB's `.score` is cosine DISTANCE, not similarity.** For the `"cosine"` metric, `score = 1 - cosine_similarity` (range `[0, 2]`; lower is better). If you pass a `score` into a formula expecting similarity, negative fitness weights will appear and low-distance matches will look "bad". Convert with `sim = 1 - score` before ranking. The bridge already does this in `recommendSeeds`.
7. **Don't `drawImage`-downscale the game canvas into the CNN.** The game canvas is 3200×1800 with 2-px track lines; scaling to 224×224 (the CNN input) collapses the lines to ~0.14-px intensity and the embedder returns a near-constant vector regardless of track shape (sim ≈ 0.99 between *any* two tracks — the original P4.D bug). Re-rasterise at the target resolution with thick strokes instead. `buttonResponse.js::embedCurrentTrack` is the canonical example; any future canvas→CNN work (track badges, replay thumbnails) must do the same or the embeddings will be useless.

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
| P4.B | `AI-Car-Racer/index.html`: sidecar `<script type="module">` imports bridge and exposes `window.__rvBridge`; `main.js` left classic to preserve globals (see 2026-04-20 working note for rationale). Added `NeuralNetwork`/`Level` globalThis bridge and `<div id="rv-panel">`. | `[x]` | sess-2026-04-20-ship-task-b | P3.B | edited `index.html` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8765/AI-Car-Racer/index.html`: boot renders track editor, `[ruvector] ready — brains=0 tracks=0 obs=0` logs, `#rv-panel` present, `window.__rvBridge.info().ready === true`, classic globals (`phase`, `begin`, `road`, etc.) intact. |
| P4.C | `AI-Car-Racer/main.js`: in `begin()`, replace the `localStorage.bestBrain` block (lines 50-58) with `bridge.recommendSeeds(currentTrackVec, k=10)` and seed cars per the PRD (elitism + light/heavy mutation + novelty). In `nextBatch()`, call `bridge.archiveBrain(bestCar.brain, fitness, currentTrackVec, gen, parents)` and `bridge.observe(...)`. Keep cold-start fallback (random init when archive empty). Honor `?rv=0` URL flag to disable bridge. | `[x]` | sess-2026-04-20-ship-task-c | P3.A, P3.B, P4.B | edited `main.js`; added `window.__rvUnflatten` to `index.html` sidecar | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8765/AI-Car-Racer/index.html`: cold start shows `brains=0`, `archiveBrain`→reload→`brains=1` (IDB round-trip), `recommendSeeds(null,10)` returns the archived `vec_0` as 92-dim vector, `begin()` on hydrated archive logs `[ruvector] seeded 10 cars from 1 retrievals (elite=1, light=4, heavy=4, novel=1)` — matches PRD split. `?rv=0` → `rvDisabled=true`, `bridgeReady()` false, `currentSeedIds=[]`, no seeded-log. |
| P4.D | `AI-Car-Racer/buttonResponse.js`: at track-finalize (`nextPhase()` case 3, after `submitTrack()`), re-rasterize the track paths at 224×224 with thick strokes (do NOT `drawImage`-downscale the 3200×1800 canvas — 2-px lines become invisible), call `bridge.embedTrack(rgb, 224, 224)`, publish on `window.currentTrackVec`. | `[x]` | sess-2026-04-20-ship-task-d | P3.B, P4.B | edited `buttonResponse.js` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8767/AI-Car-Racer/index.html`: two rectangle tracks with ≤20px point jitter → sim=0.994 (>0.9 gate). Rectangle vs triangle+pentagon → sim=0.711. UI click-path Next→Next→Next → `phase=3`, `window.currentTrackVec` is Float32Array(512). Archiving a brain with the vec → `bridge.info().tracks` 0→1. |
| P4.E | Add `AI-Car-Racer/uiPanels.js`: render the "similar past brains" sidebar and "this track resembles…" badge into `#rv-panel`. Add styles in `style.css` (or a new `rv-panel.css`). | `[x]` | sess-2026-04-20-ship-task-e | P4.B | `uiPanels.js`, `style.css` (+ one `<script src>` line in `index.html`) | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8769/AI-Car-Racer/index.html`: empty-archive → info "0 brains · 0 tracks · 0 obs · ema", badge hidden, empty-state copy. After archiving a brain + reload: sidebar row "#1 vec_0 50% fit 42.0 g0 p0". After Next→Next (phase=3): badge reads "This track is 51% similar to one you've trained on — loading 1 candidate brain as seeds.". `?rv=0`: info "disabled (?rv=0)" (muted), list explains disabled state, badge hidden. Screenshots at `docs/validation/screenshots/p4e-panel-{phase3,rv0}.png`. |

---

## Phase 5 — Polish & demo legibility (parallelizable: 3 sessions)

PRD ref: *Implementation phases → 5. Polish*; *Goals → 4. Make the demo legible*

These items are independent of each other — each touches a different UI affordance — so claim freely once Phase 4 is done.

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P5.A | Track-match badge text & animation: *"This track is N% similar to one you've trained on — loading K best candidate brains as seeds."* Numbers come from the cosine similarity returned by `embedTrack` + `recommendSeeds`. | `[x]` | sess-2026-04-20-ship-task-5a | P4.D, P4.E | edits in `uiPanels.js`, `style.css` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8780/AI-Car-Racer/index.html`: driven to phase=3, badge shows correct 55% + "1 candidate brain" (singular). Sampled opacity at 200ms resolution across full animation: fade-in 0→1 in ~500ms, holds at 1.000 for ~3.8s, fades 1→0 in ~400ms, `animationend` sets `hidden=true` at ~4966ms. Observations-tick mid-hold (0→1) does NOT restart animation — identity guard works. Screenshot: `docs/validation/screenshots/p5a-badge-holding.png`. |
| P5.B | "Similar past brains" sidebar: per seed, show fitness, fastest lap, generation, and a tiny sparkline of its lineage. | `[x]` | sess-2026-04-20-ship-task-5b | P4.C, P4.E | edits in `uiPanels.js`, `style.css`, `ruvectorBridge.js`, `main.js` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8790/AI-Car-Racer/index.html`: synthetic 3-brain lineage chain renders as "#1 50% fit 52.0 11.07s g2 p2 / LINEAGE [3pt-polyline]", "#2 fit 35.0 14.22s g1 p1 / [2pt-line]", "#3 fit 20.0 18.50s g0 p0 / [single-dot]". Legacy brain (no fastestLap meta) → lap renders `—`. `getLineage(id, 3)` truncates an 8-deep chain to the 3 newest; multi-parent walker picks fit=99 ancestor over fit=5. `?rv=0` unchanged. Phase-3 flow: badge + lap=12.34s + sparkline all present. Screenshots: `docs/validation/screenshots/p5b-sidebar-lineage.png`, `p5b-phase3-lap.png`. |
| P5.C | GNN-observations indicator (or EMA-reranker indicator if P2.C was skipped): "GNN observations: N · last reranking shifted top-K by M positions." | `[x]` | sess-2026-04-20-ship-task-5c | P4.C | edits in `uiPanels.js`, `ruvectorBridge.js` (`info().observationEvents`), `style.css` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8795/AI-Car-Racer/index.html`: empty archive → "EMA reranker: idle (awaiting first observation)"; single observe that swaps two seeds → "last shift 2 positions"; repeat observe on the same id → events counter ticks (1→2) and shift recomputes; zero-effect observe on already-top seed → "last shift 0 positions"; non-reranker reshuffle (new brain archived) leaves `lastShift` unchanged; `?rv=0` hides the line; phase=4 visibility confirmed; real `nextBatch()` end-to-end shows events 6→10→11 and shifts 10→1 across two generations. Screenshots: `docs/validation/screenshots/p5c-reranker-indicator.png`, `p5c-reranker-idle.png`, `p5c-reranker-disabled.png`. |
| P1.A | GNN reranker — vendored `ruvector_gnn_wasm`, `gnnReranker.js` assembles graph from `_brainMirror` (nodes=brains, edges=`meta.parentIds`, features=`[fitnessNorm, generationNorm, trackSim]`), replaces `obsTerm` in `recommendSeeds()` when archive ≥ 10 brains (else silent EMA fallback). Stats panel shows `reranker: gnn \| ema \| none` with ELI15 badge → `chapters/gnn.js`. | `[x]` | sess-2026-04-21-ship-task-p1a | P0.A | new: `AI-Car-Racer/gnnReranker.js`, `AI-Car-Racer/eli15/chapters/gnn.js`, `vendor/ruvector/ruvector_gnn_wasm/`, `tests/gnn-replay.html`, `tests/fixtures/{baseline,peer-pressure,adversarial}.json` + generator; edits in `ruvectorBridge.js`, `uiPanels.js`, `style.css`, `eli15/index.js` | Verified 2026-04-21 via agent-browser at `http://localhost:8767/`: replay test passes 3/3 fixtures (`top1_fitness(GNN) ≥ top1_fitness(EMA)` — adversarial fixture shows GNN picks H5 fit=500 while EMA picks H4 fit=440, a genuine ranker improvement). Main app shows `reranker: gnn` badge (green chip) once archive ≥ 10 brains; ELI15 badge opens "GNN reranker — like EMA, but with peer pressure" chapter. `?rv=0` hides the reranker row and shows "disabled (?rv=0)" in the info strip. `info()` exposes `reranker`, `gnnLoaded`, `rerankerThreshold: 10`. |
| P5.D | Annotated fitness-over-generations graph in `grapher.js`: mark generations where `recommendSeeds` returned a non-empty result, and where the GNN reranker promoted/demoted a seed. | `[x]` | sess-2026-04-20-ship-task-5d | P4.C | edits in `grapher.js`, `buttonResponse.js`, `main.js` | Verified 2026-04-20 via agent-browser at `http://127.0.0.1:8800/AI-Car-Racer/index.html`: per-batch annotations record into `localStorage.rvAnnotations` parallel to `progress[]`. Cold-start batch correctly records `{seeded:false, shift:0}`; subsequent batches with growing archive record `seeded:true` and shift values matching Spearman's-footrule arithmetic on the top-K transitions (1, 3, 5, 7 across batches 1-5 of the rich-data run). `?rv=0` produces all-zero annotations (no false positives). `resetTrainCount()` clears `rvAnnotations` + the in-memory `__rvLastSeedIdsForGraph` baseline. Annotations persist across reload and re-hydrate cleanly. `graphProgress()` now refreshes per `nextBatch()` (was previously only rendered on phase-4 entry). Hardened pre-existing renderer fragility: numeric filter on min/max math + lifted-pen across non-numeric entries (the default `fastLap='--'` would otherwise NaN-poison every y-coord and silently blank the chart). Screenshot: `docs/validation/screenshots/p5d-graph-annotations.png`. |

---

## Cross-cutting verification (run after every phase)

The PRD's *Verification* section lists six gates. Re-run the relevant ones whenever a phase closes.

- [x] **Boot**: page loads, no console errors, bridge logs `[ruvector] ready` — verified 2026-04-20 in full game context at `http://127.0.0.1:8765/AI-Car-Racer/index.html` (after P4.B sidecar-module wiring). The two HNSW-warning lines are upstream `vector_db.rs:93` stylised warnings, expected on wasm-web builds using the flat index.
- [x] **Cold start**: empty archive → behaves identically to stock AI-Car-Racer (after P4.C) — verified 2026-04-20: with empty archive, `begin()` falls through the bridge branch (`seededFromBridge=false`) and uses the original `localStorage.bestBrain` path unchanged (or random init if no bestBrain). On first-ever boot, `begin()` runs before the async `bridge.ready()` resolves, so `bridgeReady()` returns false and the stock path runs regardless of archive state — this is what preserves the "identical to stock" property at the phase-1 welcome screen.
- [x] **Archive round-trip**: `archiveBrain` → refresh → `recommendSeeds` returns the same vector (after P3.B) — verified 2026-04-20 via `docs/validation/phase3-verify.html`. Bridge owns persistence directly via native IndexedDB; upstream `VectorDB.saveToIndexedDB/loadFromIndexedDB` are stubs.
- [x] **Codec**: `unflatten(flatten(b))` is structurally equal to `b`; `feedForward` outputs match (after P3.A) — verified 2026-04-21 via `docs/validation/phase2-verify.html`, `feedForward` output `[1,0,1,1]` matches on both brains.
- [x] **Track similarity**: similar tracks → cosine sim > 0.9 (after P4.D) — verified 2026-04-20: near-identical rectangle tracks sim=0.994; rectangle vs triangle+pentagon sim=0.711. Required a non-obvious implementation fix (re-rasterize at 224×224 target resolution rather than downscaling 3200×1800 — see working note below).
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

2026-04-20 · sess-ship-task-b · P4.B complete, with a deliberate deviation
  from the task text.

  Deviation: kept `main.js` as a classic script instead of making it
  `type="module"`. Added a SIDECAR `<script type="module">` at the end of
  index.html that does `import * as bridge from './ruvectorBridge.js';
  window.__rvBridge = bridge; bridge.ready()`. Also added the
  window.NeuralNetwork/Level classic bridge after `<script src="network.js">`
  and a `<div id="rv-panel"></div>` into the body.

  Why the deviation: converting `main.js` to a module would break every
  cross-script reference to its top-level `var`/`let`/`const`/`function`
  declarations. I grepped and found heavy coupling — `buttonResponse.js`
  mutates `pause`, `phase`, `fastLap`, `batchSize`, `nextSeconds`,
  `mutateValue`, `maxSpeed`, `traction`, `invincible` by bare name; `car.js`
  reads `invincible`, `traction`, `frameCount`; `road.js` and
  `roadEditor.js` read `canvas` and `road`; `utils.js` calls `begin()`; HTML
  `onclick=` attributes call `nextPhase()`. In a module, `var`/`let`/`const`
  at module top-level are module-scoped, NOT on globalThis — so those bare
  references would silently break (writes hit `window.X` which `main.js`'s
  local binding no longer mirrors; reads of `var` from other classic scripts
  still work, but reads of `let`/`const` don't). Turning main.js into a
  module cleanly requires rewriting every one of those cross-script reads
  and writes to go through `window.*`, which is P4.C-grade scope, not
  P4.B-grade scope. The sidecar approach ships the verification criteria
  (boot, [ruvector] ready, #rv-panel) with zero risk to existing behaviour.

  Verification (via agent-browser, headless Chromium against
  http://127.0.0.1:8765/AI-Car-Racer/index.html):
    - Console:
        [brainCodec] self-check passed — 92-dim round-trip ok
        WARN crates/ruvector-core/src/vector_db.rs:93 HNSW requested but not
             available (WASM build), using flat index     (x2, expected —
             upstream stylised warn on wasm-web build; flat index works)
        [ruvector] ready — brains=0 tracks=0 obs=0
    - DOM:          document.getElementById('rv-panel') present
    - Bridge:       typeof window.__rvBridge === 'object'
                    window.__rvBridge.info() = {brains:0, tracks:0,
                      observations:0, ready:true, gnn:false, topology:[6,8,4]}
                    keys: archiveBrain, cosineSimilarity, embedTrack, hydrate,
                      info, observe, persist, ready, recommendSeeds,
                      _debugReset
    - Globals from network.js on window: NeuralNetwork (function),
      Level (function) — required by brainCodec.unflatten.
    - Classic-script globals preserved: phase=1, pause=boolean, road=object,
      begin=function, nextPhase=function, maxSpeed=number, fastLap=string.
    - Boot UI: track-editor phase-1 buttons render identically to P4.A
      baseline (Next / Save Track / Delete Track / Delete Point).

  Notes for P4.C:
    - Consume the bridge from classic main.js as `window.__rvBridge.
      archiveBrain(...)`, `window.__rvBridge.recommendSeeds(...)`, etc.
      `ready()` has already been called by the sidecar; you can safely
      `await window.__rvBridge.ready()` again — it's memoised.
    - If P4.C genuinely needs main.js to be a module (e.g. to use `import`
      syntax rather than the window handle), that refactor is P4.C-scope:
      move all top-level state to `window.*`, replace classic-script bare
      references with window reads/writes, and delete the sidecar block.
      For what the PRD describes (replacing the localStorage.bestBrain
      block with recommendSeeds + archiveBrain), the window handle is
      sufficient and the sidecar can stay.
    - The sidecar's `import` path is relative (`./ruvectorBridge.js`), which
      resolves fine because index.html is served from
      `AI-Car-Racer/index.html`. If you move the bridge loader elsewhere,
      fix the path.

2026-04-20 · sess-ship-task-c · P4.C complete.
  Work:
    - main.js begin(): introduced bridgeReady() gate that checks `?rv=0`,
      bridge readiness, AND window.__rvUnflatten presence. Seeding runs
      when all three pass AND recommendSeeds returns ≥1 hit. Seeding split
      is PRD-compliant for N=10 (elite=1, light=4, heavy=4, novel=1) and
      generalises via Math.floor to any batchSize ≥ 3. Lightly-mutated
      uses `mutateValue * 0.5`, heavy uses `min(1, mutateValue * 1.8)`.
      The "novelty" slot leaves the random brain created by `new Car(...)`
      untouched — that's the simplest way to get a fresh random policy
      without allocating another NeuralNetwork.
    - main.js nextBatch(): archiveBrain + observe wired in after the
      existing `save()` call (localStorage.bestBrain path preserved, per
      PRD "keep for one version as a fallback"). Fitness = checkPointsCount
      + laps * checkPointList.length — matches the `testBestCar` tiebreaker
      in animate() so archived and in-flight fitness are on the same scale.
      `generation` increments per batch; `currentSeedIds` is carried across
      begin→nextBatch so parentIds + observe() both reference the correct
      retrieval set.
    - index.html sidecar: added `import { unflatten } from './brainCodec.js';
      window.__rvUnflatten = unflatten;`. Classic-script main.js couldn't
      call the bridge's unflatten directly because the bridge never
      re-exports it (the bridge was designed to push unflatten out to the
      caller — see the comment at `recommendSeeds`). Exposing it via
      window.* is the minimal bridge that keeps main.js classic.

  Fallback-chain design (one-line summary):
    begin() takes the FIRST of these that applies, in order:
      1. bridge seeding (if bridgeReady() AND seeds.length > 0)
      2. localStorage.bestBrain mutation (stock path; survives ?rv=0 AND
         "bridge ready but archive empty but user has a prior stock brain")
      3. nothing — Car's constructor already produced random brains
    #2 preserves the stock-regression bar from the PRD Verification section
    AND provides a graceful migration path for users coming from pre-P4.C
    runs that only had localStorage.bestBrain.

  Verification (via agent-browser, headless Chromium at
  http://127.0.0.1:8765/AI-Car-Racer/index.html):
    - Cold start: IDB cleared → `[ruvector] ready — brains=0 tracks=0 obs=0`
    - Archive → reload: `[ruvector] ready — brains=1 tracks=0 obs=0`
    - recommendSeeds(null, 10) → 1 hit, id=vec_0, vector.length=92
    - begin() on hydrated archive → `[ruvector] seeded 10 cars from 1
      retrievals (elite=1, light=4, heavy=4, novel=1)`
    - cars[0].brain instanceof NeuralNetwork === true (unflatten produced
      a real class instance, not a plain object)
    - ?rv=0: rvDisabled=true, bridgeReady()=false, currentSeedIds=[], no
      seeded-log. Bridge still loads (sidecar unconditional) — that's the
      intentional design: the flag gates *consumption*, not init.

  Notes for P4.D:
    - main.js reads `window.currentTrackVec` on every begin() and
      nextBatch(). Just set it in roadEditor.js after calling
      bridge.embedTrack(imageData) and seeding/archival will pick up the
      track embedding automatically — no further main.js changes needed.
    - embedTrack expects Uint8Array of RGB bytes (length=w*h*3, NO alpha)
      per the bridge signature `embedTrack(imageData, width, height)`. If
      you start from ImageData (RGBA), strip the alpha: every 4th byte
      discarded. Canonical size per PRD is 224×224 (CnnEmbedder default).

  Notes for P4.E (uiPanels.js):
    - `recommendSeeds` returns `[{id, vector, meta, score, trackSim}]`.
      trackSim ∈ [-1, 1] (cosine). meta has {fitness, trackId, generation,
      parentIds, timestamp}. Render trackSim as "This track is N% similar"
      via `Math.round(50 + 50 * trackSim)`.
    - P4.C stores lineage in archived brains (parentIds = currentSeedIds),
      so the sparkline from P5.B can walk meta.parentIds backwards through
      _brainMirror without touching the bridge.

2026-04-20 · sess-ship-task-d · P4.D complete.
  Work:
    - buttonResponse.js: added embedCurrentTrack() + drawPolyline() helpers,
      wired into nextPhase() case 3 immediately after submitTrack(). Ships
      as a single-file change — no edits to roadEditor.js (the PRD row said
      "and likely buttonResponse.js" and that's where the phase transitions
      actually live; roadEditor.js only manages point state).
    - The hook reads road.roadEditor.{points, points2, checkPointListEditor}
      and rasterises them directly at 224×224 with lineWidth=3 (track) and
      lineWidth=2 (checkpoints). The 3200×1800 game canvas is never scaled
      down — see rasterisation lesson below for why.
    - window.currentTrackVec is set to the returned Float32Array(512). On
      failure (bridge unready, exception) it is cleared to null; main.js's
      bridgeReady() gate covers the null case and falls through to the
      stock localStorage path.

  Rasterisation lesson (non-obvious, worth preserving — future sessions
  doing any canvas→CNN work should read this):
    The first attempt used drawImage(myCanvas, 0, 0, 224, 224) to scale
    the game canvas down. That produced sim ≈ 0.99 across totally
    different tracks — at first I thought the CNN was broken. Diagnosed
    by counting non-black pixels: on a 50,176-pixel scaled image, only
    300 were non-black and 208 were "bright". The cause is geometric:
      - Game canvas is 3200×1800, track lines are 2 px wide.
      - Downscale factor is 3200/224 ≈ 14.3.
      - A 2-px stroke under 14× bilinear downsampling contributes
        ≈ 2/14 ≈ 0.14 px of intensity per pixel along the line.
      - That's below the visible threshold for the embedder; it sees
        an almost-uniformly-black image and returns the same "black"
        vector regardless of track shape.
    Fix: render the tracks directly at 224×224 with thick strokes
    (lineWidth=3). Three-track validation after the fix:
      sim(rectangle, jittered-rectangle) = 0.994   (> 0.9 gate)
      sim(rectangle, triangle+pentagon)  = 0.711   (clearly different)
    General principle: for vector/geometric data, re-rasterise at the
    model's input size, don't downscale a high-res raster. This applies
    to any future sketch/diagram/map → CNN pipeline in this repo.

  Verification (agent-browser, headless Chromium,
  http://127.0.0.1:8767/AI-Car-Racer/index.html):
    - UI click-path: _debugReset() → reload → click "Next" → "Next" (via
      accessibility refs @e1, @e2) → phase=3, window.currentTrackVec is
      Float32Array(512), head=[0.045, 0.184, 0.048, …].
    - Three-track programmatic comparison (phase=0 → set points →
      nextPhase ×3 → capture vec): sim_AAp=0.994, sim_AB=0.711,
      sim_ApB=0.708.
    - Integration with P4.C: archiveBrain(new NeuralNetwork([6,8,4]),
      42, window.currentTrackVec, 0, []) → bridge.info() goes from
      {brains:0, tracks:0} to {brains:1, tracks:1}.

  Notes for P4.E:
    - Hook into index.html's #rv-panel div (already present since P4.B).
    - For the "this track resembles" badge, call bridge.recommendSeeds(
      window.currentTrackVec, k) and render hits[0].trackSim as %.
    - The badge should appear after phase=3 (when currentTrackVec is set)
      — listen on the same hook in buttonResponse.js case 3, or poll
      window.currentTrackVec from a main-loop tick. Either works.
    - Archive will be empty on first run: recommendSeeds returns []. Hide
      the badge in that case rather than showing "0% match".

2026-04-20 · sess-ship-task-e · P4.E complete.
  Work:
    - AI-Car-Racer/uiPanels.js (classic script, ~170 LOC). IIFE that mounts
      header / badge / list into #rv-panel, polls at 500 ms, and only
      re-renders when one of {bridge-ready, brains, tracks, observations,
      phase, trackVec identity, currentSeedIds} changes. recommendSeeds()
      runs at most once per tick and only when the memoised inputs move.
    - style.css appended: #rv-panel placed in grid-column 2 / grid-row 2
      (portrait media query moves it to row 3); scoped .rv-* class tree.
      No new CSS file — styles live alongside existing ones to keep the
      link count unchanged.
    - index.html: one new <script src="uiPanels.js"> after main.js.
      Placement matters: it must run after main.js so `phase`,
      `rvDisabled`, and `currentSeedIds` globals exist when the IIFE does
      its initial paint.

  Deliberate design choices:
    - Classic script (no ESM). The panel reads `phase`, `rvDisabled`,
      `currentSeedIds`, `currentTrackVec` — all globals owned by
      classic-script files. Making uiPanels a module would mean accessing
      them as `window.*` which buys nothing; staying classic matches the
      convention P4.B established.
    - 500 ms polling vs. event-driven. Three separate files mutate the
      inputs (main.js writes seed ids + phase, buttonResponse.js writes
      currentTrackVec, the bridge mutates via async persist). An event
      bus would add coupling; cheap memoised polling skips DOM writes
      when nothing moved.
    - Memo key on `trackVec` is identity (Float32Array reference), not
      value. embedCurrentTrack() always assigns a fresh Float32Array on
      phase=3 transitions, so identity is a free + sufficient change
      detector (vs. a 512-float content compare).
    - Badge visibility rule: `phase >= 3 && trackVec && seeds.length>0`.
      Intentionally hidden on phase 1–2 and on an empty archive — the
      panel as a whole stays visible (showing the empty-state copy in
      the sidebar) so users see the feature exists even before training.

  Verification (agent-browser, headless Chromium, http://127.0.0.1:8769):
    - Boot clean: no page errors; console shows `[brainCodec] self-check
      passed`, two expected wasm HNSW-fallback warnings, then
      `[ruvector] ready — brains=0 tracks=0 obs=0`.
    - Empty archive, phase=1:
        info = "0 brains · 0 tracks · 0 obs · ema"
        badge hidden
        list = "No past brains yet — train once to populate the archive."
    - After synthetic archiveBrain(new NeuralNetwork([6,8,4]), 42,
      sin-wave Float32Array(512)) + persist + reload, phase=1:
        info = "1 brain · 1 track · 0 obs · ema"
        badge hidden (currentTrackVec not set at phase=1)
        list row = "#1 vec_0 50% fit 42.0 g0 p0"
    - Click Next → Next → phase=3:
        currentTrackVec is Float32Array(512)
        badge visible = "This track is 51% similar to one you've trained
          on — loading 1 candidate brain as seeds."
        list row updates to "#1 vec_0 51% fit 42.0 g0 p0"
      The 51% is genuine (cosine ≈ 0.02 between the synthetic sin-vec and
      the real rectangle-rendered vec, mapped by 0.5+0.5*sim), confirming
      the trackVec is flowing end-to-end, not hardcoded.
    - ?rv=0:
        info = "disabled (?rv=0)" with rv-info-muted styling
        list = "Bridge disabled via ?rv=0 — archive not consulted
          this session."
        badge hidden
    - Screenshots: docs/validation/screenshots/p4e-panel-phase3.png and
      p4e-panel-rv0.png captured.
    - Archive reset via window.__rvBridge._debugReset() at the end so
      no synthetic entries leak into future sessions.

  Notes for P5:
    - P5.A (fade-out badge) has two hooks: either add a CSS transition
      on .rv-badge[hidden] → opacity, or add a short-lived timer in
      uiPanels.js's renderBadge when the badge transitions from hidden
      to visible. The latter gives you control over the "fades after 4s"
      behaviour the PRD calls for.
    - P5.B (lineage sparkline per seed): _brainMirror is keyed by id and
      each entry carries meta.parentIds. A backward walk from the
      displayed seed through parentIds gives the lineage; render as an
      inline SVG sparkline inside .rv-item. No bridge changes needed.
    - P5.C (GNN/EMA indicator): the bridge exposes info().gnn (always
      false for now — P2.C is [!]) and info().observations. Simplest
      indicator is a line in .rv-header when observations > 0:
      "EMA reranker: N obs, last shift +/- M positions". The "last
      shift" metric requires uiPanels to remember the previous
      recommendSeeds result and diff against the current one — the
      memoised `last` struct is the natural place to extend.
    - P5.D (grapher.js annotations): unrelated to uiPanels.js. Use
      main.js's `generation` global + currentSeedIds to flag the
      seeded generations in the fitness-over-time plot.

2026-04-20 · sess-ship-task-5a · P5.A complete.
  Work:
    - uiPanels.js: renderBadge() now gates on trackVec identity via
      `badgeShownForTrackId`. When a new Float32Array arrives (every
      phase=3 finalize allocates fresh, per P4.D's embedCurrentTrack),
      we remove the `rv-badge-showing` class, force a reflow with
      `void el.badge.offsetWidth`, and re-add — this is the canonical
      pattern to restart a CSS @keyframes from frame 0. An
      `animationend` listener installed once at init sets `hidden=true`
      and strips the class after the fade-out completes. When
      wantBadge flips false (phase drops below 3 or archive empties),
      the identity memo resets to null so the next phase=3 entry
      still animates.
    - style.css: added @keyframes rv-badge-pulse (0% op=0/ty=-6px →
      8% op=1/ty=0 → 92% op=1/ty=0 → 100% op=0/ty=-2px) over 4800ms
      ease-out forwards. Base .rv-badge now has `opacity: 0;
      transform: translateY(-4px)` so the element is invisible even
      before the first `rv-badge-showing` application — without this,
      a fresh badge would flash at full opacity between `hidden=false`
      and the first animation frame. Added a
      prefers-reduced-motion branch that swaps in a transform-free
      keyframe with identical timing.
    - No changes to index.html, buttonResponse.js, main.js, or the
      bridge. P5.A was purely a uiPanels.js + style.css refinement
      as the task row anticipated.

  Timing budget (plan vs. measured):
                        plan (ms)    measured (ms, 200ms resolution)
    fade-in (0→1):      ~384         ~500 (slightly slow due to ease-out
                                     curve; acceptable)
    hold (op=1):        ~4032        ~3830
    fade-out (1→0):     ~384         ~400
    total until hidden: ~4800        ~4966

  Verification (agent-browser, :8780):
    - Driven to phase=3 via UI click path (set points + checkpoints
      programmatically, then click Next → Next). `currentTrackVec`
      became Float32Array(512).
    - Opacity sampled across 27 ticks at 200ms each: smooth
      monotonic fade-in → plateau at 1.000 → smooth fade-out → 0 at
      animationend, at which point `hidden=true` and the class was
      removed. Copy: "This track is 55% similar to one you've trained
      on — loading 1 candidate brain as seeds." (singular brain ✓).
    - Non-regression: bridge.observe(['vec_0'], 99) mid-hold bumped
      observations 0→1, which invalidates the panel's fast-path memo
      and re-calls renderBadge; the identity guard short-circuited
      and opacity stayed at 1.000 (class stayed applied, hidden=false).
      Without the guard, the animation would have restarted every
      time the EMA reranker ticked — which for P5.C's indicator
      would visibly strobe the badge. Guard is load-bearing.
    - Screenshot during hold: docs/validation/screenshots/
      p5a-badge-holding.png.

  Gotchas for P5.B–P5.D:
    - The `animationend` listener is keyed on `animationName in
      {'rv-badge-pulse', 'rv-badge-pulse-flat'}`. If you add a second
      animation on .rv-badge (e.g. a hover pulse), pick a distinct
      animation-name or the listener will try to dismiss the badge
      after the hover ends.
    - `void el.offsetWidth;` is the classic "force reflow" trick. ESLint
      may flag it as a useless expression — suppress locally or use
      `el.offsetWidth && 0;` if linting becomes strict.
    - Only the NEW Float32Array identity restarts the animation. If
      P5.B wants to animate sidebar rows when seeds change, it needs
      its own memo key (e.g. seedIdsKey or a seeds[].id.join(',')),
      since trackVec identity doesn't change when only seeds reshuffle.

2026-04-20 · sess-ship-task-5b · P5.B complete.
  Work:
    - ruvectorBridge.js: archiveBrain() gained an optional 6th arg
      `fastestLap` (number, seconds). Stored on meta as `fastestLap`
      only when finite — legacy entries simply lack the key, which
      the UI treats as "—". Also added `getLineage(id, maxDepth=6)`:
      walks meta.parentIds backwards, at each step picking the
      highest-fitness parent. Returns [{id, fitness, generation}, ...]
      oldest→newest. Visited-set + depth-cap both prevent runaway on
      cyclic or pathologically deep graphs.
    - main.js: in nextBatch(), pass `batchFastest = (bestCar.laps>0 &&
      bestCar.lapTimes.length) ? Math.min(...lapTimes) : undefined`
      into archiveBrain. Intentionally the PER-BATCH best lap, not the
      all-time global `fastLap` — archived brains record "what this
      specific genome achieved", which is more informative as a ranking
      signal than a global high-water mark.
    - uiPanels.js: two-row sidebar item. Top row = rank · id · sim% ·
      fit · lap · gen · parents. Bottom row = "LINEAGE" label + inline
      SVG sparkline. The SVG uses viewBox="0 0 40 12" with 1.5px pad;
      fitness is inverted so higher = visually up; terminal (newest)
      point gets an emphasised dot. Three degenerate cases handled:
      n=0 → "—" text placeholder; n=1 → single centered <circle>; all
      equal → flatline at mid-height.
    - style.css: .rv-item switched from 8-column grid to flex-column
      with two nested rows. Fixed a narrow-panel clipping bug where
      the single-row-8-column layout pushed the sparkline off the
      right edge of the sidebar.

  Design decision log (one line each, for future P5.C/P5.D sessions):
    - Two-row layout instead of a wider panel: the panel lives in
      grid-column 2 and can't widen without rewriting the page grid.
      Splitting rows is lower-risk than a layout migration.
    - fastestLap as an optional param rather than a separate
      recordLap() call: keeps the archive operation atomic + avoids a
      second schedulePersist trigger per batch.
    - getLineage picks the highest-fitness parent rather than the
      first, because for a GA the fit-line-of-descent is the more
      meaningful visualisation (mutation direction), and deterministic
      selection prevents flicker across re-renders.

  Verification (agent-browser, :8790):
    - Three-brain lineage chain (vec_0 fit=20 → vec_1 fit=35 → vec_2
      fit=52) renders as three sidebar rows with laps 18.50s, 14.22s,
      11.07s. SVG polyline points for vec_2 lineage:
      "1.50,10.50 20.00,6.28 38.50,1.50" (3-pt ascending).
    - Depth cap: 8-deep chain with maxDepth=3 returns generations
      [5,6,7] only; maxDepth=10 returns all [0..7].
    - Multi-parent: child with parentIds=[fit5, fit99] walks back
      through fit99 — best-fit selection confirmed.
    - Legacy meta (no fastestLap) → lap column renders "—".
    - ?rv=0 path unchanged: "disabled (?rv=0)" muted + "archive not
      consulted this session" copy. No regression.
    - Phase=3 end-to-end: after programmatic rectangle-track finalize
      and archiveBrain(..., fastestLap=12.34), the badge text shows
      "100% similar...loading 1 candidate brain as seeds." and the
      sidebar row shows "12.34s" + single-dot sparkline.
    - Screenshots: docs/validation/screenshots/p5b-sidebar-lineage.png,
      p5b-phase3-lap.png.

  Gotchas for P5.C / P5.D:
    - The sparkline SVG inlines into .rv-list.innerHTML on every
      re-render. The panel's memo key prevents this from happening
      except when {brains, observations, phase, trackVec, seedIds}
      actually change, so per-tick cost is zero. But an SVG <animate>
      element would stop and restart on every real re-render; if
      P5.C's GNN indicator needs steady-state animation, put it on a
      stable DOM node (rv-header), not inside the re-rendered list.
    - `getLineage` walks `_brainMirror` (a Map) with O(n·depth). Fine
      for archives < few hundred entries. If the archive grows large,
      consider a pre-built parent-index Map in the bridge.
    - Adding a new column to .rv-item-top? Count the
      grid-template-columns entries — currently 7. Don't skip; the
      grid will silently collapse extras into the last column.

2026-04-20 · sess-ship-task-5c · P5.C complete.
  Work:
    - ruvectorBridge.js: added `info().observationEvents` (sum of
      per-id `.count` across `_observations`). The existing `.size`-based
      `observations` field stays as-is so the `[ruvector] ready —
      obs=...` log line keeps its meaning.
    - uiPanels.js: added `.rv-reranker` node under the header. Copy:
        - obs=0:         "EMA reranker: idle (awaiting first observation)"
                         (rv-reranker-muted class for italic/low-emphasis)
        - obs>0:         "EMA reranker: N observations (M brains) ·
                         last shift K position(s)"   (shift = "—" when
                         no baseline has been captured yet, e.g. first
                         tick after page reload)
      Engine prefix switches "EMA" → "GNN" automatically when/if
      `info().gnn` ever flips true, so P2.C-reversal wouldn't need UI
      changes.
    - uiPanels.js: added `computeRankShift(prev, curr)` using
      Spearman's footrule over the union of ids. Ids present in only
      one list are treated as rank K (first slot past the bottom of
      top-K), which correctly rewards a brain rising from outside the
      top-K and penalises a brain falling off. Sum of abs rank
      displacement is the total "positions moved".
    - uiPanels.js: extended the render memo. Added `observationEvents`
      to both the `last` struct AND the fast-path comparison — without
      this, repeat observes on the same id (which don't move
      `_observations.size`) would be silently skipped and the
      indicator would stall.
    - style.css: added `.rv-reranker` / `.rv-reranker-muted` + dashed
      underline separator. 0.72rem, matches existing `.rv-*` palette.

  Design decision log:
    - Why TWO fields (observations + observationEvents) instead of
      redefining the one? The old field is already referenced in the
      boot-log string ("obs=N") and was verified in P3.B/P4.C
      validation output. Renaming it would force a chain of text-match
      updates in docs/validation. Adding a second field is cheaper
      and leaves the boot log invariant.
    - Why Spearman's footrule (union-based) instead of Kendall tau or
      "common-ids-only" displacement? Kendall ignores inserts/removes;
      common-ids-only reports shift=0 on a full replacement of the
      top-K, which would lie to the user. Footrule with K-as-sentinel
      for missing ids handles swaps, drop-outs, and fresh promotions
      uniformly.
    - Why `lastShift` only updates when `observationEvents` rises (not
      when brains/trackVec/phase change)? The indicator labels this
      as a "reranking" metric. A non-observe reshuffle (new brain,
      new track) shouldn't retroactively "credit" the reranker. The
      baseline `lastSeedIds` is refreshed on every render so that
      when the next real observe fires, the diff is against the seed
      order at that exact moment — not against a stale snapshot.
    - Why poll-driven, not event-driven? Same rationale as P4.E /
      P5.A / P5.B — the panel already polls at 500ms; adding event
      hooks would couple uiPanels.js to bridge internals and to the
      nextBatch sequence. The memo keeps idle ticks free.

  Known limitation (documented here so P5.D doesn't re-discover it):
    main.js's nextBatch() calls archiveBrain() and observe() in the
    same synchronous block, so the panel's 500ms tick sees BOTH events
    before it can diff. The computed shift in that case blends the
    archive-reshuffle with the EMA-rerank effect — "total top-K
    change this generation" rather than "EMA-only contribution".
    Isolated observe() calls (without an accompanying archive) DO
    produce a pure-EMA shift, which is what validation exercised
    (shift=2 after vec_0/vec_1 swap). If P5.D wants to isolate the
    two contributions in the fitness-over-generations graph, do the
    diff INSIDE the bridge: snapshot the top-K right before the EMA
    write inside `observe()`, then call `computeRankShift` against
    the post-write ordering. That captures the EMA effect exactly,
    with no archive contamination.

  Verification trail (agent-browser, :8795, sequence recorded above
  in the P5.C row). Summary of the end-to-end numbers:
    - initial state after reset:       events=0, distinct=0, shift=null
    - after first observe(['vec_0'], 1000):
                                       events=1, distinct=1, shift=2
    - after second observe(['vec_0'], 0) [same id, different outcome]:
                                       events=2, distinct=1, shift=2
      (crucially, events ticked from 1→2 even though distinct stayed
      at 1 — verifies the observationEvents fix)
    - after observe(['vec_2'], 1000) [already-top seed]:
                                       events=3, distinct=2, shift=0
    - after archiveBrain(new_top):     brains 3→4, seeds reshuffled,
                                       shift UNCHANGED at 0 (correct)
    - after real nextBatch()×2 (training loop):
                                       events 6→10→11, shift 10, then 1
    - ?rv=0:                           indicator hidden (hidden=true,
                                       text="")
    - No console errors; the two wasm HNSW warnings are upstream
      pre-existing, same as P4.B baseline.

  Screenshots (captured at :8795):
    docs/validation/screenshots/p5c-reranker-indicator.png   (active)
    docs/validation/screenshots/p5c-reranker-idle.png        (empty archive)
    docs/validation/screenshots/p5c-reranker-disabled.png    (?rv=0)

  Notes for P5.D:
    - `info().observationEvents` is the right signal for "a new
      generation just closed" — it ticks exactly once per observe()
      call, which main.js makes exactly once per nextBatch.
    - If you want to annotate "recommendSeeds returned non-empty"
      generations on the graph, you already have it: main.js sets
      `currentSeedIds.length > 0` right after a non-empty seed
      retrieval. Just record that alongside the generation count
      in your plot array (use a parallel localStorage key — don't
      overload `localStorage.progress`, which grapher.js already
      parses as a flat number array).
    - If you want to also annotate "EMA reranker promoted/demoted
      something significantly", the same `computeRankShift` function
      can be lifted out of uiPanels.js to a shared helper. But see
      the limitation above — to isolate EMA-only shift from
      archive-also shift, you'd need a bridge-internal snapshot.

2026-04-20 · sess-ship-task-5d · P5.D complete. Phase 5 now fully done.
  Work:
    - grapher.js: extended `graphProgress()` to read a parallel
      `localStorage.rvAnnotations` array and overlay two glyph types per
      progress[] index — cyan filled dots ("seeded from archive") at
      generations where `recommendSeeds` returned non-empty, amber
      upward ticks ("reranker shift") at generations where the top-K
      seed ordering moved vs the prior batch (length scaled by shift
      magnitude, capped at 18px so a single big reshuffle doesn't
      blow past the chart top). Tiny dark-backdrop legend in the
      upper-left so glyphs decode without docs.
    - buttonResponse.js: extended `save()` to push one annotation
      record `{seeded, shift}` per call, lockstep with the existing
      `progress[]` push. `seeded` reads `currentSeedIds.length > 0`
      (the batch's actual recommendSeeds outcome). `shift` is
      Spearman's-footrule displacement vs `window.__rvLastSeedIdsForGraph`
      (the previous batch's seed IDs). Inlined a small `rankShiftForGraph`
      helper that mirrors the `computeRankShift` semantics from
      uiPanels.js. Extended `resetTrainCount()` to also clear
      `rvAnnotations` and the in-memory baseline.
    - main.js: call `graphProgress()` at the end of `nextBatch()`
      so the chart refreshes live during training (was previously
      only rendered once on phase-4 entry — the graph stayed stale
      until you flipped phases).
    - Pre-existing rendering bug discovered + hardened (in scope as
      "make the graph actually render annotations"): `fastLap`
      defaults to the string `"--"` until a lap completes, and
      `Math.min("--", 12.5)` returns `NaN`, NaN-poisoning every y
      coordinate and silently blanking the chart. Fix: filter to
      numeric values for min/max math + lift the pen across
      non-numeric entries in the line loop.

  Design decision log:
    - Why a parallel localStorage key (`rvAnnotations`) and not a
      richer `progress[]` of objects? Per the P5.C plan note at line
      ~783: `grapher.js` reads `progress[]` with
      `Math.min(...progressArray)` and existing data in user
      localStorage is flat numbers. Migrating the schema would
      require either a one-shot transform or a polymorphic
      reader; a parallel key is zero-risk.
    - Why record annotations inside `save()` rather than `nextBatch()`?
      `save()` is also fired by the manual "Save Best and Restart"
      button — keying annotations off `nextBatch()` would create
      off-by-one drift on the manual path. Index parity is the
      simpler invariant.
    - Why `rankShiftForGraph` inlined instead of lifting
      `computeRankShift` out of uiPanels.js? The function is 10
      lines, classic-script land has no module system, and lifting
      would need either a third file or another global. Two small
      cousins is cheaper than one shared symbol with extra
      coordination.
    - Why is "shift" measured at batch N a diff against batch N-1's
      seeds (and not "EMA-only contribution")? Same documented
      limitation as P5.C's reranker indicator — `nextBatch()`
      runs `archiveBrain()` and `observe()` in the same sync block,
      so any externally-visible shift on the next batch
      mixes both effects. To isolate EMA-only shift you'd need a
      bridge-internal snapshot inside `observe()`. The amber tick
      label is "reranker shift" for the same reason the panel uses
      that wording: it captures what changed for the user, not the
      mechanism breakdown.

  Verification (agent-browser, headless Chromium, :8800):
    - Cold start (clean IDB + clean localStorage):
      Batch 0 → progress[0]="--", annotations[0]={seeded:false,
      shift:0}, brains 0→1, currentSeedIds=['vec_0']
      Batch 1 → progress=12.5, annotations[1]={seeded:true, shift:1}
        (footrule for prev=[] vs curr=['vec_0']: K=1, vec_0
        contributes |1-0|=1)
      Batch 2 → annotations[2]={seeded:true, shift:3}
        (prev=['vec_0'] vs curr=['vec_1','vec_0']: K=2, vec_0
        contributes 1, vec_1 contributes 2)
      Batch 3 → annotations[3]={seeded:true, shift:5}
        (prev=['vec_1','vec_0'] vs curr=['vec_2','vec_1','vec_0']:
        K=3, vec_0:1, vec_1:1, vec_2:3)
    - Rich-data run (6 synthetic batches with descending fastLaps
      15.0→11.9): all 5 post-cold batches recorded seeded=true with
      shift values [1,3,5,3,7]. The screenshot at
      docs/validation/screenshots/p5d-graph-annotations.png
      captures the curve descending across 13 naturally-fired
      batches (animate() resumed driving once `begin()` reset
      pause=false), with every point annotated.
    - ?rv=0 path: rvDisabled=true, currentSeedIds stays [],
      annotations all {seeded:false, shift:0}. No false
      positives — the bridge isn't even consulted.
    - Persistence: localStorage retained 4 progress + 4 annotation
      entries across reload; chart re-rendered the flatline at
      bottom (all values 10) and applied the seeded=false
      annotations correctly (no glyphs, since all annotations
      were neutral).
    - resetTrainCount(): clears `progress`, `rvAnnotations`, and
      `__rvLastSeedIdsForGraph` so a subsequent run starts fresh.

  Notes for downstream sessions / future polish:
    - The chart currently uses `fastLap` as the y-axis (per the
      pre-existing `save()` semantics: `progressArray.push(fastLap)`).
      The variable named `progressVal` is computed but never pushed.
      If a future task wants to switch to fitness, redirect the
      push to `progressVal` — annotation alignment will still hold
      because the array still grows by 1 per `save()` call.
    - The legend backdrop is `rgba(20,24,32,0.78)` to read against
      both the white chart background AND the orange line. If the
      site theme ever changes to a dark page background, swap to a
      lighter backdrop or remove it.
    - To isolate EMA-only shift from archive-update shift (the
      documented limitation), the cleanest path is to snapshot the
      top-K inside `observe()` in `ruvectorBridge.js` before the EMA
      writes, then expose `info().lastEmaShift`. The graph would
      then read THAT instead of computing a same-batch diff.

2026-04-21 · sess-ship-task-presets · Track presets + render/crash fixes.
  Scope: UX delivery + two bugfixes discovered while validating the
  "Seeded GA improves" verification gate. The gate itself was DEFERRED
  (not marked [x]) per user direction — the two arms of the A/B
  experiment both returned invalid results (Arm A ran on a track whose
  corridor did not contain startInfo; Arm B crashed inside the
  agent-browser daemon on a parallel session).

  Work:
    - NEW AI-Car-Racer/trackPresets.js — 5 hand-designed tracks
      (Rectangle, Oval, Triangle, Hexagon, Pentagon) each guaranteed
      by construction to contain startInfo (2880, 900) in the corridor.
      Exports window.TRACK_PRESETS + window.loadTrackPreset(idxOrName).
      Writes localStorage.{trackInner,trackOuter,checkPointList} AND
      clears bestBrain/progress/rvAnnotations so a preset load starts
      fresh (the ruvector archive is intentionally NOT cleared —
      cross-track seed recall is exactly what the bridge is for).
      Adds a phase-1/2-only floating dropdown UI (#track-preset-picker)
      in index.html.
    - FIX AI-Car-Racer/roadEditor.js drawLines() — walls rendered at
      lineWidth=2 canvas-px, but canvas is 3200x1800 downscaled to
      ~1028 CSS px (3.1x shrink), so 2-px strokes collapsed to ~0.65
      CSS px and became invisible on the gameplay view. Bumped to
      wallW=12 / closeW=12 / checkW=8 when editMode=false. Editor
      phase (editMode=true) still uses 2px/0.75px so the feel of
      dragging vertices is unchanged.
    - FIX AI-Car-Racer/main.js:218 — `fastLap.toFixed(2)` threw
      TypeError on first phase-4 frame whenever fastLap was still
      the string '--' (its default per main.js:24, before any lap
      completes). Uncaught exceptions in rAF callbacks do NOT
      re-schedule the next frame, so the animation loop silently
      died after frame 1 — manifesting to the user as "Train Your
      Model page not moving". One-line type guard: only call
      toFixed when typeof fastLap === 'number'.

  Why two bugs stacked into one user-visible symptom:
    - fastLap fix alone → animation loops but walls invisible (no
      movement cue for the user besides car pixels)
    - line-width fix alone → walls visible but animation frozen
      after frame 1 (no movement at all)
    - Both needed simultaneously. The fastLap bug was latent because
      prior-session leftover state in localStorage ('fastLap' = 12.34)
      meant developers running with residual state never hit it; a
      user on a clean state or after `localStorage.clear()` would
      see the freeze immediately.

  Verification trail (agent-browser, headed mode at :8800):
    - docs/validation/screenshots/debug-train-t{0,5,15,20}.png
      (pre-fix baseline showing invisible walls + tiny car)
    - docs/validation/screenshots/debug-train-postfix-{phase1,phase4}.png
      (line-width fix validated, phase-1 editor unchanged)
    - docs/validation/screenshots/train-phase-fix-verified.png
      (fastLap fix validated; 9/10 cars moving, frameCount=831,
       no console errors, fresh localStorage state)
    - Pixel sampling at the outer top wall returned RGBA
      (255,255,255,255) — walls survive the CSS downscale now.

  Deferred — "Seeded GA improves" gate:
    The empirical A/B test was invalidated twice over and was set
    aside on user direction. Next session that picks this up should:
      1. Use the Rectangle preset (widest corridor).
      2. Run both arms SEQUENTIALLY in a single headed Chromium
         (parallel agent-browser sessions broke the daemon in the
         2026-04-20 attempt).
      3. Record end-of-batch `bestCar.checkPointsCount +
         bestCar.laps * road.checkPointList.length`.
      4. Consider whether `fastLap='Infinity'` sentinel would be a
         cleaner default than the string '--' — if so, update
         main.js:24/158 and buttonResponse.js:56/61 together to
         avoid re-breaking the type-guard.
```
