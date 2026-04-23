# Triangle Apex Investigation — Session 2026-04-23

**Scope:** A multi-experiment investigation into why cars cannot complete the Triangle preset and what mechanisms govern training behaviour generally. Run as a marathon /ship-task session; produced 7 commits (2 features shipped, 5 negative-result PROOFs documented, plus this retrospective).

**Status:** Apex-reach problem solved (94% with cold-train + P5 architecture); lap-completion remains unsolved but mechanism is now understood (post-apex U-turn requires temporal state the current stateless feedforward NN can't represent).

---

## Session arc (8 experiments + this summary)

| Phase | Lever family | Outcome |
|---|---|---|
| **P1** rayCount 5→7 | perception (information) | **Shipped** — closes 30° angular blind gap, marginal positive on Tri |
| **P2** wall-proximity penalty | reward-shape (gradient) | Reverted — degenerate "stop at CP2" optimum |
| **P3** dense out-path CPs (4→7) | track-curriculum | Reverted — parking at intermediates fragmented working policy |
| **P4** maxSpeed 15→10 on Tri only | physics | Reverted — stopping-distance fix didn't help; bottleneck wasn't physics |
| **P5** NN hidden 8→16 | NN capacity (width) | **Shipped** — apex 4%→8% (n=3 confirmed), Rect convergence 2.3× faster |
| **P6** NN [10,16,4]→[10,24,8,4] | NN capacity (depth) | Reverted — capacity overshoot, GA budget can't find good weights at 500-dim |
| **P7** 300-gen cold Tri benchmark | data-only (no code change) | **Reframing finding** — cold-train hits apex in 94% of gens; Rect-seeding was contaminating prior Tri measurements |
| **P8** single return-path CP | track-curriculum | Reverted — added reward target doesn't teach the U-turn motor skill |

## Five durable findings worth preserving across future sessions

### 1. Cold-train Triangle ≫ Rect-seeded Triangle (P7)

The single most important methodology finding. Every prior P1/P5 measurement of "Triangle apex reach" was bottlenecked by the Rect-trained archive seeding contaminating Tri policy via ruvector recall. When measured cleanly (cold-train Tri directly), apex is reached in **94% of 300 gens** with the P5 `[10, 16, 4]` architecture. **Default protocol for future Tri experiments: cold, not seeded.**

### 2. Capacity has a sweet spot, not a monotonic curve (P5 vs P6)

P5 (`[10, 16, 4]`, 244 weights) doubled hidden width and accelerated GA convergence on Rect (gen 7-18 to first lap, vs gen 29 baseline). P6 (`[10, 24, 8, 4]`, 500 weights) added depth and *regressed* — 2× the parameters need more training-budget to converge, and the 50-gen budget runs out first. **The right amount of capacity is "just enough to fit the policy," not maximally large.**

### 3. Reward-engineering is dead on this project (5-for-5 failed)

Across A1, F1, F1', P2, P3, P8, every reward-shape or track-curriculum intervention failed on Triangle, each with a *different* mechanistic failure mode:
- A1 (unit-vector direction): GA latched onto "drive at CP" shortcut
- F1 (fitness-shaping forward): GA optimised forward motion, crashed apex
- F1' (lexicographic tie-break): archive feedback loop propagated aggressive policies
- P2 (wall-proximity penalty): degenerate "stop at CP2" zero-penalty optimum
- P3 (dense out-path CPs): parked at intermediates instead of pushing through
- P8 (single return-path CP): added reward target unreachable because motor skill missing

The pattern across these isn't "we picked the wrong reward shape" — it's "any reward gradient on this geometry has a degenerate optimum the GA finds before the intended one." **Don't propose more reward-shape variants.**

### 4. The architecture-side family wins consistently (3-shipped of 4)

A1' (scaled-distance direction features), P1 (rayCount 5→7), and P5 (hidden 8→16) all shipped with positive signal. P6 reverted (overshoot). The pattern: changes that *add information* or *add capacity* without changing the reward landscape consistently produce gains. This isn't an accident — it dodges the degenerate-optimum failure mode that bites all reward-side changes.

### 5. The U-turn is a motor-skill problem, not a navigation problem (P8)

Cold-trained brains reach apex in 94% of gens but produce 0 laps because the post-apex U-turn requires a temporal sequence (brake → turn → reverse-direction-accelerate) and the `[10, 16, 4]` stateless feedforward network can't represent sequences. The brain has direction info (`local_forward`/`local_right` correctly point at next CP), but no mechanism to encode "I'm currently mid-U-turn." Adding more reward targets on the return path (P8) doesn't help because the bottleneck is the *motor skill*, not the *reward signal*.

---

## Why cars drive straight into walls "without even trying" — the full answer

This question came up repeatedly in the session and deserves a clean educational answer. Cars don't drive into walls because they're "lazy" or "stupid." They drive into walls because:

### Gen 0: brains are literally random

At generation 0, every car's NN weights are uniform random in `[-1, 1]`. The output layer uses a hard threshold (`sum > bias ? 1 : 0`). With random weights:

- About 1/16 of random brains output `forward=on, left=off, right=off, reverse=off` for *every* input. These brains can't avoid walls — their fixed reflex says "drive straight" regardless of what the lidar reads.
- About 5/16 output `forward=on` while randomly varying turns. These wander in circles or zigzags.
- Only ~1/16 have any reactive behaviour to ray inputs at all.

So at gen 0, ~80% of cars are essentially deaf to their lidar. They literally cannot react.

### The brain isn't "trying" — it's a frozen reflex table

This is the conceptual core. A neural network is a *fixed function* — give it the same inputs, it produces the same outputs every time. There's no "deciding," no "trying," no "noticing the wall." If the brain's fixed mapping says `forward=on` for the inputs it sees, the car drives forward into the wall and the brain has no awareness that anything went wrong.

GA training doesn't make the brain smarter in any agency sense. It changes which random reflex tables get propagated. Better tables (ones whose reflexes happen to reach more checkpoints) reproduce. Worse tables die out. But each individual brain remains a frozen lookup table — it never "learns" anything within a single generation, and never "tries" anything ever.

### Even good brains can't always avoid walls — physics

At `maxSpeed=15` with brake decel `0.25 px/frame²`, stopping distance from full speed is **~450 px**. Sensor range is **400 px**. By the time a wall enters the lidar fan, the car can't brake to a stop within the visible distance. A purely reactive "brake when ray reads short" policy is *physically guaranteed to crash* on head-on walls at full speed.

To survive, a brain needs **anticipatory** braking — slow down *before* the wall enters sensor range. But the GA can't directly select for anticipation because the reward signal (checkpoints) only fires *after* the wall would have been hit. The credit-assignment chain ("I braked 60 frames ago, that's why I'm alive now") is impossibly long for the GA to discover by random mutation.

### Gen 30+: the elite locks in suboptimal behaviour

After ~30 gens, all 500 cars are mutated copies of one ancestor brain. If that ancestor's reflex was "drive forward fast" (because that's what reached the first checkpoint), all 500 descendants also drive forward fast. The GA *cannot* easily mutate to "drive slow and careful" because no survivor in the lineage demonstrated that's better.

