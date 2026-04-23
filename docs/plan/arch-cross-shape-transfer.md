# Architecture changes to enable cross-shape transfer

**Status:** A0 shipped 2026-04-22. A1 attempted + reverted 2026-04-23 (`arch-a1/PROOF.md`). **A1' (scaled-distance variant) shipped 2026-04-23 — cross-track Δ flipped positive (+0.013 vs Phase 2 cold-tri baseline 0.714); see `arch-a1-prime/PROOF.md`.** A2/A3 are now unblocked.
**Origin:** Phase 3.5 experiments (`docs/plan/ruvector-proof/phase3.5/PROOF.md` + `phase3.5-samesame/PROOF-SAME-TRACK.md`) showed ruvector's archive currently *hurts* cross-track generalization because the 6→8→4 network overfits to track-specific sensor sequences. This plan proposes the architecture changes that should flip that result.
**How to use:** each phase is scoped for an independent `/ship-task` invocation. Run them in order (A0 → A1 → A2 → A3). Acceptance criteria at the end of each phase are the ship-task confidence-gate targets.

---

## Hypothesis

Current failure mode: weights trained on Rectangle's sensor readings encode patterns like "when sensor 2 reads short while sensor 4 reads long, turn right." On Triangle, the *geometric* situation that produces those readings is different — the same weights fire the wrong action. The archive's seeding logic retrieves "brains that drove well somewhere," which on a new shape are actively misleading.

Two architectural levers that should help:

1. **Track-orientation sensor features** — add inputs that encode "which way does the corridor go?" relative to the car's current frame. A car that knows "the next checkpoint is at local angle +30°, 400px away" has the same kind of input at t=0 on every track. Weights learned against that input generalize.

2. **Softer activations + hidden-layer normalization** — the current network uses a hard threshold (`outputs[i] = sum > biases[i] ? 1 : 0`). Binary-valued hidden layers can't represent smooth gradients of "how much to turn" and can't benefit from regularization. Swapping to `tanh` with pre-activation normalization should (a) give the GA more expressive weights to evolve, and (b) make the input-distribution invariance that A1 aims for actually matter.

Together, the bet is: same input distribution + weights that encode smooth rather than binary rules = cross-shape transfer begins to work.

---

## Key architecture observations (read before starting)

1. **Network topology:** `[6, 8, 4]` defined in `car.js:37-39`. Inputs: 5 raycast readings + 1 speed (see `sensor.js`, `car.js`). Outputs: forward / left / right / reverse.
2. **Hard threshold activation:** `network.js:82` — `outputs[i] = sum > biases[i] ? 1 : 0`. Both hidden and output layers.
3. **Archive format:** brains are stored as flat `Float32Array(92)` (see `FLAT_LENGTH` in `main.js`). Changing input or output width changes the flat length → **breaks archive compatibility**. Every architecture change in this plan must either migrate old brains or flag them as incompatible. Simplest path: bump a schema version and let `_debugReset` clear old-format entries on mismatch.
4. **Sensor impl:** `sensor.js` emits per-ray `offset` values already normalized to [0, 1]. Good — no per-track scaling drift on the raycast side. The problem is elsewhere.
5. **GA seeding:** `main.js:420-486` (`buildBrainsBuffer`) reads archive via `window.__rvBridge.recommendSeeds` and constructs the new population as a mix of elite + light mutants + heavy mutants + novel random. Any input-dim change needs the seeding path to reject (or migrate) incompatible archive brains.
6. **Save hook:** `localStorage.bestBrain` persists the elite between sessions (see `main.js:555-556`). Also needs to be invalidated on schema change.

---

## Phase A0 — Soft activations + schema versioning (prerequisite, ~1 sitting)

**Goal:** swap threshold → tanh, add a schema version, clear incompatible archives on load.

**Why first:** every subsequent phase touches the network. If archive compatibility isn't handled, Phase A1's benchmarks will be polluted by old archive entries with the wrong input dim, and debugging "why is gen-0 random-like when archive is non-empty" will waste a session. Also, tanh alone may or may not help within-track GA performance — useful to measure in isolation before layering A1 on top.

