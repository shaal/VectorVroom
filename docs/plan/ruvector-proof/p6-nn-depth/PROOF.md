# P6 — NN depth bump 1→2 hidden layers, attempted and reverted

**Date:** 2026-04-23
**Status:** attempted (n=2), regressed Triangle vs P5, reverted.
**Family:** NN capacity (depth dimension). First *depth* experiment in the project; all prior changes were within a single hidden layer.
**Parent:** P5 hidden-width bump (`../p5-nn-capacity/PROOF.md`).

## What was tried

After P5 confirmed at n=3 that hidden-width 8 → 16 helps Triangle (apex
4% → 8%, CP3+ 8% → 21%, Rect convergence 29 → 12.7 gens), the obvious
next capacity-side experiment was **depth** — the idea that a second
hidden layer would enable multi-step policy composition (see narrowing
→ brake → turn → straighten) that single-hidden-layer architectures
can't easily express.

Topology change: `[10, 16, 4]` (1 hidden layer, 16 units) → `[10, 24, 8, 4]`
(2 hidden layers: 24 then 8 units). FLAT_LENGTH 244 → 500. Schema bump
v6 → v7. Same 5-file lockstep edit pattern as P1 and P5. network.js
already supported arbitrary topology depth (verified by inspection
before editing) — every iteration over `network.levels` is generic.

## Why the depth bump regressed

Two Tri-seeded reps (n=2) showed P6 *worse* than P5 across the board:

| Metric | P1 baseline | **P5 (n=3 avg)** | **P6 (n=2 avg)** | Δ vs P5 |
|---|---|---|---|---|
| Tri apex (CP4) reach | 4% | **8%** | 6% | **−2pp** |
| Tri CP3+ reach | 8% | **21%** | 14% | **−7pp** |
| Tri walls/gen | 274 | 284 | 297 | +13 (worse) |
| Rect first-lap-by-gen | 29 | 12.7 | 27 | +14 (slower) |
| Rect bestLaps | 1 | 1 (3-for-3) | 1 (1-for-1) | held |

Rep 1: apex 8%, CP3+ 16%, walls 295. Rep 2: apex 4%, CP3+ 12%, walls 297.
Both reps directionally consistent with "P6 ≤ P5" — none of P6's reps
matched even P5's average performance.

Rect convergence visibly slowed: P5 found a lap by gen 12.7 averaged;
P6 needed 27 gens (>2× slower). Both still hit the 50-gen ship gate but
the trajectory was clearly less efficient.

## Mechanism — capacity overshoot

P6 doubled the parameter count vs P5 (244 → 500 weights). The mutation
GA needs more generations to find good values for a doubled parameter
space, but the training budget stayed at 50 generations.

This is the **inverse** of P5's surprising "more params → faster
convergence" effect. P5 fell in the productive zone where more capacity
helped both representational expressiveness AND search efficiency
(more directions to mutate productively). P6 is past the productive
zone — the marginal capacity gain doesn't compensate for the GA's
slower exploration of the larger weight space.

This finding adds an important boundary to the "capacity-side family
helps Triangle" pattern from P5: **the right amount of capacity is
"just enough to fit the policy," not maximally large.** A1' added
direction features (small information bump). P1 added 2 rays (small
info bump). P5 doubled hidden width (medium capacity bump). P6
quadrupled the parameter count by adding depth — too much.

## Takeaways for future experiments

1. **The capacity-side family has a sweet spot.** P5's `[10, 16, 4]`
   appears to sit in it for the current GA budget (50 gens, 500-car
   pop). Going bigger doesn't monotonically improve; it can regress
   if the search budget doesn't scale with parameter count.
2. **P6 might still work with a larger training budget.** A 200-gen
   benchmark on `[10, 24, 8, 4]` could plausibly outperform 50-gen P5
   — the GA just needs more time to converge on the larger network.
   Testable but expensive.
3. **Try depth-only without width bump first.** A `[10, 16, 8, 4]`
   variant (same hidden width as P5, just adds an 8-unit layer) would
   isolate the depth effect from the parameter-count overshoot.
   FLAT_LENGTH would be 176 + 132 + 36 = 344, only ~40% bigger than
   P5 instead of P6's 100%. If depth-only also regresses, the depth
   hypothesis is dead; if it helps, P6 was just "too big" not
   "fundamentally wrong."
4. **The brain export validator still needed updating** — when adding
   depth specifically, the topology check has to handle 4-element
   arrays. Mechanically straightforward but documents an asymmetry
   worth noting for future depth experiments.

## Code state

Fully reverted by `git checkout` on 5 files:
- car.js — NN constructor back to `[rayCount+3, 16, 4]`
- brainCodec.js — TOPOLOGY [10,16,4], FLAT_LENGTH 244, schema v6
- brainExport.js — expected [10,16,4]
- sim-worker.js — TOPOLOGY/FLAT_LENGTH mirror back to P5
- main.js — FLAT_LENGTH 244, schema v6, NN constructor [10,16,4]

No schema bump persisted, no archive wipe, no main.js or trackPresets
changes. Brains trained during P6 benchmark sessions (500-dim) remain
in IDB but will be auto-evicted on next page load because the schema
version mismatch (still v6 in code, but IDB now contains v7 brains
written during P6 testing) triggers `migrateBrainSchemaIfNeeded`.

Wait — actually that's a concern. If a tester ran P6 locally during
this session, their IDB now has v7 brains. After this revert restores
schema v6, the migrator will see `effective='7'` and `current='6'` —
they don't match, so it will wipe IDB. Same outcome as forward
migration, just reverse direction. Verified by inspection of
`migrateBrainSchemaIfNeeded` (ruvectorBridge.js:228-247) which does an
inequality check, not a forward-only check.

## Smoke-test verification (pre-revert)

P6 forward path was clean:
- `[brainCodec] self-check passed — 500-dim round-trip ok`
- `[ruvector] brain schema v1 → v7 — clearing archive`
- 4-layer topology trains end-to-end without errors
- Both Rect and Tri benchmarks completed, just with worse performance
  than P5 baseline

The mechanism is verified working — depth bump is implementable cleanly.
The empirical result is just that it doesn't help on this problem at
this training budget.