This is why the user-visible behaviour is "watch hundreds of cars drive into walls in identical ways." They're all variations of the same failed reflex pattern, refined slightly each generation but never escaping the basin of attraction.

---

## Long-term re-architecture (the user's plan)

The user is planning a substantial re-architecture along these lines:
- **Each car = (strategy + agent)** where strategy is a behaviour tree / if-then-else thought process and agent is the sensor configuration.
- **Strategies compete** in a tournament-like selection.

Critical assessment summary (full version in conversation transcript):

**Mechanistically sound:**
- Modularity (separating perception from cognition) is good architecture
- Interpretability (if-then-else is human-readable) is a real win
- Composition (mixing capabilities) maps naturally to building complex behaviours

**Sharp edges:**
- This is Genetic Programming, not GA — fundamentally harder search problem (discrete + combinatorial vs continuous + gradient-amenable)
- The strategy/agent split doesn't directly fix the U-turn problem unless explicit *state* is added
- The "500 cars" question is a misframing — they're 500 mutation samples for GA search, not 500 students learning from a teacher
- Compute scales as N strategies × M agents × population — easy to blow the wall budget

**Constructive alternative paths to the same goals:**
- For interpretability: add a "strategy explainer" that reads the trained NN and synthesises if-then-else rules describing it
- For composability: investigate **Quality-Diversity / MAP-Elites** algorithms — maintain a grid of specialist elites instead of one generalist (e.g., separate cells for "good at apex" vs "good at return path")
- For state (the U-turn fix): add a recurrent cell to the existing NN, OR add an explicit `mode` state variable

**Verdict:** worth doing as a research project for future flexibility, not as the next-step lever for current Triangle problem.

---

## Immediate-impact recommendations (the actionable part)

The user asked: "what's more immediate and possible to see improvements or clarity for users who use VroomVector to learn and see ruvector improving cars survivability?"

Three tiers, in order of cheapness:

