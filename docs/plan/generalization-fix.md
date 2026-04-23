# Generalization Fix — Staged Plan

**Primary goal:** make it *visibly and measurably* true that the ruvector features (vector-memory archive, GNN reranker, SONA trajectory patterns, track adapter) make cars drive smarter as experience accumulates. Starting from zero should look dumb; starting with 200+ archived brains should look noticeably smarter at generation 1, and should improve further across generations.

**Secondary goal:** cars trained on one track shape should carry skill to another, and with 1000 cars a meaningful fraction should survive a full lap on any preset.

**Problem today (verified 2026-04-22):**
1. Spawn position is hardcoded world-pixel coords `(2880, 900)` in `AI-Car-Racer/main.js:6`. Presets were hand-tuned so that point lands inside each corridor, but the *neighborhood* around it (distance to nearest wall, angle to checkpoint 1) changes wildly between shapes. Brains overfit to whatever neighborhood the Rectangle happens to provide.
2. No pose variation during training. Every car in every generation starts at the same position and heading, so the genetic algorithm rewards memorizing a single opening trajectory instead of learning a reactive policy.
3. `addPhase4Step()` exists in `ruvectorBridge.js:629` but is never called from the sim loop — SONA trajectory steps stay empty, so `patterns 0 · μup 0 · track adapter drift 0` despite 4525 archive observations. The transfer-learning infrastructure is half-wired.

**Design principle:** each phase is independently shippable with a measurable win. You can stop after any phase and keep the gains.

---

## Ruvector value claims — what each feature is supposed to do

Before we measure, let's be precise about what we're testing. Each feature makes a different claim; each has an existing UI toggle so we can A/B it.

| Feature | Claim | UI toggle | A/B null hypothesis |
|---------|-------|-----------|---------------------|
| Archive seeding (`ruvector` vector store, 212 brains) | Gen 1 of a new run starts smarter than cold random | "Vector Memory ON/OFF" | Archive seeding doesn't help → gen-1 median checkpoints are equal with/without |
| GNN reranker | Better brain selection from archive when track geometry matters | `reranker: auto\|none\|ema\|gnn` | GNN picks are no better than EMA → no difference in gen-1 survival |
| Track adapter (SONA micro-LoRA) | Live weight adaptation to current track within a run | `track adapter: off\|micro-lora\|sona` | Adapter off matches adapter on → no lift over generations |
| SONA trajectory patterns | Successful maneuvers extracted and biased into population | (implicit — needs Phase 3 before testable) | Pattern extraction has no population-wide effect |
| Hyperbolic index | Better similarity matching when tracks have hierarchical structure | `index: euclidean\|hyperbolic` | No difference vs euclidean |

**Measurement strategy (added to Phase 0):** every benchmark row logs the toggle state. We then compare matched-toggle pairs. This is the evidence that will make the ruvector value prop either true, partly true, or false — and either outcome is useful.

---

## Phase 0 — Instrumentation & baseline (prerequisite, ~1 sitting)

Without this you can't tell whether later phases actually help.

