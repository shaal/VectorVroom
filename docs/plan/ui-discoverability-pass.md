# UI discoverability pass for the RuLake-inspired features

Plan date: 2026-04-24. Follows the RuLake-inspired feature roadmap
(see `docs/plan/rulake-inspired-features.md`) and addresses the
single largest UX weakness of that work: **three features ship with
zero UI and are discoverable only by knowing a URL flag.**

This is a focused pass, not a multi-phase roadmap — one consolidated
PR, ~250 lines of change concentrated in `uiPanels.js` plus small
edits to `main.js` and `style.css`.

## Status tracker

**Legend:** ⬜ todo · 🟡 in progress · ✅ done · 🚫 blocked · ⏸ deferred

**Current focus:** Implementation complete; pending PR #2 review/merge.
**Last updated:** 2026-04-24

| Status | ID | Task | Owner | PR/SHA | Done date |
|:--:|:--:|------|-------|--------|-----------|
| ✅ | A.1 | Add `🧪 Experiments` disclosure panel scaffold | Claude | PR #2 | 2026-04-24 |
| ✅ | A.2 | Migrate Federation checkbox into the panel | Claude | PR #2 | 2026-04-24 |
| ✅ | A.3 | Migrate Consistency modes radio row into the panel | Claude | PR #2 | 2026-04-24 |
| ✅ | A.4 | Migrate Observability panel toggle into the panel | Claude | PR #2 | 2026-04-24 |
| ✅ | A.5 | Un-gate Snapshot / share row (remove `?snapshots=1` requirement for UI render) | Claude | PR #2 | 2026-04-24 |
| ✅ | A.6 | Un-gate Cross-tab row (remove `?crosstab=1` requirement for UI render) | Claude | PR #2 | 2026-04-24 |
| ✅ | A.7 | Add disabled Quantization row with tooltip | Claude | PR #2 | 2026-04-24 |
| ✅ | A.8 | Add `confirm()` on destructive Import action | Claude | PR #2 | 2026-04-24 |
| ✅ | A.9 | `[Learn]` links next to each row → open matching ELI15 chapter | Claude | PR #2 | 2026-04-24 |
| ✅ | A.10 | Smoke-test via agent-browser + commit | Claude | PR #2 | 2026-04-24 |