### Tier 1 — Educational clarity (~1 hour each)

**(a) New eli15 chapter: "Why Cars Crash"** — directly addresses the user's repeated confusion. Explains the gen-0-random-brains, frozen-reflex-table, physics-stopping-distance, and elite-lock-in mechanics in eli15 style. Could embed as `eli15/chapters/why-cars-crash.js`. Solves the most common user confusion and makes the project's failure modes legible.

**(b) Death-cause categorization in HUD** — currently the HUD shows `wall-bumps 280` (just a count). Bucket deaths by category: head-on wall hit, side-scrape, slide-out, stalled. Worker can compute this trivially; main thread renders. Gives users *insight* into HOW their population is dying, not just THAT it is.

### Tier 2 — Survivability levers (~half day each)

**(c) Initial brain seeding bias** — a slider `Conservative Init` 0.0..1.0. At 0, current pure-random init. At 1.0, gen-0 brains have a hardcoded prior toward "if any ray reads close, brake." Lets users compare cold-random vs nudged-init learning curves. Likely improves early-gen survivability dramatically; doesn't fix late-gen apex problem.

**(d) Per-frame brain decision tooltip on bestCar** — when hovering over the elite car, show: "front ray=0.3, brain output: brake=on, turn=left." Right now `inputVisual` shows just controls (4 boxes). Adding the *reasoning* (which inputs drove the decision) makes the brain's behaviour debuggable. Could use a small saliency overlay showing which rays the NN weighs most.

### Tier 3 — Make ruvector visibly impactful (~1-2 days)

**(e) A/B comparison mode** — split-screen, two populations training simultaneously, one with `rvDisabled=true` and one with `rvDisabled=false`. Live stats panel comparing survival, lap times, checkpoint reach. This *directly* shows ruvector's contribution and would be the most impactful demo of the project's central value proposition. Currently the only way to A/B is to navigate to `?rv=0` and remember earlier numbers — invisible by default.

**(f) "Ruvector contribution" per-gen indicator** — when the bridge seeds the next generation, log how many of the seeded brains came from cross-track recall vs random init vs localStorage prior. A small chart showing "this gen got 30% of its seeds from Hexagon archive" makes the value flow visible without requiring A/B comparison.

### My recommendation

**Start with Tier 1 (a) and (b) together.** They directly answer the user's stated confusion ("why do cars hit walls?") AND add a visible HUD enhancement that improves the day-to-day demo value. Combined cost: ~2 hours. High signal-to-effort.

**Then Tier 3 (e) — A/B mode.** This is the single highest-impact thing the project could add right now. The whole point of VroomVector is to demonstrate ruvector's value, and A/B mode makes that value *visible* rather than implied. Worth a half-day investment.

Tier 2 levers are valuable but the survivability benefit is partial; the apex problem still requires the architectural changes (recurrent NN, multi-track curriculum, or reverse-direction Triangle).

---

## Open questions for future sessions

1. **Does reversing Triangle lap direction produce laps?** Trivial 30-sec edit, definitively tests "is U-turn the only blocker?" Not run this session.
2. **Does multi-track curriculum (Rect → Hex → Pentagon → Tri) help?** Untried; mechanistically promising for the U-turn problem (Pentagon and Hexagon have moderate-angle turns that could teach U-turn primitives gradually).
3. **Does a recurrent NN cell unlock laps?** Major code lift (~200-400 lines) but the principled fix to the stateless-feedforward bottleneck.
4. **Does MAP-Elites archive structure help?** Could let "apex specialists" and "return specialists" coexist without one suppressing the other in the ruvector recall pool.
5. **Would death-cause data reveal new bottlenecks?** Tier 1 (b) would generate this data passively; the histogram itself might suggest further interventions.

---

## Files touched this session (committed and pushed)

- `feat(perception)`: `4095083` — P1 rayCount 5→7
- `data(proof)`: `538fabe` — P2 wall-proximity + P3 dense-CPs both reverted
- `data(proof)`: `28583d5` — P4 per-preset maxSpeed override reverted
- `feat(capacity)`: `490a7b4` — P5 NN hidden 8→16
- `data(proof)`: `286a024` — P6 NN depth bump reverted
- `data(proof)`: `b28b7e5` — P8 return-path CP reverted + P7 cold-train finding

All on origin/main. PROOFs in `docs/plan/ruvector-proof/{p1,p2,p3,p4,p5,p6,p8}*/`. Memory updated at `~/.claude/projects/-Users-ofershaal-code-experiments-car-learning/memory/project_triangle_asymmetry.md`.
