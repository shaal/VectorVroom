# P4 — Per-preset maxSpeed override on Triangle, attempted and reverted

**Date:** 2026-04-23
**Status:** attempted, hypothesis disproved, reverted.
**Family:** physics — first experiment in this family, now the first
documented failure. Distinct from reward-shape (4× failed: A1, F1, F1', P2)
and track-curriculum (1× failed: P3) families.

## What was tried

After P2 (reward-shape) and P3 (track-curriculum) both failed, the next
hypothesis targeted the project's documented physics gap: at the global
default `maxSpeed=15` with brake decel `maxSpeed/60 = 0.25 px/frame²`, the
stopping distance from full speed is roughly 450 px — *exceeding* the 400 px
sensor range. The brain physically cannot brake in time once a wall enters
the lidar fan. Lowering `maxSpeed` to 10 reduces stopping distance to ~200
px, well inside the sensor range, making wall-avoidance physically achievable
from existing lidar inputs.

Implementation added an optional `maxSpeedOverride` field to track preset
objects in `trackPresets.js`. In `loadTrackPreset()`, after the road rebuild
and worker invalidation, the code calls `setMaxSpeed(preset.maxSpeedOverride)`
if defined, else `setMaxSpeed(15)`. Slider DOM is synced manually because
`setMaxSpeed()` doesn't update the slider (its onchange fires only on user
drag, not programmatic value writes). Triangle preset got
`maxSpeedOverride: 10`. Other 9 presets unchanged.

Brain topology unchanged `[10, 8, 4]`, no schema bump, no archive wipe.
Existing trained brains transferred — the network outputs control signals
and the maxSpeed cap clamps speed externally.

## Why the hypothesis was disproved

Two benchmark configurations both failed: Tri seeded from Rect@15 archive,
and Tri trained cold at maxSpeed=10 directly. The cold variant was the
cleaner test (no cross-physics seeding mismatch where brains trained on
Rect at maxSpeed=15 might transfer poorly to maxSpeed=10 because the
`speed/maxSpeed` input distribution shifts).

| Metric | P1-only baseline | P4 Tri seeded@10 | P4 Tri cold@10 |
|---|---|---|---|
| Rect bestLaps (gen 29) | 1 ✓ | 1 ✓ (override Tri-only) | n/a |
| Rect fastestLap (s) | 10.7 | 9.73 | n/a |
| **Tri max-cp ever (50 gens)** | **4 (apex tip)** | **2** | **2** |
| Tri gens reaching CP4 (apex) | 4% (2/50) | **0%** | **0%** |
| Tri gens reaching CP3 (top edge) | 8% (4/50) | **0%** | **0%** |
| Tri laps ever | 0 | 0 | 0 |
| Tri walls/gen first10 → last10 | 284 → 274 | 320 → 305 | 340 → 347 |
| Tri survival /gen | ~226 | 180 → 195 | 160 → 153 |

Both P4 configurations produced **0/50 gens reaching CP3** — *worse* than
P1-only's 4/50 gens reaching all the way to CP4. The brain at maxSpeed=10
didn't even leverage the extra braking headroom to make incremental
progress.

The wall-deaths in the seeded run dropped a small ~5%, and survival
slightly improved (180→195), but apex completion regressed. The cold
run actually got *worse* on walls (~340→347) and the elite never even
reached CP3 across 50 gens.

## Mechanism

The hypothesis "stopping distance > sensor range is the binding constraint"
is **disproved**. The constraint is *real* — the math holds — but it is
not what limits the GA's search. Even when given physical headroom to
brake, the brain doesn't find the apex policy.

Updated mental model: the bottleneck is one or more of —

1. **NN capacity.** A `[10, 8, 4]` network with 8 hidden ReLU/tanh units
   may genuinely lack the representational capacity to encode "slow when
   close + steer toward direction-feature + commit through narrowing
   corridor." The Rect policy (drive forward, slight steer) fits in 8
   units; the Tri-apex policy probably doesn't.
2. **Search budget on a hard geometry.** 50 generations of 500-car
   populations may simply not find the apex policy by random GA search,
   regardless of physics. The apex region is a narrow basin in policy
   space — the GA's exploration radius around the seeded Rect policy may
   not reach it.
3. **Curriculum mismatch.** Cold-training Tri starts random brains
   directly on the hardest geometry. Without intermediate easier tracks,
   the GA's selection pressure produces "barely survive on Tri" policies
   that are local-optimal and don't progress.

P3 already tried "make Triangle easier via intermediate CPs" and that
failed differently (parking at intermediates). The remaining levers are
NN-capacity (#1) and curriculum-via-track-progression (#3).

## Takeaways for future experiments

1. **Physics family is now also documented as failed on Triangle.**
   With reward-shape (4×), track-curriculum (1×), and physics (1×) all
   reverted, Triangle is robust to all three intervention families.
   The project is now 6× replicated on "Triangle apex is uniquely hard."
2. **Stopping-distance gap is real but not binding.** The math
   (450 px stopping > 400 px sensor) describes a real upper bound on
   reactive performance, but the GA's failure mode is *not* late
   braking — it's not finding the apex policy at all. Don't redesign
   the reward function around stopping-distance reasoning.
3. **The per-preset `maxSpeedOverride` mechanism itself is sound.**
   The code change cleanly separated Triangle's physics from the global
   slider, and Rect was provably unaffected (lap held at 9.73s, override
   confirmed flipped 15→10→15 across preset switches). Future
   experiments can re-use this pattern if a per-preset physics
   parameter is genuinely needed.
4. **Highest-priority untried levers** after P1 ✓, P2/P3/P4 ×:
   - **NN capacity bump:** [10, 8, 4] → [10, 16, 4] or [10, 24, 8, 4].
     Schema bump required (v5 → v6), cold train Rect first.
   - **Multi-track curriculum:** train Rect → Hexagon → Pentagon → Triangle
     instead of Rect → Triangle directly. Each track adds geometric
     complexity; the Pentagon's narrower right-nose corridor might
     bridge the gap to Triangle's apex.

## Code state

Fully reverted by `git checkout AI-Car-Racer/trackPresets.js`. No schema
bump, no archive wipe, no main.js or sim-worker.js changes. Brains
trained during P4 benchmark sessions (mixed-physics) remain in IDB but
will age out via normal archive churn.

## Smoke-test verification

Per-preset override mechanism verified end-to-end:
- `loadTrackPreset('Triangle')` → `maxSpeed === 10` ✓
- `loadTrackPreset('Rectangle')` → `maxSpeed === 15` ✓ (override cleared)
- `loadTrackPreset('Triangle')` again → `maxSpeed === 10` ✓
- Slider DOM stays in sync via the manual update in `loadTrackPreset()`.
- Rect cold benchmark: bestLaps=1, fastestLap=9.73s — no override leak.
