// uiPanels.js — renders the vector-memory panel into #rv-panel.
//
// Data sources (all globals owned by other files):
//   window.__rvBridge      — sidecar-exposed ruvectorBridge (see index.html)
//   window.currentTrackVec — Float32Array(512) set by buttonResponse.js on phase=3
//   window.currentSeedIds  — ids of brains seeded into the current batch (main.js)
//   phase                  — 0..4 game phase (main.js / buttonResponse.js)
//   rvDisabled             — true when URL has ?rv=0 (main.js)
//
// The panel is polled at REFRESH_MS and re-renders only when the inputs change.
// It never mutates bridge state; recommendSeeds() is a pure read.

(function () {
  const REFRESH_MS = 500;
  const BADGE_K = 10; // matches main.js begin()'s recommendSeeds k

  const root = document.getElementById('rv-panel');
  if (!root) {
    console.warn('[rv-panel] #rv-panel not found — skipping init');
    return;
  }

  root.innerHTML = [
    '<div class="rv-header">',
    '  <span class="rv-title">Vector Memory',
    // ELI15 badge — clicking opens the framing chapter. Placed in the panel
    // title so it's discoverable without hunting. Per-widget badges below
    // point at the specific chapter for that row.
    '    <span data-eli15="what-is-this-project" role="button" tabindex="0" aria-label="Learn: what is this project doing?"></span>',
    '  </span>',
    // rv-info is the brains/tracks/obs line — it's populated by VectorDB
    // counts, so the HNSW chapter is the right anchor. A neighbouring
    // cnn-embedder badge gives learners a jumping-off point for the "tracks"
    // half of that line.
    '  <span class="rv-info" data-rv="info"></span>',
    '  <span data-eli15="vectordb-hnsw" role="button" tabindex="0" aria-label="Learn: nearest-neighbour search via HNSW"></span>',
    '  <span data-eli15="cnn-embedder" role="button" tabindex="0" aria-label="Learn: CNN track embedder"></span>',
    '</div>',
    // The reranker line, when visible, gets a badge pointing at the EMA chapter.
    // The badge is a sibling of reranker text in the same line.
    '<div class="rv-reranker" data-rv="reranker" hidden>',
    '  <span data-rv="reranker-text"></span>',
    '  <span data-eli15="ema-reranker" role="button" tabindex="0" aria-label="Learn: EMA reranker"></span>',
    '</div>',
    // The similarity-% banner (shown when a warm-start retrieval lands) →
    // track-similarity chapter.
    '<div class="rv-badge-row">',
    '  <div class="rv-badge" data-rv="badge" hidden></div>',
    '  <span class="rv-badge-eli15" data-eli15="track-similarity" role="button" tabindex="0" aria-label="Learn: track similarity warm-start" hidden></span>',
    '</div>',
    '<div class="rv-list-title">Seeded from archive',
    // The lineage sparkline sits on every row; the list-title badge is the
    // discoverable entry point for the lineage concept.
    '  <span data-eli15="lineage" role="button" tabindex="0" aria-label="Learn: brain lineage"></span>',
    '</div>',
    '<div class="rv-reranker-mode" data-rv="reranker-mode" hidden>',
    '  <span class="rv-reranker-mode-label">reranker:</span>',
    '  <span class="rv-reranker-mode-value" data-rv="reranker-mode-value">—</span>',
    // ELI15 badge — clicking opens the GNN chapter with the message-passing
    // explanation. Placed beside the value so the question-mark reads as
    // "why is it gnn vs ema?".
    '  <span data-eli15="gnn" role="button" tabindex="0" aria-label="Learn: how the GNN reranker works"></span>',
    '</div>',
    // Track adapter (P1.B). Hidden until the LoRA wasm reports ready. The
    // sparkline shows the L2 distance between the most-recent raw and
    // adapted track vector — a visual cue for "how much is the adapter
    // bending the embedding right now".
    '<div class="rv-lora" data-rv="lora" hidden>',
    '  <span class="rv-lora-label">track adapter:</span>',
    '  <span class="rv-lora-drift" data-rv="lora-drift">drift —</span>',
    '  <span class="rv-spark" data-rv="lora-spark"></span>',
    '  <span data-eli15="lora" role="button" tabindex="0" aria-label="Learn: track-vector adapter (LoRA)"></span>',
    '</div>',
    // SONA stats row (P2.A). Hidden until SONA wasm boots. Shows the four
    // headline numbers the plan calls out: in-flight/complete trajectories,
    // reasoning-bank patterns extracted, micro-update count, EWC λ (the
    // anti-catastrophic-forgetting regulariser strength). Each concept has
    // its own ELI15 chapter badge.
    '<div class="rv-sona" data-rv="sona" hidden>',
    '  <span class="rv-sona-label">SONA:</span>',
    '  <span class="rv-sona-stats" data-rv="sona-stats">—</span>',
    '  <span data-eli15="sona-trajectory" role="button" tabindex="0" aria-label="Learn: SONA trajectories"></span>',
    '  <span data-eli15="reasoningbank" role="button" tabindex="0" aria-label="Learn: ReasoningBank patterns"></span>',
    '  <span data-eli15="ewc" role="button" tabindex="0" aria-label="Learn: EWC++ anti-forgetting"></span>',
    '</div>',
    // Similar circuits (P2.A). Top-k ReasoningBank clusters matched against
    // the current trackVec, each row showing avg quality + member count.
    // Hidden until at least one pattern is stored.
    '<div class="rv-circuits" data-rv="circuits" hidden>',
    '  <div class="rv-circuits-title">Similar circuits',
    '    <span data-eli15="reasoningbank" role="button" tabindex="0" aria-label="Learn: similar circuits come from ReasoningBank clustering"></span>',
    '  </div>',
    '  <div class="rv-circuits-list" data-rv="circuits-list"></div>',
    '</div>',
    // P4.A — A/B toggle strip. Four segmented controls let a learner feel
    // the contribution of each layer in isolation: reranker / track adapter
    // / dynamics / index. Each control has an ELI15 badge that opens the
    // responsible chapter, and the currently-selected option is echoed back
    // from bridge.info().policy so manual console calls or a tour advance
    // repaint the control automatically.
    '<div class="rv-abstrip" data-rv="abstrip" hidden>',
    '  <div class="rv-abstrip-title">A/B toggles',
    '    <span class="rv-abstrip-hint">feel each layer by flipping it off</span>',
    '  </div>',
    '  <div class="rv-abrow">',
    '    <span class="rv-ablabel">reranker</span>',
    '    <div class="rv-abseg" role="radiogroup" aria-label="Reranker mode" data-rv="ab-reranker">',
    '      <button type="button" class="rv-abbtn" data-rv="ab-reranker-opt" data-value="auto" role="radio" aria-checked="false">auto</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-reranker-opt" data-value="none" role="radio" aria-checked="false">none</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-reranker-opt" data-value="ema" role="radio" aria-checked="false">ema</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-reranker-opt" data-value="gnn" role="radio" aria-checked="false">gnn</button>',
    '    </div>',
    '    <span data-eli15="ema-reranker" role="button" tabindex="0" aria-label="Learn: reranker modes"></span>',
    '    <span data-eli15="gnn" role="button" tabindex="0" aria-label="Learn: GNN reranker"></span>',
    '  </div>',
    '  <div class="rv-abrow">',
    '    <span class="rv-ablabel">track adapter</span>',
    '    <div class="rv-abseg" role="radiogroup" aria-label="Track adapter mode" data-rv="ab-adapter">',
    '      <button type="button" class="rv-abbtn" data-rv="ab-adapter-opt" data-value="off" role="radio" aria-checked="false">off</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-adapter-opt" data-value="micro-lora" role="radio" aria-checked="false">micro-lora</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-adapter-opt" data-value="sona" role="radio" aria-checked="false">sona</button>',
    '    </div>',
    '    <span data-eli15="lora" role="button" tabindex="0" aria-label="Learn: LoRA track adapter"></span>',
    '    <span data-eli15="sona-trajectory" role="button" tabindex="0" aria-label="Learn: SONA trajectory adapter"></span>',
    '  </div>',
    '  <div class="rv-abrow">',
    '    <span class="rv-ablabel">dynamics key</span>',
    '    <div class="rv-abseg" role="radiogroup" aria-label="Dynamics key" data-rv="ab-dynamics">',
    '      <button type="button" class="rv-abbtn" data-rv="ab-dynamics-opt" data-value="off" role="radio" aria-checked="false">off</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-dynamics-opt" data-value="on" role="radio" aria-checked="false">on</button>',
    '    </div>',
    '    <span data-eli15="dynamics-embedding" role="button" tabindex="0" aria-label="Learn: dynamics embedding"></span>',
    '  </div>',
    '  <div class="rv-abrow">',
    '    <span class="rv-ablabel">index</span>',
    '    <div class="rv-abseg" role="radiogroup" aria-label="Vector index geometry" data-rv="ab-index">',
    '      <button type="button" class="rv-abbtn" data-rv="ab-index-opt" data-value="euclidean" role="radio" aria-checked="true">euclidean</button>',
    '      <button type="button" class="rv-abbtn" data-rv="ab-index-opt" data-value="hyperbolic" role="radio" aria-checked="false" title="Swap to Poincaré-ball HNSW (P3.A)">hyperbolic</button>',
    '    </div>',
    '    <span data-eli15="hyperbolic-space" role="button" tabindex="0" aria-label="Learn: hyperbolic HNSW — why trees fit better on a saddle"></span>',
    '  </div>',
    '</div>',
    // Dynamics trajectory toggle (P1.C). Off by default — the plan keeps
    // this opt-in because it changes retrieval ordering. The count next to
    // the label shows how many archived brains have a dynamics vector
    // attached; pre-P1.C archives show 0 until a new generation is archived.
    '<div class="rv-dynamics" data-rv="dynamics">',
    '  <label class="rv-dynamics-label">',
    '    <input type="checkbox" data-rv="dynamics-toggle" />',
    '    dynamics key:',
    '    <span class="rv-dynamics-status" data-rv="dynamics-status">off</span>',
    '  </label>',
    '  <span data-eli15="dynamics-embedding" role="button" tabindex="0" aria-label="Learn: dynamics trajectory embedding"></span>',
    '</div>',
    '<div class="rv-list" data-rv="list"></div>',
    // P3.B — lineage DAG viewer. Collapsed by default so the panel doesn't
    // get taller for users who never open it; expanding switches the section
    // from `hidden` → `visible` and triggers the first render via the tick
    // loop. The `🌳` is intentional — the section is literally a family tree.
    '<div class="rv-lineage" data-rv="lineage" hidden>',
    '  <div class="rv-lineage-header">',
    '    <button type="button" class="rv-lineage-toggle" data-rv="lineage-toggle" aria-expanded="false">🌳 Lineage DAG ▸</button>',
    '    <span class="rv-lineage-status" data-rv="lineage-status">—</span>',
    '    <span data-eli15="lineage-dag" role="button" tabindex="0" aria-label="Learn: lineage as a DAG"></span>',
    '  </div>',
    '  <div class="rv-lineage-body" data-rv="lineage-body" hidden>',
    '    <canvas class="rv-lineage-canvas" data-rv="lineage-canvas"></canvas>',
    '    <div class="rv-lineage-tooltip" data-rv="lineage-tooltip" hidden></div>',
    '  </div>',
    '</div>',
  ].join('');

  const el = {
    info: root.querySelector('[data-rv="info"]'),
    rerankerMode: root.querySelector('[data-rv="reranker-mode"]'),
    rerankerModeValue: root.querySelector('[data-rv="reranker-mode-value"]'),
    reranker: root.querySelector('[data-rv="reranker"]'),
    rerankerText: root.querySelector('[data-rv="reranker-text"]'),
    badge: root.querySelector('[data-rv="badge"]'),
    badgeEli15: root.querySelector('.rv-badge-eli15'),
    list: root.querySelector('[data-rv="list"]'),
    lora: root.querySelector('[data-rv="lora"]'),
    loraDrift: root.querySelector('[data-rv="lora-drift"]'),
    loraSpark: root.querySelector('[data-rv="lora-spark"]'),
    dynamics: root.querySelector('[data-rv="dynamics"]'),
    dynamicsToggle: root.querySelector('[data-rv="dynamics-toggle"]'),
    dynamicsStatus: root.querySelector('[data-rv="dynamics-status"]'),
    sona: root.querySelector('[data-rv="sona"]'),
    sonaStats: root.querySelector('[data-rv="sona-stats"]'),
    circuits: root.querySelector('[data-rv="circuits"]'),
    circuitsList: root.querySelector('[data-rv="circuits-list"]'),
    lineage: root.querySelector('[data-rv="lineage"]'),
    lineageToggle: root.querySelector('[data-rv="lineage-toggle"]'),
    lineageStatus: root.querySelector('[data-rv="lineage-status"]'),
    lineageBody: root.querySelector('[data-rv="lineage-body"]'),
    lineageCanvas: root.querySelector('[data-rv="lineage-canvas"]'),
    lineageTooltip: root.querySelector('[data-rv="lineage-tooltip"]'),
    abstrip: root.querySelector('[data-rv="abstrip"]'),
    abRerankerBtns: root.querySelectorAll('[data-rv="ab-reranker-opt"]'),
    abAdapterBtns: root.querySelectorAll('[data-rv="ab-adapter-opt"]'),
    abDynamicsBtns: root.querySelectorAll('[data-rv="ab-dynamics-opt"]'),
    abIndexBtns: root.querySelectorAll('[data-rv="ab-index-opt"]'),
  };

  // P3.B — mount the lineage viewer once; rendering is driven from tick().
  // We don't *expand* the section by default — the DAG costs a real layout
  // pass, and the panel has plenty of other rows. The expand toggle below
  // makes expanding a one-click action. Mounting is cheap (just attaches
  // listeners) so we do it unconditionally.
  let lineageExpanded = false;
  if (el.lineageCanvas && window.LineageViewer) {
    window.LineageViewer.mount({
      canvas: el.lineageCanvas,
      statusEl: el.lineageStatus,
      tooltipEl: el.lineageTooltip,
    });
  }
  if (el.lineageToggle) {
    el.lineageToggle.addEventListener('click', function () {
      lineageExpanded = !lineageExpanded;
      el.lineageToggle.setAttribute('aria-expanded', String(lineageExpanded));
      el.lineageToggle.textContent = lineageExpanded ? '🌳 Lineage DAG ▾' : '🌳 Lineage DAG ▸';
      if (el.lineageBody) el.lineageBody.hidden = !lineageExpanded;
      if (lineageExpanded && window.LineageViewer) window.LineageViewer.render();
    });
  }

  // P4.A — A/B toggle strip wiring. Each segmented control calls through to
  // the bridge setter; rendering is handled by renderAbstrip on the next tick
  // (reads the round-tripped policy from info()).
  function attachAbGroup(nodeList, setter, afterChange) {
    nodeList.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const value = btn.getAttribute('data-value');
        const b = window.__rvBridge;
        if (!b || typeof b[setter] !== 'function') return;
        try { b[setter](value); } catch (e) { console.warn('[rv-panel] ' + setter + ' failed', e); }
        if (afterChange) afterChange(value);
        // Force renderAbstrip next tick.
        last.rerankerPolicy = null;
        last.adapterPolicy = null;
        last.dynamicsPolicy = null;
        last.indexPolicy = null;
      });
    });
  }
  attachAbGroup(el.abRerankerBtns, 'setRerankerMode');
  attachAbGroup(el.abAdapterBtns, 'setAdapterMode');
  // Dynamics is a boolean on the bridge — wrap the setter so the A/B strip
  // can pass 'on'|'off' like the other groups.
  el.abDynamicsBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const on = btn.getAttribute('data-value') === 'on';
      const b = window.__rvBridge;
      if (b && typeof b.setUseDynamics === 'function') b.setUseDynamics(on);
      if (el.dynamicsToggle) el.dynamicsToggle.checked = on;
      last.dynamicsPolicy = null;
      last.dynamicsEnabled = !on; // invalidate existing dynamics-row memo
    });
  });
  // P3.A — both euclidean and hyperbolic are live. setIndexKind rebuilds the
  // three stores in-place from the mirrors (no IDB round-trip), so flipping
  // the toggle is instant. When the hyperbolic wasm hasn't loaded yet,
  // setIndexKind returns false and we leave the policy as-is; renderAbstrip
  // gates availability on info.policy.hyperbolicLoaded so the button shows
  // its unavailable affordance instead of a silent no-op.
  el.abIndexBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      const value = btn.getAttribute('data-value');
      const b = window.__rvBridge;
      if (b && typeof b.setIndexKind === 'function') {
        try { b.setIndexKind(value); }
        catch (e) { console.warn('[rv-panel] setIndexKind failed', e); }
      }
      last.indexPolicy = null;
    });
  });

  // Dynamics toggle wiring (P1.C). The checkbox owns UI state; the bridge
  // stores the flag so recommendSeeds() can read it without a round-trip
  // through the panel. setUseDynamics is missing before the bridge module
  // imports in sidecar resolve, so we gate on typeof.
  if (el.dynamicsToggle) {
    el.dynamicsToggle.addEventListener('change', function () {
      const b = window.__rvBridge;
      if (b && typeof b.setUseDynamics === 'function') {
        b.setUseDynamics(el.dynamicsToggle.checked);
      }
      // Force a repaint on the next tick so the status text flips instantly,
      // without waiting for the 500ms poll. The `last.*` memo entries get
      // overwritten in tick() anyway.
      last.dynamicsEnabled = !el.dynamicsToggle.checked; // invalidate
    });
  }

  // Track-match badge auto-fade (P5.A). When `currentTrackVec` identity changes
  // (a new track was finalised), we restart a one-shot CSS animation that fades
  // in, holds ~4s, then fades out. Memo key is the Float32Array identity, not
  // value — buttonResponse.js allocates a fresh array per finalize, so identity
  // is a free + reliable change signal.
  let badgeShownForTrackId = null;
  el.badge.addEventListener('animationend', function (ev) {
    if (ev.animationName !== 'rv-badge-pulse' && ev.animationName !== 'rv-badge-pulse-flat') return;
    el.badge.classList.remove('rv-badge-showing');
    el.badge.hidden = true;
    if (el.badgeEli15) el.badgeEli15.hidden = true;
  });

  // Render-input memoisation. We hash the cheap identity keys; if nothing moved,
  // we skip the DOM writes entirely. This keeps the 500ms tick free.
  let last = {
    ready: null,
    brains: -1,
    tracks: -1,
    observations: -1,
    observationEvents: -1, // total observe() calls; repeat-obs on same id still ticks this
    phase: -1,
    trackVecId: null, // Float32Array identity, not value
    seedIdsKey: '',
    loraAdapts: -1,
    loraDriftLen: -1, // length of recent-drift array; rises with adapt() calls even before reward()
    dynamicsEnabled: null,
    dynamicsCount: -1,
    sonaReady: null,
    sonaTrajectories: -1,
    sonaPatterns: -1,
    sonaMicroUpdates: -1,
    sonaTrajectoryOpen: null,
    // P4.A — A/B strip memo keys. null forces the strip to repaint on the
    // next tick (e.g. after a click inverts any of these).
    rerankerPolicy: null,
    adapterPolicy: null,
    dynamicsPolicy: null,
    indexPolicy: null,
  };

  // Reranker indicator state (P5.C). Track the previous top-K ordering so we
  // can report "last reranking shifted top-K by M positions" after each
  // observe() call. Non-reranker reshuffles (new-brain archive, new trackVec)
  // refresh the baseline but do NOT overwrite `lastShift` — only a genuine
  // observations-increment counts as a reranker event.
  let rerankState = {
    lastSeedIds: [],
    lastObservationEvents: 0,
    lastShift: null, // null until an observe() tick has a baseline to diff
  };

  function bridgeReadyLocal() {
    if (window.rvDisabled) return false;
    const b = window.__rvBridge;
    return !!(b && b.info && b.info().ready);
  }

  function renderInfo(info) {
    if (window.rvDisabled) {
      el.info.textContent = 'disabled (?rv=0)';
      el.info.className = 'rv-info rv-info-muted';
      return;
    }
    if (!info || !info.ready) {
      el.info.textContent = 'loading…';
      el.info.className = 'rv-info rv-info-muted';
      return;
    }
    el.info.textContent =
      info.brains + ' brain' + (info.brains === 1 ? '' : 's') +
      ' · ' + info.tracks + ' track' + (info.tracks === 1 ? '' : 's') +
      ' · ' + info.observations + ' obs' +
      ' · ' + (info.reranker || (info.gnn ? 'gnn' : 'ema'));
    el.info.className = 'rv-info';
  }

  // Spearman's footrule over the union of ids. Ids present in only one list
  // are treated as rank K (the first position past the bottom of top-K), so a
  // drop-out from position i contributes K-i and a fresh promotion into
  // position i contributes K-i symmetrically. Items that just reshuffled
  // contribute the absolute difference of their old/new positions.
  function computeRankShift(prev, curr) {
    if (!prev.length && !curr.length) return 0;
    const K = Math.max(prev.length, curr.length);
    const prevIdx = new Map();
    for (let i = 0; i < prev.length; i++) prevIdx.set(prev[i], i);
    const currIdx = new Map();
    for (let i = 0; i < curr.length; i++) currIdx.set(curr[i], i);
    const union = new Set();
    for (const id of prev) union.add(id);
    for (const id of curr) union.add(id);
    let sum = 0;
    for (const id of union) {
      const pi = prevIdx.has(id) ? prevIdx.get(id) : K;
      const ci = currIdx.has(id) ? currIdx.get(id) : K;
      sum += Math.abs(pi - ci);
    }
    return sum;
  }

  function renderRerankerMode(info) {
    // The `reranker: gnn | ema | none` one-liner row. Hidden when the bridge
    // is disabled via ?rv=0 (everything about the bridge is silenced then) or
    // before the first recommendSeeds() call populates info.reranker.
    if (window.rvDisabled) {
      el.rerankerMode.hidden = true;
      return;
    }
    if (!info || !info.ready) {
      el.rerankerMode.hidden = true;
      return;
    }
    const mode = (info.reranker === 'gnn' || info.reranker === 'ema' || info.reranker === 'none')
      ? info.reranker : 'none';
    el.rerankerMode.hidden = false;
    el.rerankerModeValue.textContent = mode;
    el.rerankerModeValue.className = 'rv-reranker-mode-value rv-reranker-mode-' + mode;
  }

  function renderReranker(info) {
    if (window.rvDisabled) {
      el.reranker.hidden = true;
      if (el.rerankerText) el.rerankerText.textContent = '';
      return;
    }
    if (!info || !info.ready) {
      el.reranker.hidden = true;
      return;
    }
    el.reranker.hidden = false;
    const engine = info.gnn ? 'GNN' : 'EMA';
    // Count total observe() calls (grows each generation) for the main metric;
    // the distinct-brain count is shown in parens for transparency.
    const events = (info.observationEvents | 0);
    const distinct = (info.observations | 0);
    if (events === 0) {
      if (el.rerankerText) el.rerankerText.textContent = engine + ' reranker: idle (awaiting first observation)';
      el.reranker.className = 'rv-reranker rv-reranker-muted';
      return;
    }
    const shiftText = rerankState.lastShift === null
      ? '—'
      : (rerankState.lastShift + ' position' + (rerankState.lastShift === 1 ? '' : 's'));
    if (el.rerankerText) el.rerankerText.textContent =
      engine + ' reranker: ' + events + ' observation' + (events === 1 ? '' : 's') +
      ' (' + distinct + ' brain' + (distinct === 1 ? '' : 's') + ')' +
      ' · last shift ' + shiftText;
    el.reranker.className = 'rv-reranker';
  }

  function renderBadge(trackVec, seeds) {
    // Badge appears only at track-finalize or during training (phase 3–4) AND
    // when the archive actually returned something useful. On phase 1–2 or an
    // empty archive we stay hidden so the panel doesn't look broken.
    const currentPhase = typeof window.phase === 'number' ? window.phase : 0;
    const wantBadge = currentPhase >= 3 && trackVec && seeds && seeds.length > 0;
    if (!wantBadge) {
      el.badge.hidden = true;
      el.badge.classList.remove('rv-badge-showing');
      el.badge.textContent = '';
      if (el.badgeEli15) el.badgeEli15.hidden = true;
      badgeShownForTrackId = null;
      return;
    }
    // Only (re)trigger the show-and-fade animation on a genuinely new track.
    // Without this guard, every tick that flips some *other* input (e.g. an
    // `observations` increment) would restart the fade.
    if (badgeShownForTrackId === trackVec) return;
    badgeShownForTrackId = trackVec;

    // trackSim ∈ [-1, 1]; map the best match into a 0–100% "similarity" display.
    const bestSim = seeds[0].trackSim;
    const pct = Math.max(0, Math.min(100, Math.round(50 + 50 * bestSim)));
    el.badge.textContent =
      'This track is ' + pct + '% similar to one you\'ve trained on — ' +
      'loading ' + seeds.length + ' candidate brain' +
      (seeds.length === 1 ? '' : 's') + ' as seeds.';
    el.badge.hidden = false;
    if (el.badgeEli15) el.badgeEli15.hidden = false;

    // Restart the CSS @keyframes from frame 0: remove, force reflow, re-add.
    // Without the reflow, the browser coalesces the remove+add and the
    // animation state never resets.
    el.badge.classList.remove('rv-badge-showing');
    void el.badge.offsetWidth;
    el.badge.classList.add('rv-badge-showing');
  }

  function renderLora(info) {
    if (!el.lora) return;
    if (window.rvDisabled) {
      el.lora.hidden = true;
      return;
    }
    const lora = info && info.lora;
    if (!lora || !lora.ready) {
      el.lora.hidden = true;
      return;
    }
    el.lora.hidden = false;
    // Show drift to 4 d.p. — typical adapted-vector distances start in the
    // 1e-3 range and grow as B accumulates updates. The "·" mid-dot signals
    // "this is metadata", not a primary KPI.
    const driftStr = (Number(lora.drift) || 0).toFixed(4);
    const adapts = lora.adaptCount | 0;
    el.loraDrift.textContent = 'drift ' + driftStr + ' · ' + adapts + ' update' + (adapts === 1 ? '' : 's');
    el.loraSpark.innerHTML = renderDriftSpark(Array.isArray(lora.driftRecent) ? lora.driftRecent : []);
  }

  // Sparkline scaled to its own min/max so a slowly-rising drift reads as
  // "going up" even when absolute magnitudes are tiny. Empty → dash.
  function renderDriftSpark(series) {
    if (!series || series.length === 0) return '<span class="rv-spark-empty">—</span>';
    const W = 40, H = 12, PAD = 1.5;
    const n = series.length;
    if (n === 1) {
      return '<svg class="rv-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
        '<circle cx="' + (W / 2) + '" cy="' + (H / 2) + '" r="1.6" fill="#3a7bd5"></circle></svg>';
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo;
    const usableW = W - 2 * PAD;
    const usableH = H - 2 * PAD;
    const pts = series.map(function (v, idx) {
      const x = PAD + (idx / (n - 1)) * usableW;
      const y = range === 0
        ? PAD + usableH / 2
        : PAD + usableH - ((v - lo) / range) * usableH;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    const last = pts.split(' ').pop().split(',');
    return '<svg class="rv-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="#3a7bd5" stroke-width="1" ' +
      'stroke-linecap="round" stroke-linejoin="round"></polyline>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.3" fill="#1a4f9c"></circle></svg>';
  }

  function renderDynamics(info) {
    if (!el.dynamics) return;
    if (window.rvDisabled) {
      el.dynamics.hidden = true;
      return;
    }
    const d = info && info.dynamics;
    if (!d) {
      el.dynamics.hidden = true;
      return;
    }
    el.dynamics.hidden = false;
    // Keep the checkbox's DOM state in sync with the bridge's flag so a
    // `_debugReset()` or a manual setUseDynamics call from the console is
    // reflected in the UI.
    if (el.dynamicsToggle && el.dynamicsToggle.checked !== !!d.enabled) {
      el.dynamicsToggle.checked = !!d.enabled;
    }
    if (el.dynamicsStatus) {
      if (!d.enabled) {
        el.dynamicsStatus.textContent = 'off';
      } else if ((d.count | 0) === 0) {
        el.dynamicsStatus.textContent = 'on (no trajectories yet — train one generation)';
      } else {
        el.dynamicsStatus.textContent = 'on · ' + d.count + ' trajector' +
          (d.count === 1 ? 'y' : 'ies');
      }
    }
  }

  // P2.A — SONA stats strip. The four plan-mandated numbers live here. We
  // show `traj N (+open)` when a trajectory is currently recording so the
  // user sees begin/end in action without opening devtools. `μup` is the
  // cumulative micro-update count (one per processTask call); it naturally
  // outpaces `traj` because each trajectory replays as multiple micro-updates.
  function renderSona(info) {
    if (!el.sona) return;
    if (window.rvDisabled) { el.sona.hidden = true; return; }
    const s = info && info.sona;
    if (!s || !s.ready) { el.sona.hidden = true; return; }
    el.sona.hidden = false;
    const traj = s.trajectories | 0;
    const pats = s.patterns | 0;
    const mu = s.microUpdates | 0;
    const lam = Number(s.ewcLambda) || 0;
    const openMark = s.trajectoryOpen
      ? ' (+open, ' + (s.trajectorySteps | 0) + ' step' + ((s.trajectorySteps | 0) === 1 ? '' : 's') + ')'
      : '';
    el.sonaStats.textContent =
      'traj ' + traj + openMark +
      ' · patterns ' + pats +
      ' · μup ' + mu +
      ' · λ ' + lam;
  }

  // P2.A — similar circuits list. Each row = one ReasoningBank cluster
  // matched against the current trackVec; we show cosine similarity %,
  // member count and average quality (both read from the cluster object
  // returned by the sona/engine findPatterns() call).
  function renderCircuits(trackVec, info) {
    if (!el.circuits || !el.circuitsList) return;
    if (window.rvDisabled) { el.circuits.hidden = true; return; }
    const bridge = window.__rvBridge;
    const s = info && info.sona;
    // Hide when SONA isn't ready yet, no patterns have been extracted, or we
    // don't have a trackVec to query with — there's nothing useful to show
    // in any of those cases.
    if (!s || !s.ready || !(s.patterns | 0) || !trackVec ||
        !bridge || typeof bridge.findSimilarCircuits !== 'function') {
      el.circuits.hidden = true;
      return;
    }
    let rows = [];
    try { rows = bridge.findSimilarCircuits(trackVec, 5) || []; }
    catch (e) { console.warn('[rv-panel] findSimilarCircuits failed', e); rows = []; }
    if (rows.length === 0) { el.circuits.hidden = true; return; }
    el.circuits.hidden = false;
    const html = rows.map(function (r, i) {
      const sim = (typeof r.sim === 'number') ? r.sim : 0;
      const pct = Math.max(0, Math.min(100, Math.round(50 + 50 * sim)));
      const members = (r.clusterSize | 0);
      const q = (typeof r.avgQuality === 'number') ? r.avgQuality.toFixed(2) : '—';
      return [
        '<div class="rv-circuit-row">',
        '  <span class="rv-rank">#', (i + 1), '</span>',
        '  <span class="rv-sim">', pct, '%</span>',
        '  <span class="rv-circuit-members" title="cluster size">', members, ' member', (members === 1 ? '' : 's'), '</span>',
        '  <span class="rv-circuit-quality" title="average quality within cluster">q ', q, '</span>',
        '</div>',
      ].join('');
    }).join('');
    el.circuitsList.innerHTML = html;
  }

  // P4.A — paint the A/B toggle strip. Reads policy from info() so manual
  // console calls (e.g. `window.__rvBridge.setRerankerMode('none')`) are
  // reflected in the UI without the click handler having to mirror state.
  function renderAbstrip(info) {
    if (!el.abstrip) return;
    if (window.rvDisabled) { el.abstrip.hidden = true; return; }
    if (!info || !info.ready) { el.abstrip.hidden = true; return; }
    el.abstrip.hidden = false;
    const pol = info.policy || {};
    const reranker = pol.reranker || 'auto';
    const adapter = pol.adapter || 'sona';
    const dynamicsOn = !!pol.dynamics;
    const indexKind = pol.index || 'euclidean';
    paintSegment(el.abRerankerBtns, reranker);
    paintSegment(el.abAdapterBtns, adapter);
    paintSegment(el.abDynamicsBtns, dynamicsOn ? 'on' : 'off');
    paintSegment(el.abIndexBtns, indexKind);
    // Gray out the GNN option when the wasm hasn't loaded — clicking it
    // still flips the policy, but recommendSeeds will fall back to EMA and
    // the user would see no reranker actually fire. The title attribute
    // explains why.
    const gnnLoaded = !!info.gnnLoaded;
    el.abRerankerBtns.forEach(function (btn) {
      if (btn.getAttribute('data-value') === 'gnn') {
        btn.classList.toggle('rv-abbtn-unavailable', !gnnLoaded);
        btn.title = gnnLoaded ? '' : 'GNN wasm did not load — this option falls back to EMA';
      }
    });
    // Sona availability mirror: if sonaReady is false, mark the sona adapter
    // option as unavailable (setAdapterMode still accepts it but step
    // recording will no-op).
    const sonaReadyFlag = info.sona && info.sona.ready;
    el.abAdapterBtns.forEach(function (btn) {
      if (btn.getAttribute('data-value') === 'sona') {
        btn.classList.toggle('rv-abbtn-unavailable', !sonaReadyFlag);
        btn.title = sonaReadyFlag ? '' : 'SONA wasm did not load — micro-lora behaviour will be used';
      }
    });
    // P3.A — hyperbolic availability mirror. setIndexKind refuses to flip
    // when the wasm isn't loaded, so we surface that upfront instead of
    // letting the click silently no-op.
    const hbLoaded = !!pol.hyperbolicLoaded;
    el.abIndexBtns.forEach(function (btn) {
      if (btn.getAttribute('data-value') === 'hyperbolic') {
        btn.disabled = !hbLoaded;
        btn.classList.toggle('rv-abbtn-unavailable', !hbLoaded);
        btn.title = hbLoaded
          ? 'Swap to Poincaré-ball HNSW (P3.A)'
          : 'Hyperbolic wasm did not load — staying on euclidean';
      }
    });
  }

  function paintSegment(btnList, selectedValue) {
    btnList.forEach(function (btn) {
      const isSelected = btn.getAttribute('data-value') === selectedValue;
      btn.classList.toggle('rv-abbtn-active', isSelected);
      btn.setAttribute('aria-checked', String(isSelected));
    });
  }

  function renderLineage(info) {
    if (!el.lineage) return;
    if (window.rvDisabled) { el.lineage.hidden = true; return; }
    const dag = info && info.lineageDag;
    // We show the header whenever the bridge is ready, even if the DAG
    // wasm failed to load — that way the user sees "lineage DAG: unavailable"
    // instead of silently hiding the feature. Only fully-hidden case is a
    // not-ready bridge (loading) or rv=0.
    if (!info || !info.ready) { el.lineage.hidden = true; return; }
    el.lineage.hidden = false;
    if (!dag || !dag.ready) {
      if (el.lineageStatus) el.lineageStatus.textContent = 'DAG wasm unavailable — falling back to legacy walker.';
      if (el.lineageBody) el.lineageBody.hidden = true;
      if (el.lineageToggle) { el.lineageToggle.disabled = true; el.lineageToggle.style.opacity = '0.5'; }
      return;
    }
    if (el.lineageToggle) { el.lineageToggle.disabled = false; el.lineageToggle.style.opacity = ''; }
    // Only render the canvas when the section is actually expanded — keeps
    // the default-collapsed path free.
    if (lineageExpanded && window.LineageViewer) {
      try { window.LineageViewer.render(); }
      catch (e) { console.warn('[rv-panel] lineage render failed', e); }
    } else if (el.lineageStatus) {
      // Still update the header status so the user sees archive size growing
      // even when the body is collapsed. This mirrors the info row behaviour.
      el.lineageStatus.textContent = (dag.nodeCount | 0) + ' node' +
        (dag.nodeCount === 1 ? '' : 's') + ' · ' + (dag.edgeCount | 0) + ' edge' +
        (dag.edgeCount === 1 ? '' : 's');
    }
  }

  function renderList(seeds, info) {
    if (window.rvDisabled) {
      el.list.innerHTML = '<div class="rv-empty">Bridge disabled via ?rv=0 — archive not consulted this session.</div>';
      return;
    }
    if (!info || !info.ready) {
      el.list.innerHTML = '<div class="rv-empty">bridge not ready</div>';
      return;
    }
    if (!seeds || seeds.length === 0) {
      if (info.brains === 0) {
        el.list.innerHTML = '<div class="rv-empty">No past brains yet — train once to populate the archive.</div>';
      } else {
        el.list.innerHTML = '<div class="rv-empty">No retrievals for the current track.</div>';
      }
      return;
    }
    const bridge = window.__rvBridge;
    const rows = seeds.map(function (s, i) {
      const m = s.meta || {};
      const fit = (typeof m.fitness === 'number') ? m.fitness.toFixed(1) : '—';
      const gen = (typeof m.generation === 'number') ? m.generation : '—';
      const parents = Array.isArray(m.parentIds) ? m.parentIds.length : 0;
      const simPct = Math.max(0, Math.min(100, Math.round(50 + 50 * (s.trackSim || 0))));
      const lap = (typeof m.fastestLap === 'number' && isFinite(m.fastestLap))
        ? m.fastestLap.toFixed(2) + 's' : '—';
      const lineage = (bridge && typeof bridge.getLineage === 'function')
        ? (bridge.getLineage(s.id, 6) || []) : [];
      const sparkline = renderSparkline(lineage);
      return [
        '<div class="rv-item">',
        '  <div class="rv-item-top">',
        '    <span class="rv-rank">#', (i + 1), '</span>',
        '    <span class="rv-id" title="', escapeAttr(s.id), '">', escapeHtml(s.id), '</span>',
        '    <span class="rv-sim">', simPct, '%</span>',
        '    <span class="rv-fit" title="fitness">fit ', fit, '</span>',
        '    <span class="rv-lap" title="fastest lap for this archived brain">', lap, '</span>',
        '    <span class="rv-gen" title="generation">g', gen, '</span>',
        '    <span class="rv-parents" title="parent seed count">p', parents, '</span>',
        '  </div>',
        '  <div class="rv-item-bottom">',
        '    <span class="rv-spark-label">lineage</span>',
        '    <span class="rv-spark" title="lineage fitness (oldest → newest, best-fit parent)">', sparkline, '</span>',
        '  </div>',
        '</div>',
      ].join('');
    }).join('');
    el.list.innerHTML = rows;
  }

  // Tiny SVG sparkline of lineage fitness. Input is oldest→newest (getLineage
  // order). Empty → placeholder dash so the grid column stays populated.
  function renderSparkline(lineage) {
    if (!lineage || lineage.length === 0) {
      return '<span class="rv-spark-empty">—</span>';
    }
    const W = 40, H = 12, PAD = 1.5;
    const n = lineage.length;
    if (n === 1) {
      const cx = W / 2, cy = H / 2;
      return '<svg class="rv-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="1.6" fill="#d38b4b"></circle></svg>';
    }
    const vals = lineage.map(function (p) { return p.fitness; });
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] < lo) lo = vals[i];
      if (vals[i] > hi) hi = vals[i];
    }
    const range = hi - lo;
    const usableW = W - 2 * PAD;
    const usableH = H - 2 * PAD;
    const pts = vals.map(function (v, idx) {
      const x = PAD + (n === 1 ? 0 : (idx / (n - 1)) * usableW);
      // Flat lineage (all equal) pins to mid-height; otherwise invert so higher fitness is up.
      const y = range === 0
        ? PAD + usableH / 2
        : PAD + usableH - ((v - lo) / range) * usableH;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    // Emphasise the terminal (newest/current) point with a marker.
    const last = pts.split(' ').pop().split(',');
    return '<svg class="rv-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="#d38b4b" stroke-width="1" ' +
      'stroke-linecap="round" stroke-linejoin="round"></polyline>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.3" fill="#824006"></circle></svg>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function tick() {
    const ready = bridgeReadyLocal();
    let info = null;
    if (ready) {
      try { info = window.__rvBridge.info(); } catch (_) { info = null; }
    }

    const trackVec = (window.currentTrackVec instanceof Float32Array) ? window.currentTrackVec : null;
    const currentPhase = typeof window.phase === 'number' ? window.phase : 0;
    const seedIdsKey = Array.isArray(window.currentSeedIds) ? window.currentSeedIds.join(',') : '';

    const loraAdapts = (info && info.lora) ? (info.lora.adaptCount | 0) : -1;
    const loraDriftLen = (info && info.lora && Array.isArray(info.lora.driftRecent))
      ? info.lora.driftRecent.length : -1;
    const dynamicsEnabled = info && info.dynamics ? !!info.dynamics.enabled : null;
    const dynamicsCount = info && info.dynamics ? (info.dynamics.count | 0) : -1;
    const sonaReadyFlag = info && info.sona ? !!info.sona.ready : null;
    const sonaTrajectories = info && info.sona ? (info.sona.trajectories | 0) : -1;
    const sonaPatterns = info && info.sona ? (info.sona.patterns | 0) : -1;
    const sonaMicroUpdates = info && info.sona ? (info.sona.microUpdates | 0) : -1;
    const sonaTrajectoryOpen = info && info.sona ? !!info.sona.trajectoryOpen : null;
    const policy = info && info.policy ? info.policy : null;
    const rerankerPolicy = policy ? policy.reranker : null;
    const adapterPolicy = policy ? policy.adapter : null;
    const dynamicsPolicy = policy ? !!policy.dynamics : null;
    const indexPolicy = policy ? policy.index : null;

    // Fast-path: nothing changed → no DOM writes, no recommendSeeds call.
    if (
      last.ready === ready &&
      info &&
      last.brains === info.brains &&
      last.tracks === info.tracks &&
      last.observations === info.observations &&
      last.observationEvents === (info.observationEvents | 0) &&
      last.phase === currentPhase &&
      last.trackVecId === trackVec &&
      last.seedIdsKey === seedIdsKey &&
      last.loraAdapts === loraAdapts &&
      last.loraDriftLen === loraDriftLen &&
      last.dynamicsEnabled === dynamicsEnabled &&
      last.dynamicsCount === dynamicsCount &&
      last.sonaReady === sonaReadyFlag &&
      last.sonaTrajectories === sonaTrajectories &&
      last.sonaPatterns === sonaPatterns &&
      last.sonaMicroUpdates === sonaMicroUpdates &&
      last.sonaTrajectoryOpen === sonaTrajectoryOpen &&
      last.rerankerPolicy === rerankerPolicy &&
      last.adapterPolicy === adapterPolicy &&
      last.dynamicsPolicy === dynamicsPolicy &&
      last.indexPolicy === indexPolicy
    ) return;

    // Stage the current dynamics query vector so recommendSeeds can mix it
    // in when the toggle is on. queryVector() returns null when no frames
    // have been captured yet (pre-phase-4 or first load), which the bridge
    // interprets as "no dynamics signal available this tick" and silently
    // drops the term for the upcoming call.
    if (ready && window.__rvDynamics && typeof window.__rvBridge.setQueryDynamicsVec === 'function') {
      try {
        window.__rvBridge.setQueryDynamicsVec(window.__rvDynamics.queryVector());
      } catch (_) { /* best-effort */ }
    }

    // Recompute seeds for the badge/list. recommendSeeds is cheap (in-memory
    // cosine over a few hundred entries), and only runs when one of the
    // above inputs has moved.
    let seeds = [];
    if (ready && info && info.brains > 0) {
      try {
        seeds = window.__rvBridge.recommendSeeds(trackVec, BADGE_K) || [];
      } catch (e) {
        console.warn('[rv-panel] recommendSeeds failed', e);
        seeds = [];
      }
    }

    // Reranker diff (P5.C). When the observation-event count rises, compare
    // the new top-K ordering against the snapshot captured on the previous
    // re-render; that magnitude is the "last shift". We always refresh the
    // baseline seedIds so non-reranker reshuffles (trackVec/phase/new-brain)
    // don't pollute the next real shift measurement. Keying on *events*
    // instead of *distinct brains* catches repeat observes on the same id
    // — those still rerun EMA and can reshuffle the top-K.
    if (info && info.ready) {
      const seedIdsArr = seeds.map(function (s) { return s.id; });
      const eventsNow = info.observationEvents | 0;
      if (eventsNow > rerankState.lastObservationEvents && rerankState.lastSeedIds.length > 0) {
        rerankState.lastShift = computeRankShift(rerankState.lastSeedIds, seedIdsArr);
      }
      rerankState.lastSeedIds = seedIdsArr;
      rerankState.lastObservationEvents = eventsNow;
    }

    renderInfo(info);
    renderRerankerMode(info);
    renderReranker(info);
    renderLora(info);
    renderSona(info);
    renderCircuits(trackVec, info);
    renderDynamics(info);
    renderAbstrip(info);
    renderBadge(trackVec, seeds);
    renderList(seeds, info || { ready: false, brains: 0 });
    renderLineage(info);

    last = {
      ready: ready,
      brains: info ? info.brains : -1,
      tracks: info ? info.tracks : -1,
      observations: info ? info.observations : -1,
      observationEvents: info ? (info.observationEvents | 0) : -1,
      phase: currentPhase,
      trackVecId: trackVec,
      seedIdsKey: seedIdsKey,
      loraAdapts: loraAdapts,
      loraDriftLen: loraDriftLen,
      dynamicsEnabled: dynamicsEnabled,
      dynamicsCount: dynamicsCount,
      sonaReady: sonaReadyFlag,
      sonaTrajectories: sonaTrajectories,
      sonaPatterns: sonaPatterns,
      sonaMicroUpdates: sonaMicroUpdates,
      sonaTrajectoryOpen: sonaTrajectoryOpen,
      rerankerPolicy: rerankerPolicy,
      adapterPolicy: adapterPolicy,
      dynamicsPolicy: dynamicsPolicy,
      indexPolicy: indexPolicy,
    };
  }

  // Initial paint so the panel isn't blank before the bridge finishes loading.
  tick();
  setInterval(tick, REFRESH_MS);
})();
