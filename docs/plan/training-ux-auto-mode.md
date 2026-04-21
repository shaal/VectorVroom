# Training UX — presets, auto-mode, and guardrails

Shipped so far (as of 2026-04-21):

- Slider cap: `batchSize` max lowered from 10 000 → 2 000 (above that is
  stress-test territory where `simSpeed` can't scale — see hitch handoff).
- Stagger revert in `car.js`: restored perception-only stride so 5× is no
  longer *slower* per-car than 2× at high N.
- Preset row: 🌱 Fresh / 🏎️ Grind / ✨ Polish. `applyTrainingPreset(name)`
  in `buttonResponse.js` sets N / simSpeed / seconds / mutateValue via
  the same setters the sliders use, then reflects the values in the DOM
  so the user sees what changed.

Preset values (as shipped):

| Preset | N | simSpeed | seconds | mutate | purpose |
|---|---:|---:|---:|---:|---|
| Fresh  |  500 |  2× | 10 | 0.30 | random brains → "the car can turn" |
| Grind  |  500 | 20× | 15 | 0.20 | elite finishes laps → grind lap time |
| Polish | 1000 |  2× | 25 | 0.05 | competent brain → refine |

Rationale for the numbers is in the conversation transcript of 2026-04-21;
short version: N=500 is where step cost stays ≪ 20 ms tick budget so
simSpeed actually scales; stride schedule (`sim-worker.js:176`) kicks in
above 2×, so 2× is the last "honest fitness" speed; 0.30 is the existing
slider max for exploration; 0.05 is small enough to refine without
shattering a good elite.

---

## Option 2 — Auto mode (next up)

A `🤖 Auto Train` toggle. When on, main.js watches `bestCar` fitness
across generations and advances phases automatically:

1. Start in **Fresh**.
2. When any car reaches ≥1 checkpoint → switch to **Grind**.
3. When the elite completes ≥1 full lap → switch to **Polish**.
4. If fitness is flat for N generations in Polish → bounce back to
   **Grind** to escape a plateau (N≈20 is a reasonable first guess;
   tune after watching).

Implementation sketch:

- State lives on `window.__autoTrain = { on: bool, phase: 'fresh'|'grind'|'polish', flatGens: int, lastBest: number }`.
- Hook into `performNextBatch(genData)` in `main.js` — it already runs
  once per generation and has the fitness in `genData` (`fitness`,
  `laps`, `checkPointsCount`).
- When `on`, after reading `genData.fitness`:
  - if `phase === 'fresh'` and `genData.checkPointsCount >= 1`: call
    `applyTrainingPreset('grind')`, update state.
  - else if `phase === 'grind'` and `genData.laps >= 1`: `polish`.
  - else if `phase === 'polish'` and fitness didn't improve for
    `flatGens ≥ 20`: `grind` (reset `flatGens`).
- Visual: a small `🔒` icon next to each of the four sliders while auto
  is on, so the user knows why the values keep moving. Dragging a
  slider manually flips auto off (user intent wins).

Trade-off awareness:
- Auto mode hides the mechanism. Keep presets visible + clickable so
  the user can see each transition land on a concrete preset, which
  also teaches what the knobs do.
- Don't make auto the default. It's an opt-in for users who don't want
  to learn the knobs.

Estimated effort: half a day. Gated on someone actually running the
presets end-to-end a few times first so we learn whether the
transition thresholds (1 checkpoint, 1 lap, 20 flat gens) are right.

---

## Option 3 — Tooltips / guardrail warnings

Low-priority complement to either option above. Candidates:

- If user drags `batchSize > 1500`, show inline hint: "above ~1500 cars,
  simSpeed stops scaling — try Polish preset or lower N."
- If user picks `simSpeed > 2×` during a run where fitness is still
  `< 1 checkpoint`: hint that stride=3 adds noise and suggest Fresh
  preset.
- If `mutateValue > 0.2` *and* elite is completing laps: hint that
  variance this high will shatter the elite at polish time.

None of these are urgent; all are "teach-by-doing" affordances. Do
after auto mode lands so we don't double-build the same warnings.

---

## Open questions (still not decided)

1. **Should presets force a `restartBatch()`?** Currently they only
   update values; the next generation picks them up naturally. Users
   might expect an immediate visual reset, especially when moving from
   Fresh (messy) to Polish (focused). Probably *no* by default — the
   current gen finishing avoids throwing away training signal — but
   add a "restart now" variant if users ask.
2. **Track-aware preset values?** Monaco chicanes might deserve longer
   `seconds` and lower starting `mutateValue` than Oval. Defer; ship
   one universal set first and see if complaints land.
3. **What happens when auto mode disagrees with ruvector seeding?**
   With Vector Memory on, the initial population is seeded from past
   good brains on similar tracks, not random. Fresh preset assumes
   exploration but the population might already be half-competent.
   Auto mode might want to skip Fresh entirely when ruvector returns
   strong seeds. Punt until we have data from real sessions.

---

## Where the code lives

- `AI-Car-Racer/buttonResponse.js` — `TRAINING_PRESETS` + `applyTrainingPreset(name)`.
- `AI-Car-Racer/utils.js` — preset button row in phase-4 panel HTML.
- `AI-Car-Racer/sim-worker.js:176` — `computeStride()` is where the
  simSpeed→stride schedule lives; preset "Fresh" and "Polish" both pin
  simSpeed=2 to stay under the stride-1 threshold.