**Follow-up: brain saves (B.* below) shipped on the same branch (PR #2):**

| Status | ID | Task | Owner | PR/SHA | Done date |
|:--:|:--:|------|-------|--------|-----------|
| ✅ | B.1 | Brain-saves handlers in buttonResponse.js (Save / Load / Delete / Start Fresh + dropdown enumerate) | Claude | PR #2 | 2026-04-24 |
| ✅ | B.2 | Brain-saves UI block in utils.js (`<details id='brainSaves'>` + dropdown + 4 buttons) | Claude | PR #2 | 2026-04-24 |
| ✅ | B.3 | Smoke harness `tests/brain-saves-smoke.html` (6/6 PASS) + agent-browser validate | Claude | PR #2 | 2026-04-24 |

The B.* row delivers a multi-slot named-save system on top of the existing
single-slot Save Best+Restart / Restore Old Brain pair. Storage: localStorage
keys `vv_brainsave_<name>`. Load reuses the existing seeding pathway
(write to `localStorage.bestBrain` + `restartBatch()`). Start Fresh reuses
`bridge._debugReset()` + clears legacy keys + reloads — but **preserves
named saves** so the user's curated slots survive a reset. The 🌱 Start
button is amber-tinted to visually distinguish it from the cheaper Reset
Brain button.

**Implementation notes:**
- Refactor strategy was **wrap-don't-rebuild**: the existing consistency, federation, and crosstab DOM nodes are appended into the disclosure body via `appendChild`, which preserves every event listener and `el.X` reference established earlier in the file. No event re-binding required.
- Disclosure auto-opens whenever ANY URL flag is set (`?snapshots=1`, `?crosstab=1`, `?federation=1`, `?consistency=*`, `?archive=*`) so a user opening a share link immediately sees what's enabled.
- Crosstab listeners are now wired unconditionally (previously gated by `?crosstab=1`); the experiments toggle drives `setCrosstabEnabled` rather than render-time gating.
- Smoke harness uses two hidden iframes — one no-flag, one `?snapshots=1` — to test default state AND preset behaviour in a single page.
- 7/7 harness PASS including the cross-feature claim that toggling the crosstab checkbox flips the bridge's `isCrosstabEnabled()` from false to true (proves UI-to-bridge coupling, not just visual).

**Exit gate:** all rows ✅ + agent-browser smoke:
- default URL: Experiments panel visible (collapsed), no behaviour change vs pre-pass;
- expanding the panel shows 6 rows (snapshots, crosstab, federation, consistency, observability, quantization-disabled);
- each `[Learn]` link opens the right chapter;
- URL flags still work as presets (checkbox/radio pre-selected).

---

## What's wrong today

Summary of current state (post RuLake roadmap, commit `ee2dd34`):

| Feature | UI today | Problem |
|---------|----------|---------|
| Warm-restart Export / Import (F3) | Hidden — requires `?snapshots=1` to render at all | A user can train for an hour and not know they can save it |
| Shareable archive URL + gallery (F3/3C) | Hidden — requires `?snapshots=1` | Can't share what you can't see |
| Cross-tab live training (F6) | Hidden — requires `?crosstab=1` | The two-tab demo is delightful but completely undiscoverable |
| Federation (F2) | Visible checkbox in training panel | ✅ Already correct — flag is a preset, not a gate |
| Consistency modes (F4) | Visible radio row in training panel | ✅ Already correct |
| Observability panel (F7) | Visible collapsed panel below training UI | ✅ Already correct (telemetry-only) |
| 1-bit quantization (F1) | No UI — library-only | Invisible to users; chapter references nothing clickable |

The pattern the three correct ones use is: **URL flag presets the initial state of a UI control that is always visible.** The three wrong ones gate the UI itself on the flag — no flag = no UI = no discoverability.

## What this pass does

### Design call: a single `🧪 Experiments` disclosure panel

Rather than scatter five more toggle rows across the existing training panel (which is already dense), consolidate all feature toggles into one collapsible disclosure panel near the bottom of the training UI. Collapsed by default to keep the first-impression UI clean; expanded by one click when the user wants to explore.

Shape (inside the panel, when expanded):

```
🧪 Experiments ▼
  [Each row: toggle · emoji + label · one-line hint · (Learn →)]

  ☐ 📦 Save & share archives            (Learn →)
     Export your archive, import a shared one.
  ☐ 🔗 Cross-tab live training          (Learn →)
     Open two tabs — brains travel between them.
  ☐ 🌐 Federated search                 (Learn →)
     Union Euclidean + Hyperbolic nearest-neighbours.
  🔘 Consistency: (•) Fresh  ( ) Eventual  ( ) Frozen   (Learn →)
     How retrieval sees the archive as it grows.
  ☑ ⏱ Per-stage timings panel           (Learn →)
     Flame-graph-lite for each generation.
  ☐ 📐 1-bit quantized archive (library-only; not wired yet)  (Learn →)
     [disabled — tooltip: "Module ships but is not wired to archiveBrain yet"]
```

### Default state per feature

| Feature | Default | Rationale |
|---------|---------|-----------|
| Snapshots / share | **OFF** | Adds file I/O + optional network fetches; opt-in semantically |
| Cross-tab | **OFF** | Adds BroadcastChannel traffic + per-tab peer discovery |
| Federation | **OFF** | Behaviour change (dual-index union) |
| Consistency | **Fresh** | Zero behaviour delta vs pre-pass |
| Observability | **ON** | Telemetry-only; already default-on today |
| Quantization | **DISABLED** | Library-only; no backing integration |

Preserves the rule: plain URL → plain behaviour.

### URL flags keep working as presets

Every existing flag (`?snapshots=1`, `?consistency=frozen`, `?federation=1`, `?crosstab=1`, `?archive=<url>`) continues to work, but now it presets the initial state of the corresponding UI control instead of gating whether the control renders. Shareable demo links unchanged.

### Destructive-action guardrail

Enabling **📦 Save & share archives** reveals the Export / Import / Share buttons. Clicking *Import* currently replaces the live archive without confirmation (previously OK because `?snapshots=1` was the friction; with the UI unhidden, that friction is gone). Add a `confirm()` on Import: *"This will replace your current N brains with the imported archive. Continue?"* The confirmation is the missing friction.

### `[Learn]` links

Each row's *Learn* link invokes `window.ELI15.openChapter(id)` with the matching chapter id. Turns the panel into a self-teaching surface — clicking *Learn* on federation opens the federation chapter, which has a live formula and a *"Try it yourself"* section that now points to the toggle one tap away in the panel.

---

## Files touched (scope-bounded)

Expected diff, ~250 lines:

- `AI-Car-Racer/uiPanels.js` — bulk of the work. Create `mountExperimentsPanel()` that renders the disclosure section. Move/refactor existing Federation + Consistency + Observability rows into it. Un-gate the Snapshots row (currently behind `if (usp.get('snapshots') === '1')`) and the Cross-tab row (currently behind `if (usp.get('crosstab') === '1')`). Anchored clearly so future edits don't collide.
- `AI-Car-Racer/style.css` — styles for `.rv-experiments-panel` (disclosure + row + learn link + disabled row).
- `AI-Car-Racer/main.js` — minor change: the URL-flag appliers currently call `setConsistencyMode()` / `setFederationEnabled()` / `setCrosstabEnabled()` regardless of UI state. Ensure each one also updates the UI control so the checkbox/radio reflects the actual bridge state after the preset applies. Small bug-fix-sized edits.
- `tests/experiments-panel-smoke.html` (new) — standalone harness:
  1. Load the main page, wait for panel scaffold.
  2. Assert the disclosure starts collapsed.
  3. Click disclosure; assert 6 rows visible.
  4. Click *Learn* on a row; assert the ELI15 drawer opens with the right chapter.
  5. Click a toggle; assert the corresponding bridge getter reports the new state.
  6. Set `?snapshots=1` in URL; assert the Snapshots row is pre-toggled ON at boot.
  Prints PASS/FAIL per claim.

## Files NOT touched

- None of the feature modules (`archive/`, `consistency/`, `quantization/`, `federation/`, `crosstab/`, `observability/`, `share/`, `lineage/`). This is pure UI plumbing over the existing APIs.
- `ruvectorBridge.js` — no new exports; consumes existing setters/getters only.
- Any existing ELI15 chapter body — the pass only touches the ordering + the way the panel links to chapters, not the content.

## Exit criteria (the `/ship-task` gate)

1. Default URL: Experiments panel appears collapsed; plain behaviour unchanged (every feature matches pre-pass default).
2. Expanding the panel shows 6 rows in the order above.
3. Every `[Learn]` link opens the correct ELI15 chapter via `window.ELI15.openChapter(id)`.
4. Toggling each row changes the bridge state (verified via `window.__rvBridge` getters — isFederationEnabled, isCrosstabEnabled, getConsistencyMode, etc.).
5. URL flags still work as presets — at boot, every flag that was set pre-selects its UI control.
6. Import button shows a `confirm()` that mentions the live archive count.
7. Quantization row renders disabled with a tooltip explaining the limitation.
8. `tests/experiments-panel-smoke.html` PASS on all 6 claims.
9. No new console errors at boot.

## Trade-offs I'm making

- **Visual simplicity over rich custom widgets.** Using the native `<details>` element + native checkboxes/radios rather than custom animated components. Ships faster, reads better for learners, one fewer thing to style.
- **One panel over five separate UI sections.** Alternative is to put each feature's toggle in-context (e.g. cross-tab pill always visible next to the fps counter). Rejected because the main training panel is already dense — a single disclosure absorbs the new surface area in one place a user can choose to ignore or explore.
- **No default-on flips.** I explicitly do NOT turn on Federation, Cross-tab, Snapshots, or Quantization by default, even though they're stable. Keeps the change a UX pass, not a behaviour change — if later we want "Federation default-on," that's a separate call backed by recall-vs-latency evidence per the cross-track-variance memory.

## What this is NOT

- Not a rewrite of any feature module.
- Not a redesign of the training panel.
- Not integrating quantization into the archive (that's a separate future slice).
- Not adding new URL flags.
- Not publishing any real archive URL to the community gallery (still gated by external-scope approval).