**What changes:**
- `network.js:82` (and the matching line in `sim-worker.js` if there's a duplicated forward-path) — replace threshold with `Math.tanh(sum - biases[i])`. Keep binary outputs on the *output* layer for now (they feed `controls.forward` etc. as booleans in `car.js:116-118`) — only the hidden layer needs softness.
- Add `const BRAIN_SCHEMA_VERSION = 2;` (current is implicit v1) in `brainCodec.js` or wherever `FLAT_LENGTH` is exported.
- `ruvectorBridge.js` archive init: on page load, check persisted schema version; if mismatch, run `_debugReset()` automatically and log a one-time notice.
- `main.js` localStorage load: gate `localStorage.bestBrain` read behind schema version check.

**Measurement:** re-run Phase 2 cold-rect + cold-tri (n=3 each) and compare to the Phase 2 numbers committed earlier. The null hypothesis is "tanh is a neutral swap." If survival drops meaningfully, that's a finding — binary output may have been providing useful quantization for the GA. If survival rises, even better.

**Acceptance:**
- Rectangle cold last-5 survival stays within ±0.05 of Phase 2's 0.492.
- Triangle cold last-5 survival stays within ±0.05 of Phase 2's 0.714.
- Schema-mismatch on archive triggers a clean reset, no crashes.
- `node --check` passes on all modified files; agent-browser smoke test loads without console errors.

**Files:** `network.js`, `sim-worker.js` (mirror the forward path), `brainCodec.js`, `ruvectorBridge.js`, `main.js`.

**Expected effort:** half day. Small code, careful archive handling.

**Outcome (shipped 2026-04-22):** tanh swap is empirically neutral, as hypothesised.

| Track | Baseline last-5 surv@5s | A0 last-5 surv@5s (n=3) | Δ | Acceptance (±0.05) |
|---|---|---|---|---|
| Rectangle cold | 0.492 | **0.488** (reps: 0.492, 0.571, 0.400) | −0.004 | ✓ |
| Triangle cold  | 0.714 | **0.717** (reps: 0.707, 0.815, 0.629) | +0.003 | ✓ |

Schema migrator fired cleanly on the cold-boot test (`[ruvector] brain schema v1 → v2 — clearing archive`); post-migration `localStorage.brainSchemaVersion === '2'`. `sim-worker.js` picked up the new activation transparently via `importScripts('network.js')` — no duplicate forward-path edit needed. Output layer still hard-thresholded so `car.js` can keep reading `outputs[i]` as booleans (a tanh output would produce non-zero floats that are truthy in JS → controls stuck "on").

---

## Phase A1 — Track-orientation sensor features (~1–2 sittings)

**Attempted 2026-04-23, reverted. See `docs/plan/ruvector-proof/arch-a1/PROOF.md` for measurement + retrospective.** The unit-vector `(local_forward, local_right)` parameterisation below regressed Triangle cold by −0.138 and made cross-track transfer worse (−0.221 vs cold-tri baseline, vs Phase 3.5's −0.056). Failure mode matched the "risks" section of this same phase: Triangle's tight apexes punish a "drive toward next CP" shortcut.

**A1' (scaled-distance variant) shipped 2026-04-23 — `docs/plan/ruvector-proof/arch-a1-prime/PROOF.md`.** Same feature vector, but instead of `(lf, lr) / ‖(lf, lr)‖` (unit vector), use `(lf, lr) / D` where `D` is the canvas diagonal (~3671 px). Magnitude of the feature now encodes "how close to the next checkpoint" — the NN can learn to distrust the direction shortcut when the target is near (i.e., near a wall). Acceptance results:

| Metric | Target | Measured |
|---|---|---|
| Cross-track Δ vs Phase 2 cold-tri baseline | ≥ +0.00 | **+0.013** (0.727 vs 0.714) |
| Rectangle cold Δ | within ±0.05 | −0.034 |
| Triangle cold Δ (n=6) | within ±0.05 | −0.007 |
| Same-track warm Δ | ~+0.001 ± 0.011 | +0.002 |

The section below is the original spec, preserved for reference.

**Goal:** add 2 inputs that give the network a frame-invariant view of "where's the corridor going."

**What changes:**
- Extend the input vector from 6 (5 rays + speed) to 8 (5 rays + speed + 2 corridor-direction components).
- New features computed per-tick inside `car.js` `update()`:
  ```
  dx = nextCheckpointMidpoint.x - car.x
  dy = nextCheckpointMidpoint.y - car.y
  Convert world (dx, dy) into car-local (forward, right):
    local_forward = dx * sin(angle) + dy * cos(angle)
    local_right   = dx * cos(angle) - dy * sin(angle)
  Normalize by corridor width or distance (unit-vector enough for a start).
  ```
- Network topology changes to `[8, 8, 4]` → `FLAT_LENGTH` changes (recompute: 8→8 weights + 8 biases = 72; 8→4 weights + 4 biases = 36; total = 108, up from 92).
- Bump `BRAIN_SCHEMA_VERSION = 3`. Archive auto-resets on version mismatch.

**Fitness note:** `fitness = checkpoints + laps * N`. That's unchanged; the new features are purely network input.

**Measurement:** re-run the Phase 3.5 cross-track transfer experiment:
1. Clear archive, train 30 gens Rectangle, switch to Triangle in-memory, train 30 gens Triangle — n=3.
2. Compare Δ last-5 vs. cold-tri baseline.

Also re-run same-track (Phase 3.5 follow-up) to confirm no regression.

**Acceptance:**
- Cross-track transfer Δ last-5 **flips from negative to positive** (Phase 3.5 control was −0.056; target ≥ +0.00, stretch ≥ +0.05).
- Same-track warm-restart Δ last-5 stays non-negative (not worse than Phase 3.5 follow-up's +0.001 ± 0.011).
- No regression on Phase 2 baselines (Rectangle / Triangle cold last-5 within ±0.05).
- Worst-case outcome acceptable: cross-track stays negative but less so. That's still a finding and a commit-worthy result.

**Risks:**
- Network suddenly has a feature that makes steering trivial ("the checkpoint is at angle X; turn toward X"). GA might just learn that feature and ignore raycasts, leading to wall-hits when the straight line crosses a wall. Mitigation: the raycasts still provide collision signal, and the GA will punish brains that ignore them.
- 108 vs 92 parameters — the net is bigger but still tiny. Mutation rates shouldn't need retuning.
- The corridor-direction features are defined per-tick relative to the NEXT checkpoint. If checkpoint-detection is buggy mid-lap, the features lie. Check `car.js` `#assessCheckpoint` logic.

**Files:** `car.js`, `sensor.js` (maybe), `network.js` (topology constant), `main.js` (`FLAT_LENGTH`), `brainCodec.js`, `sim-worker.js`.

**Expected effort:** 1–2 days. Input plumbing is the main work; the math is straightforward.

---

## Phase A2 — Hidden-layer normalization (~1 sitting, optional on top of A1)

**Goal:** layer-normalize the hidden-layer pre-activations so cross-track drift in numeric ranges doesn't destabilize learned weights.

**What changes:**
- In `network.js` `Level.feedForward`, after computing `sum` for each hidden unit but before `tanh`:
  ```
  Compute mean and variance across the 8 hidden units.
  Normalize: sum[i] = (sum[i] - mean) / sqrt(variance + eps).
  Then tanh.
  ```
- No learned gamma/beta — keep it parameter-free to avoid GA churn on extra weights.
- Bump `BRAIN_SCHEMA_VERSION = 4` (the network weights are still compatible with A1's shape, but the *inference semantics* change, so old brains will behave differently under normalization — better to version).

**Measurement:** same as A1 — cross-track transfer + same-track sanity, n=3 each.

**Acceptance:**
- Cross-track transfer Δ last-5 **≥ A1's result**. Layer norm should help, not hurt. If it hurts, keep A1 and drop A2 (record the finding).
- Within-track performance within ±0.05 of A1's numbers.

**Note:** this phase might be a no-op or even mildly negative for 8 hidden units. Layer norm's benefits grow with layer size. Worth trying, easy to remove if it doesn't help.

**Files:** `network.js`, `sim-worker.js` (mirror), `brainCodec.js`.

**Expected effort:** half day.

---

## Phase A3 — Combined proof run + UI update (~1 sitting)

**Goal:** capture the full updated proof run and, if the cross-track result is positive, revert the A3-era UI caveats.

**What changes:**
- Re-run all Phase 3.5 experiments with A1 (+ A2 if kept) in tree:
  - `docs/plan/ruvector-proof/phase3.5-v2/` — cross-track (Rect→Tri, n=3) and cross-track (Tri→Rect, n=3 new direction).
  - `docs/plan/ruvector-proof/phase3.5-samesame-v2/` — same-track continuation (n=3).
- Update `PROOF.md` and `PROOF-SAME-TRACK.md` (or create companion files) with the new numbers and a before/after comparison table.
- **If cross-track Δ is now positive**, revisit `AI-Car-Racer/eli15/chapters/track-similarity.js` and `what-is-this-project.js` — the caveat blocks I added in commit `ea000c5` can be updated to say "after the A1 sensor change, cross-shape transfer works empirically."
- **If cross-track Δ is still negative or flat**, leave the UI caveats in place and commit the result as "architecture changes tried, transfer still fails" — that's a real finding and closes the investigation cleanly.

**Acceptance:**
- 6 new CSVs in `phase3.5-v2/` + proof markdown.
- Before/after deltas clearly documented.
- UI either updated to match new reality or left with existing caveat (decision traceable in commit message).

**Files:** `docs/plan/ruvector-proof/phase3.5-v2/**`, potentially `eli15/chapters/*.js`, `docs/plan/generalization-fix.md`.

**Expected effort:** half day (mostly measurement + write-up, no code changes if A1/A2 are clean).

---

## Running summary of expected effort

| Phase | Effort | Kind of work |
|-------|--------|--------------|
| A0 | Half day | Soft activations + schema versioning |
| A1 | 1–2 days | Track-orientation sensor features (the big bet) |
| A2 | Half day | Optional layer norm on top |
| A3 | Half day | Measurement + UI decision |

Total: ~3 days of focused work, spread across 3–4 `/ship-task` invocations.

---

## What's in scope vs out

**In scope:**
- Sensor feature additions
- Activation function swaps
- Simple layer normalization
- Archive schema migration
- Cross-track + same-track measurement

**Out of scope (explicit):**
- Deepening the network (e.g. `[8, 16, 16, 4]`) — small increments only. If the 8-hidden net can't learn with A1+A2, report it; don't spiral into architecture tuning.
- Learned normalization parameters (gamma/beta, batch norm). The GA doesn't have gradients, so learned norm params add mutation noise without clear benefit.
- Backprop. This project is GA-only by design.
- Fitness function shaping. That's a separate investigation (hinted at in the Phase 0 baseline README — "within-run learning is weak, fitness signal too coarse").
- Curriculum learning across tracks. The cross-track experiments in A3 will either show transfer works or not; curriculum is a different question.
- Reward/LoRA adapter retuning. Phase 3 wired SONA; if A1/A2 shifts what "good" looks like, the adapter's reward normalization might need re-eyeballing, but treat as out of scope unless it actively breaks.

---

## How to run a phase via /ship-task

Each phase's "Acceptance" block is the confidence-gate target. Suggested invocation:

```
/ship-task Phase A1 of docs/plan/arch-cross-shape-transfer.md — track-orientation
sensor features. Read the plan doc for context, acceptance criteria, and file list.
Run the cross-track transfer experiment from docs/plan/ruvector-proof/phase3.5/
for measurement. Save new CSVs under docs/plan/ruvector-proof/phase3.5-v2/.
```

The plan doc is self-contained — no re-reading of the generalization-fix doc or the PROOF files is required unless the phase's measurement references them.

---

## Stop conditions

If any phase's acceptance fails twice (two sessions of debugging without getting to ≥95% confidence), stop the plan and write a retrospective rather than continuing. The possibility of "the 92-parameter net can't carry cross-shape transfer at any reasonable fix" is real, and a clean "we tried, here's what we learned" commit is more valuable than a half-finished sprawl.
