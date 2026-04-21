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

> **Now ready to claim:** P2.A, P2.B, P2.C (vendoring — three parallel sessions), P3.A (codec — independent of vendoring).
>
> **Recommended fan-out for first wave:** open 4 sessions, one per `P2.A / P2.B / P2.C / P3.A`. The bridge (`P3.B`) becomes claimable as soon as `P2.A` and `P2.B` are both `[x]`.

(Maintainers: keep this paragraph 1–3 sentences; it is the only thing a fresh session needs to read to get moving.)

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
| P2.A | Build `ruvector-wasm` crate with `wasm-pack build --target web --release` and copy `pkg/` into `vendor/ruvector/ruvector_wasm/`. Commit the `.wasm` + glue `.js` + `.d.ts` (vendor pre-built). | `[ ]` |  | P1.1 | `vendor/ruvector/ruvector_wasm/{ruvector_wasm.js, ruvector_wasm_bg.wasm, *.d.ts, package.json}` | `import initVec, { VectorDB } from './vendor/ruvector/ruvector_wasm/ruvector_wasm.js'` resolves; `await initVec()` succeeds in browser; `new VectorDB(92, "cosine")` constructs without throwing |
| P2.B | Copy contents of `ruvector/npm/packages/ruvector-cnn/` into `vendor/ruvector/ruvector_cnn_wasm/`. Already pre-built — no compilation. | `[ ]` |  | P1.1 | `vendor/ruvector/ruvector_cnn_wasm/{ruvector_cnn_wasm.js, ruvector_cnn_wasm_bg.wasm, *.d.ts, index.js}` | `import initCnn, { CnnEmbedder } from '...'` resolves; `await initCnn()` succeeds; `new CnnEmbedder()` constructs |
| P2.C | (Optional) Vendor a pre-built `gnn-wasm` from `ruvector/npm/packages/`. If no pre-built artifact exists, mark `[!]` with reason and proceed — JS fallback is acceptable per PRD. | `[ ]` |  | P1.1 | `vendor/ruvector/ruvector_gnn_wasm/...` **OR** a `[!]` note explaining that the JS fallback path will be used | `await initGnn()` succeeds **OR** documented blocker that activates the EMA-reranker fallback |

---

## Phase 3 — Bridge + codec

PRD ref: *Implementation phases → 3. Bridge + codec*; *Architecture overview*

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P3.A | Write `AI-Car-Racer/brainCodec.js`: `flatten(brain)` and `unflatten(float32, topology)` for the `[6, 8, 4]` topology (92 dims). Add a self-check at module load that round-trips a random brain and compares `feedForward` outputs. | `[ ]` |  | P1.1 | `AI-Car-Racer/brainCodec.js` | `unflatten(flatten(b))` is structurally equal to `b`; `feedForward` produces identical outputs on a fixed input vector |
| P3.B | Write `AI-Car-Racer/ruvectorBridge.js`: exports `ready()`, `archiveBrain(brain, fitness, trackVec, gen, parentIds)`, `recommendSeeds(trackVec, k)`, `embedTrack(canvasImageData)`, `observe(retrievedIds, outcomeFitness)`, `persist()`, `hydrate()`. Loads VectorDB + CnnEmbedder. If GNN package vendored, wire it; else use EMA-weighted in-JS reranker. | `[ ]` |  | P2.A, P2.B, P3.A | `AI-Car-Racer/ruvectorBridge.js` | Manual REPL: `await bridge.ready(); bridge.archiveBrain(b, 100, trackVec, 0, [])` then refresh page → `bridge.recommendSeeds(trackVec, 1)` returns the same vector (round-trips through IndexedDB) |

---

## Phase 4 — Game wiring

PRD ref: *Implementation phases → 4. Game wiring*; *File plan → Edited files*

P4.A is the only one that has zero deps on the bridge — claim it first if you have a session free. P4.B–E all touch game files, so they run **sequentially** in the order shown to avoid merge conflicts (each touches a distinct file, but they share a verification: "the game must still boot at every step").

| ID | Task | Status | Owner | Depends on | Outputs | Verification |
|---|---|---|---|---|---|---|
| P4.A | Delete `AI-Car-Racer/networkArchive.js` (orphan dead code, not loaded by `index.html`). | `[ ]` |  | P1.1 | `networkArchive.js` removed | Game still boots at `http://localhost:8000/` with no console errors |
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

- [ ] **Boot**: page loads, no console errors, both WASM modules log `[ruvector] ready` (after P2 + P3.B)
- [ ] **Cold start**: empty archive → behaves identically to stock AI-Car-Racer (after P4.C)
- [ ] **Archive round-trip**: `archiveBrain` → refresh → `recommendSeeds` returns the same vector (after P3.B)
- [ ] **Codec**: `unflatten(flatten(b))` is structurally equal to `b`; `feedForward` outputs match (after P3.A)
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
```
