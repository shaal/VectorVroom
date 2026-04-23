# P2 — Wall-proximity penalty scaled by speed, attempted and reverted

**Date:** 2026-04-23
**Status:** attempted, regressed on user's goal metrics, reverted. P1 state preserved (commit 4095083).
**Parent:** P1 ray-count bump (`../p1-raycount/PLAN.md`).
**Family:** reward-shape (joins F1, F1' in the documented-failed family on Triangle).

## What was tried

After P1 showed that the 7-ray perception change was a marginal positive on
Triangle but left wall-bumps flat across training (capability-without-gradient),
the next lever tested was adding a *gradient* for wall-avoidance — a
per-frame fitness penalty that scales with both wall-proximity and speed:

```
// sim-worker.js additions (reverted)
const WALL_PROX_ALPHA = 0.002;               // tried 0.002 and 0.008
const WALL_PROX_DEATH_PENALTY = 0.25;        // spike on damage transition

// in stepOnce, per car, per frame:
if (!car.damaged && car.sensor && car.sensor.readings){
    const closeness = max(1 - offset) over all 7 rays;
    const speedNorm = abs(car.speed) / car.maxSpeed;
    car.wallProxPenalty += closeness * speedNorm * WALL_PROX_ALPHA;
}
if (transitioned-to-damaged) car.wallProxPenalty += WALL_PROX_DEATH_PENALTY;

// fitness formula at all 4 call sites:
fitness = checkPointsCount + laps * cpLen - wallProxPenalty;
```

Design intent: fast-near-wall loses fitness, slow-near-wall or fast-in-open-
corridor loses nothing. A brain that actually uses the P1 lidar information
for anticipation should rank higher than one that ignores it and plows
straight. The death-penalty spike was added on the first iteration to fix
an asymmetry where reckless-early-death accumulated *less* total penalty
than careful-end-of-gen.

The scaling math intentionally kept max-per-gen penalty (≈1.8 at α=0.002,
≈7.2 at α=0.008) below checkpoint increments, to let primary fitness
dominate while the penalty refined within-tier selection.

## Why it failed

Two α values tested on the standard batchSize=500, simSpeed=100 protocol
(Rect cold 30 gens → Tri Rect-seeded 50 gens):

| Metric | P1-only baseline | P2 α=0.002 | P2 α=0.008 |
|---|---|---|---|
| Rect bestLaps (gen 29) | 1 | 1 ✓ | 1 ✓ |
| Rect bestLapMin (s) | 10.7 | 14.4 | 13.4 |
| **Tri apex-reach (CP4 = 2/50 gens)** | **4%** | **4%** | **2%** |
| Tri laps ever | 0 | 0 | 0 |
| **Tri wall-deaths /gen, first10 → last10** | 284 → 274 | **350 → 346** | **290 → 295** |
| Tri population survival / gen | ~226 | 154 | ~191 |

Rect laps held across both α values; the slower lap times are consistent with
the caution-pressure working as designed. But on Triangle P2 was a clear
regression:

- **α=0.002** — too weak to change policy but strong enough to add noise
  to elite selection. Wall-deaths jumped ~25% vs baseline, survival
  dropped ~30%, apex-reach unchanged.
- **α=0.008** — produced a visible degenerate solution in the browser:
  bestCar *stops entirely at CP2*, all 7 lidar rays drawn but no movement.
  The GA discovered the trivial escape ("speed=0 → penalty=0")
  rather than the intended skill ("slow near walls, fast in open").

## Mechanism

Classic reward-shaping pathology. Penalize "fast near wall" → the optimizer
finds "always slow" as a zero-penalty policy. The checkpoint signal is too
sparse on Triangle (4 CPs, apex 1500px from spawn) to counterbalance the
stop-at-safe-distance local optimum. The brain has no incentive to risk
pushing further when the immediate-reward of zero-penalty is guaranteed by
braking.

This is the inverse of F1/F1' which rewarded *forward speed* — both reward-
shape extremes lose to the actual goal. The problem isn't the sign of the
gradient, it's that reward-shape changes on Triangle's geometry have
pathological local optima in either direction.

## Takeaways for future experiments

1. **Reward-shape family remains blacklisted on Triangle.** P2 joins F1,
   F1' as a documented failure. The project_triangle_asymmetry memory
   entry should consider the reward-shape family a non-starter until a
   fundamentally new mechanism is identified.
2. **Per-frame penalties without a counter-reward breed "stopping"**. Any
   future shaping attempt on this project must pair with a per-frame
   *progress reward* (something along the lines of "sim_time alive beyond
   last CP" or "distance traveled forward"), OR use a tie-breaker-only
   design with a hard upper bound — but F1' already proved the latter
   regresses Tri through the archive feedback loop.
3. **Death-penalty alone might be worth trying later.** α=0 + keep the
   WALL_PROX_DEATH_PENALTY constant would give a "crashing costs fitness"
   signal without the "stopping helps" gradient. Not run this session
   (confidence budget exhausted after α=0.002 and α=0.008 iterations).
4. **Lower-maxSpeed, cold-Tri, and larger-NN remain the untried
   non-shaping levers** after P1, P2, P3. The "denser reward signal"
   family (P3) also failed for a different reason — see
   `../p3-checkpoint-curriculum/PROOF.md`.

## Code state

Fully reverted by `git checkout AI-Car-Racer/sim-worker.js`. No schema bump
occurred (P2 only changed the fitness function, not network topology or
weight shape), so no archive wipe or rollback needed. Brains trained during
the P2 benchmark sessions are still in IDB but carry no special metadata;
they will age out via normal archive churn.
