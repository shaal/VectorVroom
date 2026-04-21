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
    // title so it's discoverable without hunting. Later phases (P0.B, P1.*)
    // replace this chapter id with topic-specific ones next to the relevant
    // widget (reranker row, adapter drift sparkline, etc.).
    '    <span data-eli15="what-is-this-project" role="button" tabindex="0" aria-label="Learn: what is this project doing?"></span>',
    '  </span>',
    '  <span class="rv-info" data-rv="info"></span>',
    '</div>',
    '<div class="rv-reranker" data-rv="reranker" hidden></div>',
    '<div class="rv-badge" data-rv="badge" hidden></div>',
    '<div class="rv-list-title">Seeded from archive</div>',
    '<div class="rv-list" data-rv="list"></div>',
  ].join('');

  const el = {
    info: root.querySelector('[data-rv="info"]'),
    reranker: root.querySelector('[data-rv="reranker"]'),
    badge: root.querySelector('[data-rv="badge"]'),
    list: root.querySelector('[data-rv="list"]'),
  };

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
      (info.gnn ? ' · gnn' : ' · ema');
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

  function renderReranker(info) {
    if (window.rvDisabled) {
      el.reranker.hidden = true;
      el.reranker.textContent = '';
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
      el.reranker.textContent = engine + ' reranker: idle (awaiting first observation)';
      el.reranker.className = 'rv-reranker rv-reranker-muted';
      return;
    }
    const shiftText = rerankState.lastShift === null
      ? '—'
      : (rerankState.lastShift + ' position' + (rerankState.lastShift === 1 ? '' : 's'));
    el.reranker.textContent =
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

    // Restart the CSS @keyframes from frame 0: remove, force reflow, re-add.
    // Without the reflow, the browser coalesces the remove+add and the
    // animation state never resets.
    el.badge.classList.remove('rv-badge-showing');
    void el.badge.offsetWidth;
    el.badge.classList.add('rv-badge-showing');
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
      last.seedIdsKey === seedIdsKey
    ) return;

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
    renderReranker(info);
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
    };
  }

  // Initial paint so the panel isn't blank before the bridge finishes loading.
  tick();
  setInterval(tick, REFRESH_MS);
})();