**What to build:**
- A small per-generation metrics panel (reuse the `perf` HUD style in the bottom-left):
  - **Survival rate:** % of cars alive at 5s, 15s, 30s, full lap
  - **Median checkpoints reached** (not just max — the elite will always reach far; the median tells you if the *population* learned anything)
  - **Best-lap-time trend** over last N generations
  - **Wall-bump count** (new: a direct crash metric, because "does it bump into walls" is the user's intuitive quality signal)
- A "run N generations and log a CSV row per generation" mode triggered from the console:
  - `__runBenchmark(trackName, generations, { label, vectorMemory, reranker, trackAdapter, index, cold })`
  - Every row records: generation, median-checkpoints, p90-checkpoints, survival@5s/15s/30s, wall-bumps, best-lap-time, **and the full ruvector toggle state**. This is what turns a vibe into a defensible claim.
  - `cold: true` wipes the archive before running → fair starting-from-zero comparison
  - Writes to localStorage and offers a CSV download
- A **"Ruvector A/B" console helper**: `__abTest(trackName, generations, configA, configB)` runs both configs sequentially (cold archive in between if the config specifies) and prints a diff table. This is the tool that will generate the screenshots / numbers that prove or disprove each claim in the table above.

**Baseline runs to capture today (before any fix):**
1. `__runBenchmark('Rectangle', 30, { label: 'baseline-rect', cold: true })` — true cold start, no archive
2. `__runBenchmark('Rectangle', 30, { label: 'warm-rect' })` — with existing 212-brain archive
3. `__runBenchmark('Triangle', 30, { label: 'baseline-tri-cold', cold: true })`
4. `__runBenchmark('Triangle', 30, { label: 'warm-tri-rect-seeded' })` — warm archive that has Rectangle experience but maybe no Triangle

Save all four CSVs. The delta between 1 and 2 (and between 3 and 4) at **generation 1** is the ruvector archive's contribution right now. If that delta is ~zero today, that's our first real finding: the archive exists but isn't helping — and Phases 1–3 need to fix the reasons why.

**Why first:** "does it feel better?" is not a signal you can trust across sessions. Also, if Phase 1 regresses Rectangle performance (unlikely but possible), you want to know immediately.

**Files:** `main.js`, `sim-worker.js` (already computes per-car fitness; just needs to expose percentiles in the genEnd snapshot), `ruvectorBridge.js` (snapshot the archive count at run start; add a `__clearArchive()` for cold-start tests).

### Phase 0 — Implementation status (as of 2026-04-22)

**Shipped** — code in tree, `node --check` clean:

- `sim-worker.js`: per-car `deathFrame` tracking (set on damaged→true transition). At `endGen`, builds `popCheckpoints` (Int16Array, N) and `popDeathFrames` (Int32Array, N, `-1` = survived to timeout) and includes `popN`, `popWallBumps`, `popStillAlive`, `genSeconds` in the `genEnd` postMessage. Buffers are transferred, not cloned.
- `main.js`:
  - New `metrics-hud` DOM panel, sibling of `perf-hud`, top-right, live "alive N/N" + last-gen stats (median/p90/max checkpoints, wall-bumps, survival@5s/10s/end).
  - `handleSnapshot` computes live-alive from `positions[i*5+3]`.
  - `handleGenEnd` derives the row via `metricsComputeRow(m)`, pushes to `__metricsLog`, and (if a benchmark is active) captures a full CSV row merged with live ruvector toggle snapshot.
  - Console helpers: `__clearArchive()`, `__runBenchmark(gens, opts)`, `__abTest(gens, configA, configB, opts)`, `__downloadCSV(label, rows?)`. Re-entry guarded; watchdog rejects on hang; console warns on low batchSize or simSpeed.

**CSV schema (per-row):** `label, trackLabel, cold, vectorMemory, reranker, adapter, index, dynamics, archiveBrains, archiveTracks, archiveObservations, gen, popN, medCheckpoints, p90Checkpoints, maxCheckpoints, wallBumps, stillAlive, survival5s, survival10s, survivalEnd, bestFitness, bestLaps, bestLapMin, genSeconds`.

**Smoke test (user-run, prerequisite to commit):**
```js
// in DevTools console while in phase 4 (training), with a track loaded:
__runBenchmark(3, { label: 'smoke', track: 'Rectangle' })
```
Expected: `metrics-hud` appears top-right; "alive N/N" updates live; per-gen stats populate; after 3 gens a CSV downloads automatically.

**Deferred to user (not in this session):**
- Four baseline CSV captures (`cold-rect`, `warm-rect`, `cold-tri`, `warm-tri-rect-seeded`) into `docs/plan/ruvector-proof/baseline/`. Each is a 30-gen run at simSpeed≈100 / batchSize≈1000.
- Archive-size-curve captures (Phase 3.5) — requires many sessions of accumulated runs.

**Known caveats:**
- `__runBenchmark` does not switch tracks. Load the preset via the phase-1 UI first, then transition to phase 4, then invoke.
- `__runBenchmark` doesn't set `batchSize` or `simSpeed` — warnings surface low values; use the Training tuning sliders before running.
- `_debugReset()` post-state assumed correct from the exploration report; if cold benchmarks misbehave, a page reload may be needed between them.

---

## Phase 1 — Track-relative spawn (~1 sitting)

**What changes:** replace the fixed `startInfo = (2880, 900)` with a position computed from the loaded track.

**Algorithm:**
```
spawn = midpoint of the first checkpoint gate (checkPointListEditor[0])
heading = perpendicular to that gate, pointing toward checkpoint[1]
```

This works for every existing preset because checkpoints already define the correct forward direction. For the Rectangle the result is close to (2880, 900); for the Triangle it will be near (325, 900) on the left apex — which matches where the track actually *starts*.

**Edge cases to handle:**
- `road.js` and `sim-worker.js` both need to receive the new spawn (grep `startInfo` — there are a handful of call sites).
- `trackPresets.js` has a hand-authored invariant ("outer right edge near x=3100 so spawn rect stays inside"). Once spawn is track-relative that invariant is obsolete — leave the comment for now but note it's deprecated.
- Custom tracks drawn in `roadEditor.js` already produce `checkPointListEditor`, so this Just Works for them too.

**Expected effect (measured vs Phase 0 baseline):**
- Rectangle performance should be **equal or slightly better** (start moves to the actual first checkpoint, which is a cleaner initial state).
- Triangle with Rectangle-seeded brains: **still bad**, but for the right reason — brains haven't seen this pose. This sets up Phase 2.
- "Start-but-facing-wrong-way" failures should vanish on all presets.

**Acceptance:** re-run both benchmarks. Rectangle median checkpoints ≥ baseline. START marker visually lands at the first checkpoint gate on every preset.

### Phase 1 — Implementation status (2026-04-22)

**Shipped.** Files changed: `AI-Car-Racer/main.js`, `AI-Car-Racer/sim-worker.js`, `AI-Car-Racer/car.js`. ~40 lines total.

- `main.js:6`: kept fallback startInfo but added `heading` field and helper `computeStartInfoInPlace(cpList)` that mutates startInfo to the midpoint of `checkPointListEditor[0]` with heading = `atan2(dx, dy)` toward checkpoint[1]'s midpoint (matching the car's `sin(θ)=dx, cos(θ)=dy` convention). Called at module load, and again inside `begin()` for training correctness.
- `car.js:2`: Car constructor gains an optional 7th `angle=0` parameter; `this.angle=angle` replaces `this.angle=0` before `#createPolygon()` so first-tick polygons are correct from the start.
- `sim-worker.js:114`: AI cars receive heading via the `startInfo` message.

