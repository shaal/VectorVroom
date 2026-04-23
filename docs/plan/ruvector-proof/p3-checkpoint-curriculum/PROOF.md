# P3 — Denser checkpoint curriculum on Triangle, attempted and reverted

**Date:** 2026-04-23
**Status:** attempted, regressed Triangle apex reach, reverted.
**Parent:** P1 ray-count bump (`../p1-raycount/PLAN.md`); follow-up to the
reverted P2 reward-shape attempt (`../p2-wall-proximity/PROOF.md`).
**Family:** track-curriculum — first experiment in this family, now the
first documented failure.

## What was tried

After the P2 reward-shape failure, the hypothesis was that Triangle's 4-CP
layout had two brutal single-step transitions (CP2→CP3 ≈ 1500px diagonal
at the top-right corner; CP3→CP4 the apex narrowing) forcing the brain to
execute large policy swings with no intermediate reward. The proposed fix
was *granularity-not-shape*: keep the reward function identical, just add
3 intermediate checkpoints to split those transitions into smaller pieces.

`trackPresets.js` Triangle checkPointListEditor grew from 4 → 7 gates:

| # | Position | Status |
|---|---|---|
| 1 | right-low (spawn) | kept |
| 2 | right-top | kept |
| 3 | **top-right slope @ x=2100** | **P3 NEW** |
| 4 | top-middle @ x=1500 | kept (was CP3) |
| 5 | **apex approach top @ x=900** | **P3 NEW** |
| 6 | apex tip (left) | kept (was CP4) |
| 7 | **apex exit bottom @ x=900** | **P3 NEW** |

Gates placed as line segments spanning the inner-to-outer corridor with
~40px safety overshoot at each end. Corridor-edge y-values derived from
triangle line equations (upper slope ≈ -0.220 outer / -0.211 inner;
lower symmetric).

Brain topology unchanged `[10, 8, 4]`. No schema bump. Rectangle preset
untouched. Direction-to-next-CP features in `car.js` (A1') automatically
flowed the new gates into the brain's input signal.

## Why it failed

Single run, batchSize=500, simSpeed=100, Rect cold 30 gens → Tri
Rect-seeded 50 gens. Comparing track positions 1:1 (not CP indices, since
those are differently numbered):

| Track position | P1-only (4 CPs) | P3 (7 CPs) |
|---|---|---|
| Rect — all CPs, 1 lap | ✓ (10.7s lap) | ✓ |
| Tri — top-middle position | 8% of gens (4/50) | **4% (2/50)** |
| Tri — **apex tip position** | **4% (2/50)** | **0% (0/50)** |
| Tri — wall-deaths/gen | 284 → 274 | 308 → 309 (flat) |
| Tri — population survival /gen | ~226 | ~191 |

**Apex-tip reach regressed from 4% → 0%**. The best car in any of 50
generations under P3 never reached the apex tip — whereas 2/50 gens did
under the sparser P1-only baseline. On the user's stated goal of
"complete Triangle," P3 was worse.

The `maxCpEver = 5` in the 7-CP run superficially looked like "progress
past P1's max=4," but CP5 in the 7-CP layout is the NEW intermediate
"apex approach top" gate, *short of* the apex tip. When CP positions are
matched fairly, P3 didn't get any brain as deep into the apex region as
P1-only did.

## Mechanism

Classic dense-reward local optimum. Adding a reward near-but-not-at the
apex gave the brain a *safer* target — reach CP5 and rest — that
outranked the risky "push through to CP6" policy in within-tier
selection. The old sparse layout enforced "no partial credit"; the new
layout offered partial credit for a policy that parks at the intermediate
CP.

This is the *opposite* of how potential-based reward shaping is supposed
to work in theory (optimal policy should be preserved under a potential
function). The hypothesis that motivated P3 — "the brain's direction-to-
next-CP vector pivots too sharply at sparse CPs" — was backward. The
brain doesn't need smaller pivots; it needs a longer commitment horizon
that the current [10, 8, 4] NN probably doesn't have the capacity for,
OR the archive/selection machinery needs to more strongly reward the
rarer full-traversal brains over the common partial-credit ones.

## Takeaways for future experiments

1. **Track-curriculum family now also documented as failed on Triangle.**
   Joins reward-shape (F1, F1', P2). The "add intermediate CPs to smooth
   the apex transition" idea is ruled out — more CPs don't smooth the
   gradient, they fragment the policy target.
2. **The brain can satisfy fitness at the easiest-available CP.** Any
   future curriculum design for this project must ensure that hitting
   an intermediate CP doesn't dominate the fitness budget over continuing
   to the next one — e.g. make intermediate CPs contribute a fraction
   of a checkpoint (0.3 each, say) so 3 intermediates ≈ 1 integer tier.
3. **The sparse-CP "all or nothing" gradient was actually doing useful
   work** — selecting only for brains that committed to the full
   traversal. Denser rewards lowered the bar and got weaker policies.
4. **Remaining untried non-shaping/non-curriculum levers** after P1
   shipped + P2 reverted + P3 reverted:
   - Lower maxSpeed 15→10 (physics — stopping distance ≤ sensor range)
   - Cold-train Triangle from scratch (escape Rect policy local optimum)
   - Larger NN hidden layer (capacity for slow+steer in narrow corridors)

## Code state

Fully reverted by `git checkout AI-Car-Racer/trackPresets.js`. No schema
bump occurred. localStorage may still hold the 7-CP Triangle for any
user who called `loadTrackPreset('Triangle')` during the P3 session;
calling `loadTrackPreset('Triangle')` again after the revert restores
the canonical 4-CP layout.
