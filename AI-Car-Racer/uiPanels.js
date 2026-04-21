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
    '  <span class="rv-title">Vector Memory</span>',
    '  <span class="rv-info" data-rv="info"></span>',
    '</div>',
    '<div class="rv-badge" data-rv="badge" hidden></div>',
    '<div class="rv-list-title">Seeded from archive</div>',
    '<div class="rv-list" data-rv="list"></div>',
  ].join('');

  const el = {
    info: root.querySelector('[data-rv="info"]'),
    badge: root.querySelector('[data-rv="badge"]'),
    list: root.querySelector('[data-rv="list"]'),
  };

  // Render-input memoisation. We hash the cheap identity keys; if nothing moved,
  // we skip the DOM writes entirely. This keeps the 500ms tick free.
  let last = {
    ready: null,
    brains: -1,
    tracks: -1,
    observations: -1,
    phase: -1,
    trackVecId: null, // Float32Array identity, not value
    seedIdsKey: '',
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

  function renderBadge(trackVec, seeds) {
    // Badge appears only at track-finalize or during training (phase 3–4) AND
    // when the archive actually returned something useful. On phase 1–2 or an
    // empty archive we stay hidden so the panel doesn't look broken.
    const currentPhase = typeof window.phase === 'number' ? window.phase : 0;
    const wantBadge = currentPhase >= 3 && trackVec && seeds && seeds.length > 0;
    if (!wantBadge) {
      el.badge.hidden = true;
      el.badge.textContent = '';
      return;
    }
    // trackSim ∈ [-1, 1]; map the best match into a 0–100% "similarity" display.
    const bestSim = seeds[0].trackSim;
    const pct = Math.max(0, Math.min(100, Math.round(50 + 50 * bestSim)));
    el.badge.textContent =
      'This track is ' + pct + '% similar to one you\'ve trained on — ' +
      'loading ' + seeds.length + ' candidate brain' +
      (seeds.length === 1 ? '' : 's') + ' as seeds.';
    el.badge.hidden = false;
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
    const rows = seeds.map(function (s, i) {
      const m = s.meta || {};
      const fit = (typeof m.fitness === 'number') ? m.fitness.toFixed(1) : '—';
      const gen = (typeof m.generation === 'number') ? m.generation : '—';
      const parents = Array.isArray(m.parentIds) ? m.parentIds.length : 0;
      const simPct = Math.max(0, Math.min(100, Math.round(50 + 50 * (s.trackSim || 0))));
      return [
        '<div class="rv-item">',
        '  <span class="rv-rank">#', (i + 1), '</span>',
        '  <span class="rv-id" title="', escapeAttr(s.id), '">', escapeHtml(s.id), '</span>',
        '  <span class="rv-sim">', simPct, '%</span>',
        '  <span class="rv-fit" title="fitness">fit ', fit, '</span>',
        '  <span class="rv-gen" title="generation">g', gen, '</span>',
        '  <span class="rv-parents" title="parent seed count">p', parents, '</span>',
        '</div>',
      ].join('');
    }).join('');
    el.list.innerHTML = rows;
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

    renderInfo(info);
    renderBadge(trackVec, seeds);
    renderList(seeds, info || { ready: false, brains: 0 });

    last = {
      ready: ready,
      brains: info ? info.brains : -1,
      tracks: info ? info.tracks : -1,
      observations: info ? info.observations : -1,
      phase: currentPhase,
      trackVecId: trackVec,
      seedIdsKey: seedIdsKey,
    };
  }

  // Initial paint so the panel isn't blank before the bridge finishes loading.
  tick();
  setInterval(tick, REFRESH_MS);
})();