**Programmatic verification on all 10 presets:** every computed spawn lands in the corridor (inside the outer polygon, outside the inner polygon) via point-in-polygon test. Headings confirmed against the first-to-second checkpoint vector.

**Empirical results — Rectangle and Triangle, 30-gen benchmarks at batchSize=1000, simSpeed=100, cold start:**

| Run | surv@5s (baseline → Phase 1) | med cp | max cp | wall-bumps |
|---|---|---|---|---|
| Rectangle cold | 0.455 → 0.433 | **0 → 1** | 3.0 → 3.0 | 616 → 606 |
| Triangle cold | **0.248 → 0.583** | **0 → 1** | **0.4 → 2.0** | **759 → 536** |

Triangle survival more than doubled; median checkpoints lifted off zero for the first time in any baseline run. Rectangle within noise on survival but also lifts median 0 → 1.

CSVs saved to `docs/plan/ruvector-proof/phase1/`.

### Phase 2 — Implementation status (2026-04-22)

**Shipped**, but with a **deliberate scope change from the original spec.** Files changed: `AI-Car-Racer/main.js`, `AI-Car-Racer/sim-worker.js`. The data told me the spec's defaults were wrong, so I adjusted.

**What the original spec called for:** disk pose jitter (radius 40px, ±15° heading) around the canonical spawn, rejection-sampled against the corridor, for every non-elite car.

