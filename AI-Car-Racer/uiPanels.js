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
  };

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
      last.dynamicsCount === dynamicsCount
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
    renderDynamics(info);
    renderBadge(trackVec, seeds);
    renderList(seeds, info || { ready: false, brains: 0 });

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
    };
  }

  // Initial paint so the panel isn't blank before the bridge finishes loading.
  tick();
  setInterval(tick, REFRESH_MS);
})();
