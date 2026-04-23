# P8 — Single return-path checkpoint on Triangle, attempted and reverted

**Date:** 2026-04-23
**Status:** attempted, hypothesis disproved, reverted.
**Family:** track-curriculum (gradient installation on return-path).
**Parent:** P7 data finding (cold-train Triangle on P5 architecture hits apex in 94% of 300 gens but laps stay 0).
**Supersedes P3's failure case:** different enough to retest because the problem structure is different (see below).

## Motivating data from P7 (which wasn't a code change, just a benchmark)

Before P8 we ran a plain 300-gen cold-Tri benchmark on the P5-shipped `[10, 16, 4]` architecture (no seeding from Rect archive). This was the first cold-train-Tri test at full budget in the session and it was a revelation:

| Gens window | apex (CP4) reach | wall-deaths/gen |
|---|---|---|
| 0-49   | 42/50 (84%)  | 277 |
| 50-99  | 48/50 (96%)  | 294 |
| 100-149 | 47/50 (94%) | 289 |
| 150-199 | 46/50 (92%) | 290 |
| 200-249 | 49/50 (98%) | 293 |
| 250-299 | 49/50 (98%) | 292 |

**281/300 gens (94%) reached the apex tip.** Zero laps. The entire session's earlier benchmarks (P1/P5 showing apex-reach of 4-10%) had been bottlenecked by Rect-archive seeding contamination — the Rect-trained priors suppress Tri apex policy via ruvector recall. Cold-train Tri directly and the apex is solved.

The new bottleneck: CP4 → CP1 return path (bottom side of the triangle back to spawn). Apex-reach saturates at ~98% by gen 50 and the curve flatlines. No brain discovers the return traversal. Apex is an attractor the GA learns; return is a dead zone it doesn't.

## P8 hypothesis

Adding a single CP on the return path installs a *missing* gradient where there was none, rather than *fragmenting* an existing one (P3's failure mode was the latter). If the GA can select for "reached new CP5 after apex," a return-navigation policy should emerge.

Distinction from P3:
- P3 added 3 CPs on the out-path (top-right slope, apex approach, apex exit). Rect-seeded brains *already had* a "drive forward toward next CP" policy on the out-path — new CPs let them satisfy fitness at easier intermediates without pushing through. Parking local optimum.
- P8 adds 1 CP on return only. Cold-trained brains have *no* policy post-apex. New CP can't be a parking local optimum because there's no weak policy already driving toward it — the GA has to build one from scratch.

Different mechanism, different expected outcome.

## Implementation

Single-line edit in `trackPresets.js`. Triangle `checkPointListEditor` grew from 4 → 5 gates:

```js
[{ x: 900,  y: 950  }, { x: 900,  y: 1100 }]  // 5: bottom-return (P8 NEW)
```

Position chosen at x=900 on the lower corridor (corridor y range at x=900: outer=1065 px, inner=984 px; gate overshoots safely at y=950..1100). No brain topology, schema, reward, or physics changes.

## Results

Cold Tri 150 gens at batchSize=500, simSpeed=100, P5 architecture `[10, 16, 4]`:

| Window | apex reach (CP4) | CP5 reach | laps | walls/gen |
|---|---|---|---|---|
| 0-49    | 0/50 (0%) | 0/50 (0%) | 0 | 314 |
| 50-99   | 0/50 (0%) | 0/50 (0%) | 0 | 278 |
| **100-149** | **48/50 (96%)** | **0/50 (0%)** | **0** | **251** |

Zero gens reached CP5 across 150 gens. The single added CP produced no visible signal in the return region despite 50 gens of saturated apex-reach.

Apex-reach reconstructed more slowly than in P7 (gen 100 vs gen 50 — 2× slower to converge to the same ~96% level). The added fifth gate changed the fitness landscape enough to delay the apex policy learning, and didn't compensate by unlocking further progress.

Rectangle sanity: 1 lap by gen 17, fastest 8.72s. Rect preset untouched ✓.

## Why it didn't work — the mechanism

The direction-to-next-CP feature correctly flips 180° after the brain crosses CP4 (now points at CP5 = bottom-right of apex). But the brain's motor policy doesn't know how to act on a reversed direction vector when the car is still traveling forward-left at full speed. The required maneuver is a *sequence*:

1. Detect apex proximity via lidar (walls close ahead)
2. Decelerate to near-zero
3. Turn until heading matches new direction vector
4. Re-accelerate

This is a state-dependent action sequence. The `[10, 16, 4]` network is **stateless feedforward** — each frame's output is a pure function of that frame's inputs. There's no temporal memory; the brain can't represent "I just reached the apex, now execute a U-turn." It must encode the entire U-turn as a reactive mapping from sensor + direction + speed to controls.

A reactive mapping for a U-turn is theoretically possible but requires discovering a weight configuration where:
- `direction_forward << 0` AND `speed > threshold` → output `brake=on, forward=off`
- `speed ≈ 0` → output `turn=on` (toward the direction vector)
- `heading aligned` → output `forward=on`

Three distinct input-space regions needing three distinct outputs, all from 16 hidden units with no hysteresis. The GA's search budget (150 gens × 500 cars = 75,000 policies evaluated) apparently isn't enough to land in this weight region by random mutation.

**P8's finding: adding a reward TARGET on the return path does not teach the MOTOR SKILL of reversing direction.** The brain has the navigation information (direction vector points at CP5) but lacks the state-machine behavior needed to execute the maneuver.

## Takeaways

1. **U-turns are out of reach for stateless feedforward networks at this training budget on this project.** Whether they're reachable with more budget is untested but unlikely — the apex-reach curve saturated by gen 50, suggesting the GA finds the accessible policies quickly and then stalls.
2. **The remaining promising levers for lap completion are architectural or geometric, not reward-engineering:**
   - **Recurrent/stateful NN** (LSTM/GRU cell in the hidden layer). Major lift — `network.js` would need a hidden-state cache per Car instance and the NN class would need a fundamentally different forward pass. Would let the brain represent "I'm in post-apex mode, execute U-turn" as a hidden-state variable.
   - **Reverse lap direction** (trivial geometric fix — reorder CP cycle so the car never needs a U-turn). Changes the problem definition but produces laps directly.
   - **Multi-track curriculum** (Rect → Hex → Pentagon → Tri) — earlier tracks teach reversible navigation skills gradually. Most code-invasive.
3. **P8 joins track-curriculum family as another failure** alongside P3 — but for a completely different mechanistic reason than P3. P3 fragmented existing gradient; P8 tried to install new gradient where the motor skill wasn't representable. Both fail on Triangle but the PROOFs document distinct lessons.
4. **P7 data point is durable and valuable** even though not a code change: cold-training ≫ Rect-seeding on Triangle. This changes the protocol for future Triangle experiments — default to cold, not seeded. Updated `project_triangle_asymmetry` memory reflects this.

## Code state

Fully reverted by `git checkout AI-Car-Racer/trackPresets.js`. Triangle restored to 4-CP layout. No schema bumps, no archive wipes, no other file changes.

## Closing the Triangle-apex thread

After 8 experiments (P1 shipped, P2/P3/P4 reverted, P5 shipped, P6 reverted, P7 data-only, P8 reverted), the session's contribution is:
- **Apex reach is solved** for cold training (94% of gens) with P5 architecture.
- **Lap completion is not solved** and requires architectural (RNN) or geometric (reverse direction) change to crack.
- **Reward engineering is dead** on Triangle — all 5 attempts across F1, F1', P2, P3, P8 failed with mechanistic explanations.