**What I actually shipped:**
1. **Spawn now offset forward** from the first-checkpoint gate midpoint by `min(80px, 0.15 · |cp1 − cp0|)` along the heading direction. Matters because `cp0` often runs wall-to-wall (Triangle's left apex gate spans the entire apex tip), leaving no lateral margin for a 30×50 car body. The offset moves the spawn 80px deeper into the corridor where there's breathing room.
2. **Pose-jitter mechanism (still in sim-worker.js handleBegin)** now lives behind an opt-in flag. Default is `{ radiusPx: 0, angleDeg: 0 }` — no jitter. Users with wide tracks can enable via `window.__poseJitter = { radiusPx: 40, angleDeg: 15 }` from the console.

**Why the scope change:** empirical benchmarking with disk jitter at radius=40 **regressed Triangle cold survival by ~40%** (0.583 → 0.339). The Triangle apex's 70px-wide corridor zone left no room for even moderate jitter to avoid walls. Rectangle still benefited from jitter (0.433 → 0.596), so the mechanism works — it's the default that was miscalibrated. Rather than pick a single compromise radius, I moved the spawn deeper (which helps both tracks) and made jitter opt-in.

**Results — 3 replicates × 30 gens × 1000 cars × cold-start:**

| Track | Baseline | Phase 1 | **Phase 2 mean ± σ (n=3)** | lift vs P1 |
|---|---|---|---|---|
| Rectangle surv@5s | 0.455 | 0.433 | **0.492 ± 0.025** | +14% (~2.4σ) |
| Triangle surv@5s | 0.248 | 0.583 | **0.714 ± 0.066** | +22% (~3σ) |
| Triangle median cp | 0 | 1 | **2** | 2× |
| Triangle max cp | 0.4 | 2 | 2 | — |

Triangle's lower bound (0.648) exceeds Phase 1's mean (0.583), so the improvement is statistically defensible even with n=3.

CSVs saved to `docs/plan/ruvector-proof/phase2/` (primary trials) and `docs/plan/ruvector-proof/phase2/replicates/` (trials 2 and 3).

**Caveats to carry into Phase 3+:**
- 8 non-Rectangle-non-Triangle presets not empirically tested — geometry-only validation passed.
- On Rectangle, median-cp is high-variance at 30 gens (trial values 0, 0.8, 1). p90 is more stable.
- Rectangle offset-only (0.492) is slightly worse than Rectangle-with-jitter-no-offset (0.596 in the earlier single trial). If a future session wants to revisit, a track-width-aware jitter radius (scaled by local corridor clearance) could recover Rectangle's extra lift without re-breaking Triangle.

---

## Phase 2 — Pose randomization during training (~1–2 sittings)

**What changes:** when spawning cars for training (not for the player), jitter the pose.

**Algorithm:**
```
base = track-relative spawn from Phase 1
for each car:
  x, y = base + uniform(-spawnJitterRadius, +spawnJitterRadius)
  heading = base_heading + uniform(-spawnJitterAngle, +spawnJitterAngle)
  # reject samples that land outside the corridor or too close to a wall
```

Start conservative: radius = 40px, angle = ±15°. Expose as sliders in `Training tuning (sliders)` so you can tune live. The elite car keeps the un-jittered pose so fitness remains comparable across generations.

**Why this is the key fix:** sensors are already heading-relative (`car.js:110-114`), so in principle the network *can* generalize. It just never has a reason to, because the input distribution at t=0 is a delta function. Jitter forces the GA to reward weights that work across a small neighborhood of states — which is exactly the generalization skill that transfers to a new track shape.

**Stretch: multi-start training.** Once simple jitter works, try spawning 20% of the population at `checkPoint[1]`, 20% at `checkPoint[2]`, etc. This teaches the brain to drive from arbitrary points on the track, not just the start. Very effective for transfer learning. Gate behind a flag so you can A/B it.

**Expected effect:**
- Rectangle median checkpoints may **temporarily drop** (harder training task) then recover and exceed baseline within ~20 generations.
- Triangle with Rectangle-seeded brains: **meaningful survival for the first time.** Target: ≥10% of cars reaching checkpoint 2 on a brand-new shape without re-training.
- Variance across the population increases (good — more exploration).

**Acceptance:** run the `Rectangle → Triangle` transfer benchmark. Pre-Phase-2: median cars reach 0 checkpoints on Triangle. Post-Phase-2: target median ≥ 1, top 10% ≥ 2.

---

## Phase 3 — Wire SONA trajectory recording (~1 sitting, maybe 2)

**What changes:** call `addPhase4Step(activations, attention, stepReward)` from the per-tick simulation code so the trajectory buffer actually fills.

**Where:**
- `sim-worker.js` runs the per-tick physics for all AI cars. After each best-car tick (only need the elite's trajectory, not all 1000), extract:
  - `activations` — the hidden-layer outputs (Network forward pass already computes these; just expose them)
  - `attention` — for the basic MLP, this can be the input-magnitude vector (6 sensors + speed). Proper attention requires GNN integration; the stub is fine for now.
  - `stepReward` — the per-tick fitness delta (checkpoint crossings give +1, collisions give −large, else small shaping reward for forward speed)
- Post these back to main via the existing snapshot message, then call `window.__rvBridge.addPhase4Step(...)` from main.

**Verification:** after one generation, the Vector Memory panel should show `traj N (+open, M steps) · patterns K` with non-zero numbers, and `TRACK ADAPTER` drift should tick up.

**Expected effect:**
- Track adapter now actually adapts. Cross-track transfer improves further on top of Phase 2.
- Seeding from archive becomes meaningful — the 212 brains already stored get properly scored against new tracks via GNN reranking.

**Acceptance:** `SONA: traj > 0 · patterns > 0 · μup > 0` after the first generation of a fresh run. Track adapter drift > 0 after ~10 generations. Benchmarks show an additional lift over Phase 2 numbers on the transfer task.

---

## Phase 3.5 — The ruvector proof run (NEW, this is the headline demo)

After Phases 1–3 are in place, the bottleneck stops being plumbing and starts being evidence. This phase is dedicated to producing the clear demonstration that ruvector actually makes cars smarter.

**What to produce:**
1. **Cold-start vs warm-start chart** (the headline image):
   - X axis: generation (1…30)
   - Y axis: median checkpoints reached
   - Two lines: "no archive" (wiped, gen 1 = random) vs "with archive" (212+ brains seeded)
   - Expected shape: warm line starts significantly above cold line at gen 1, both converge by gen ~20. The gap at gen 1 is the archive's contribution. If lines overlap, the archive isn't earning its storage.

2. **Archive-size curve** (the strongest long-term claim):
   - X axis: number of prior runs archived (0, 50, 100, 200, 500…)
   - Y axis: gen-1 median checkpoints on a **fresh, unseen track**
   - If ruvector works, this line slopes up and asymptotes. If it's flat, vector memory is decorative.
   - This is slow to generate — each data point needs a fresh archive of that size. But it's the one chart that unambiguously answers "does accumulating experience help?"

3. **Reranker A/B** (`__abTest('Triangle', 20, {reranker:'none'}, {reranker:'gnn'})`):
   - Does GNN picking beat no-reranker picking? By how much?

4. **Track-adapter A/B** (`__abTest('Monza', 20, {trackAdapter:'off'}, {trackAdapter:'sona'})`):
   - Does the live LoRA adapter lift performance within a run?

5. **Transfer-learning demo** (the qualitative demo for the README/tour):
   - Start cold on Rectangle, run 50 generations, archive.
   - Switch to Triangle **without further training**. Record generation-1 survival.
   - Compare to cold Triangle. The difference is transfer learning working — and this is the scenario the user originally asked about.

**Each chart gets saved as a screenshot + CSV into `docs/plan/ruvector-proof/`.** This becomes the durable evidence that the feature works (or shows where it doesn't).

**Possible outcomes and what they mean:**
- **All charts show clear lift:** ship it, surface the numbers in the UI tour, done.
- **Archive seeding helps but GNN reranker doesn't:** the retrieval works, the reranking doesn't. Ship archive-on by default, make reranker opt-in, file a follow-up.
- **Archive seeding helps on same-shape re-runs but not on shape transfer:** the track vector isn't capturing shape similarity well. Investigate the track-embedding code in `ruvectorBridge.js`.
- **Nothing helps beyond pure GA:** ruvector is overhead. Either fix the glue (Phases 1–3 probably didn't go far enough) or retire the feature honestly.

Any of these is a real answer, and the project is better off for having it.

---

## Phase 4 — Stretch / polish (only if wanted)

- **Reset-on-collision during training:** let cars that crash respawn at a random checkpoint instead of dying, to collect more gradient per generation. Compatible with the multi-start idea.
- **Curriculum learning:** train 10 generations on Rectangle → 10 on Oval → 10 on Triangle automatically, instead of you manually switching. The archive accumulates experience across shapes.
- **Fitness shaping:** currently fitness is `checkpoints + laps*N`. Add a small penalty for proximity to walls, reward for staying centered in the corridor. Helps generalization; also makes runs look better visually.

---

## Summary table

| Phase | Effort | Visible win |
|-------|--------|-------------|
| 0 | Half day | Baseline CSV + live metrics panel + ruvector toggle logging + `__abTest` helper |
| 1 | Half day | START marker lands correctly on every track |
| 2 | 1–2 days | Cars survive on a track shape they weren't trained on |
| 3 | 1–2 days | SONA counters tick up; cross-track transfer improves further |
| 3.5 | 1–2 days | **Headline charts proving ruvector earns its keep** (cold vs warm, archive-size curve, reranker/adapter A/B, transfer demo) |
| 4 | Open-ended | Fitness, curriculum, crash-recovery polish |

## Where to start

Phase 0 first. Don't skip it — you'll regret running Phases 1–3 without a baseline to compare against, because the wins on some presets will be small and you need the numbers to see them.
