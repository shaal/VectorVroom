# Plan: Replace `AI-Racing/` with `Apgoldberg1/AI-Car-Racer` per PRD

## Context

The PRD at `docs/plan/ruvector-integration-prd.md` declares that the current `AI-Racing/` folder is the **wrong base** for the ruvector integration showcase and that the correct base to clone is **[Apgoldberg1/AI-Car-Racer](https://github.com/Apgoldberg1/AI-Car-Racer)**.

Verification of current state:
- `AI-Racing/README.md` points at `https://we-gold.github.io/p/ai-racing/index.html` (i.e. `we-gold/ai-racing`) — a p5.js + TF.js supervised-learning demo, exactly what the PRD's Context paragraph describes as "wrong".
- `AI-Racing/index.html` loads `@tensorflow/tfjs`, `tfjs-vis`, and `p5` from CDN — single-car supervised pipeline, no population, no GA, no track editor.
- `docs/plan/` already contains only one file (the PRD), and no `AI-Car-Racer/` directory exists yet.

The PRD explicitly schedules this as **Phase 1 — Replace base (mechanical)** of the integration work. This plan executes *only* that phase (the mechanical swap + PRD touch-up). The rest of the PRD (vendoring WASM, bridge, codec, wiring) is out of scope for this turn and will be executed in follow-up turns.

## Approach

Two-step, low-blast-radius:

### Step 1 — Swap the base project

1. **Clone the target repo next to the old one (without its nested `.git/`):**
   ```bash
   cd /Users/ofershaal/code/experiments/car-learning
   git clone https://github.com/Apgoldberg1/AI-Car-Racer.git
   rm -rf AI-Car-Racer/.git
   ```
   Cloning to a sibling directory (not to a temp path then moving) matches the PRD's "critical files to read" references (`AI-Car-Racer/main.js`, etc.) and keeps the repo layout self-consistent.

2. **Remove the old demo:**
   ```bash
   rm -rf AI-Racing/
   ```

3. **Stage both changes in one commit** so the replacement is atomic and the history is clean:
   ```bash
   git add -A
   git commit -m "Replace AI-Racing (we-gold/ai-racing) with Apgoldberg1/AI-Car-Racer as ruvector integration base"
   ```
   (Per user's global CLAUDE.md: no Co-Authored-By / no "Generated with Claude Code" attribution.)

### Step 2 — Reconcile the PRD with the actually-cloned code

After the clone, open the cloned files and verify each assumption the PRD makes. Update the PRD in place **only** where reality diverges. The specific claims to check, and what to do with each:

| PRD claim | File to check | Action if wrong |
|---|---|---|
| Default topology `[5, 6, 4]` → 64-dim flat vector | `AI-Car-Racer/network.js`, `main.js` | Update the "Brain → vector mapping" example math. |
| `network.js` has syntax typos (`neirpmCpimts`, `9<inputCount`, malformed for-loop) | `AI-Car-Racer/network.js` | If the code is actually clean, remove Risk #3 and File-plan note about fixing it. If still broken, leave Risk #3 as-is. |
| `NeuralNetwork` is declared twice (duplicate in `networkArchive.js`) | `AI-Car-Racer/networkArchive.js`, `network.js` | Same — drop Risk #4 if the duplicate doesn't exist. |
| `networkArchive.js` exists and is "syntactically broken" | `AI-Car-Racer/networkArchive.js` | If the file is missing or clean, revise the "Edited files" row accordingly. |
| Module filenames: `main.js`, `roadEditor.js`, `grapher.js`, `inputVisual.js`, `buttonResponse.js`, etc. | `AI-Car-Racer/` root listing | Correct any renames in the "File plan" table. |
| Entry point is `index.html` with non-module scripts | `AI-Car-Racer/index.html` | If already `type="module"`, drop that note from `index.html` row. |
| `begin()` pulls `bestBrain` from `localStorage` | `AI-Car-Racer/main.js` | If the hook point is named differently, update the "Retrieval-driven seeding" step 1 reference. |

All PRD edits should be **in place** in `docs/plan/ruvector-integration-prd.md` — do not create a v2 file. Keep edits minimal and surgical; the high-level design does not change.

### Critical files to read (for Step 2)

- `AI-Car-Racer/main.js` — verify `begin()` / `nextBatch()` hook points
- `AI-Car-Racer/network.js` — verify topology + whether syntax bugs are real
- `AI-Car-Racer/networkArchive.js` — verify existence + shape
- `AI-Car-Racer/roadEditor.js` — verify "finish track" hook for `embedTrack()`
- `AI-Car-Racer/index.html` — verify script-tag style (module vs. classic)
- `AI-Car-Racer/README.md` — note any install/run instructions that should flow into the PRD's Verification section

### Existing patterns / files to reuse

Nothing from `AI-Racing/` is reused — the PRD is explicit that this is a full replacement, and the two codebases share no abstractions (TF.js model + p5.js sketch vs. custom NN + raw canvas GA). The only thing we preserve is the repo layout: a sibling project folder alongside `ruvector/` and `docs/`.

## Scope boundaries

- **In scope**: the mechanical swap (delete `AI-Racing/`, add `AI-Car-Racer/`) and *only* the PRD edits that reconcile with the newly-cloned code.
- **Out of scope**: vendoring WASM (`vendor/ruvector/…`), writing `ruvectorBridge.js` / `brainCodec.js` / `uiPanels.js`, editing any cloned game file, and fixing `network.js` pre-existing syntax bugs. Those belong to PRD Phases 2–5.

## Verification

1. `ls /Users/ofershaal/code/experiments/car-learning` → shows `AI-Car-Racer/`, `docs/`, `ruvector` (symlink); `AI-Racing/` is gone.
2. `ls AI-Car-Racer/` → shows `main.js`, `network.js`, `roadEditor.js`, `index.html`, `README.md` (file names may vary — reconcile with PRD in Step 2).
3. `test ! -d AI-Car-Racer/.git` → nested `.git/` was stripped.
4. `git log -1 --stat` → one commit with `AI-Racing/…` deletions and `AI-Car-Racer/…` additions.
5. Serve the cloned game locally (e.g. `python3 -m http.server 8000 --directory AI-Car-Racer`) and load `http://localhost:8000/` — the track editor and car sim should render without console errors (this also validates PRD Risk #3 / #4 in passing).
6. Re-read `docs/plan/ruvector-integration-prd.md` end-to-end and confirm every file-path / function-name reference resolves to something that actually exists in `AI-Car-Racer/`.

## Note on plan location

Per the auto-memory preference "Write plans to `docs/plan/` in the repo", after exiting plan mode the approved plan should be copied to `docs/plan/replace-ai-racing-base.md` (sibling to the PRD) so the repo-local plan trail stays complete. The canonical plan file during the plan-mode session remains the one in `~/.claude/plans/`, as required by the harness.
