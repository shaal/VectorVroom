// eli15/tour.js — P4.A guided tour through every ELI15 chapter.
//
// The tour is an ordered playlist of {chapter, anchor, rationale} steps.
// Each step opens the matching chapter in the ELI15 drawer and surfaces a
// coach-mark card that explains where to look in the UI. Anchors are CSS
// selectors resolved against the live DOM at step-activate time, so the
// same playlist works whether the rv-panel is fully populated or still
// warming up (missing anchors skip the ring but keep the card).
//
// Why a classic-script file: mirrors eli15/index.js — no build step, no
// ES-module boundary, immediate window.TOUR surface.
//
// Public surface (window.ELI15Tour):
//   .start()          — open the drawer on step 0 and show the coach mark
//   .stop()           — close everything and restore focus
//   .next() / .prev() — advance or back up one step
//   .jump(i)          — seek to step i (used by the progress dots)
//   .isRunning()      — boolean, for the FAB state indicator
//   .steps()          — copy of the ordered step list (for tests/harnesses)

(function () {
  if (typeof window === 'undefined' || window.ELI15Tour) return;

  // Ordered chapter playlist. Anchors must live somewhere in the DOM the
  // tour can scroll into view — prefer stable [data-eli15] badges or
  // [data-rv] containers since those are the discoverable surfaces learners
  // will want to come back to. When `anchor` is null the step is a "just
  // read this chapter" interstitial (intro, outro, conceptual-only steps).
  const STEPS = [
    {
      id: 'what-is-this-project',
      anchor: '#rv-panel .rv-title [data-eli15="what-is-this-project"]',
      rationale: 'The whole app in two paragraphs — what you\'re about to see.',
    },
    {
      id: 'sensors',
      anchor: '#inputCanvas',
      rationale: 'The five rays feeding the brain — this canvas shows what the car "sees".',
    },
    {
      id: 'neural-network',
      anchor: '#inputCanvas',
      rationale: '92 numbers turning sensor rays into pedal + steer outputs.',
    },
    {
      id: 'genetic-algorithm',
      anchor: null,
      rationale: 'No gradient descent — just copy the winners and nudge.',
    },
    {
      id: 'fitness-function',
      anchor: null,
      rationale: 'How "best" is decided each generation.',
    },
    {
      id: 'cnn-embedder',
      anchor: '#rv-panel [data-eli15="cnn-embedder"]',
      rationale: 'A tiny CNN crushes every track drawing into 512 numbers.',
    },
    {
      id: 'vectordb-hnsw',
      anchor: '#rv-panel [data-eli15="vectordb-hnsw"]',
      rationale: 'Nearest-neighbour search that doesn\'t touch every archived brain.',
    },
    {
      id: 'ema-reranker',
      anchor: '#rv-panel [data-rv="reranker"]',
      rationale: 'The reranker line reshuffles top-K after feedback lands.',
    },
    {
      id: 'lineage',
      anchor: '#rv-panel [data-eli15="lineage"]',
      rationale: 'Every sparkline on the seed list is a parent chain.',
    },
    {
      id: 'track-similarity',
      anchor: '#rv-panel [data-rv="badge"]',
      rationale: 'The similarity percentage when a saved track matches the new one.',
    },
    {
      id: 'gnn',
      anchor: '#rv-panel [data-rv="reranker-mode"]',
      rationale: 'GNN reranker — message passing over the lineage graph.',
    },
    {
      id: 'lora',
      anchor: '#rv-panel [data-rv="lora"]',
      rationale: 'The adapter row — drift tells you how much the adapter is bending the embedding.',
    },
    {
      id: 'dynamics-embedding',
      anchor: '#rv-panel [data-rv="dynamics"]',
      rationale: 'Flip the toggle and retrieval will factor in *how the car drove*, not just what it saw.',
    },
    {
      id: 'sona-trajectory',
      anchor: '#rv-panel [data-rv="sona"]',
      rationale: 'SONA stats — trajectories, ReasoningBank clusters, EWC lambda.',
    },
    {
      id: 'reasoningbank',
      anchor: '#rv-panel [data-rv="circuits"]',
      rationale: 'Similar circuits come from k-means clustering of trajectory embeddings.',
    },
    {
      id: 'ewc',
      anchor: '#rv-panel [data-rv="sona"]',
      rationale: 'The EWC lambda on the SONA row controls anti-forgetting.',
    },
    {
      id: 'lineage-dag',
      anchor: '#rv-panel [data-rv="lineage"]',
      rationale: 'Expand the 🌳 section to see the full DAG rendered on canvas.',
    },
    {
      id: 'hyperbolic-space',
      anchor: '#rv-panel [data-rv="ab-index"]',
      rationale: 'The index toggle flips the nearest-neighbour geometry — flat vs. Poincaré-ball.',
    },
  ];

  let _running = false;
  let _idx = 0;

  // DOM handles built lazily on first start() so the tour doesn't steal
  // layout on page load for visitors who never click "Start tour".
  let fabEl = null;
  let cardEl = null;
  let cardTitleEl = null;
  let cardStepEl = null;
  let cardOneLinerEl = null;
  let cardProgressEl = null;
  let cardPrevEl = null;
  let cardNextEl = null;
  let cardCloseEl = null;
  let ringEl = null;

  function ensureUi() {
    if (fabEl) return;
    fabEl = document.createElement('button');
    fabEl.type = 'button';
    fabEl.className = 'eli15-tour-fab';
    fabEl.setAttribute('aria-label', 'Start guided tour of every AI layer');
    fabEl.title = 'Guided tour of every AI layer';
    fabEl.textContent = '🚗';
    fabEl.addEventListener('click', function () {
      if (_running) stop(); else start();
    });
    document.body.appendChild(fabEl);

    cardEl = document.createElement('div');
    cardEl.className = 'eli15-tour-card';
    cardEl.setAttribute('role', 'dialog');
    cardEl.setAttribute('aria-live', 'polite');
    cardEl.hidden = true;
    cardEl.innerHTML = [
      '<div class="eli15-tour-progress" aria-hidden="true"></div>',
      '<div class="eli15-tour-step"></div>',
      '<h3 class="eli15-tour-title"></h3>',
      '<p class="eli15-tour-oneliner"></p>',
      '<div class="eli15-tour-actions">',
      '  <button type="button" class="eli15-tour-btn eli15-tour-btn-ghost" data-tour="prev">← Back</button>',
      '  <button type="button" class="eli15-tour-btn" data-tour="next">Next →</button>',
      '  <button type="button" class="eli15-tour-close" data-tour="close" aria-label="Close tour">×</button>',
      '</div>',
    ].join('');
    cardTitleEl = cardEl.querySelector('.eli15-tour-title');
    cardStepEl = cardEl.querySelector('.eli15-tour-step');
    cardOneLinerEl = cardEl.querySelector('.eli15-tour-oneliner');
    cardProgressEl = cardEl.querySelector('.eli15-tour-progress');
    cardPrevEl = cardEl.querySelector('[data-tour="prev"]');
    cardNextEl = cardEl.querySelector('[data-tour="next"]');
    cardCloseEl = cardEl.querySelector('[data-tour="close"]');
    cardPrevEl.addEventListener('click', function () { prev(); });
    cardNextEl.addEventListener('click', function () { next(); });
    cardCloseEl.addEventListener('click', function () { stop(); });
    document.body.appendChild(cardEl);

    ringEl = document.createElement('div');
    ringEl.className = 'eli15-tour-ring';
    ringEl.hidden = true;
    document.body.appendChild(ringEl);
  }

  function start() {
    ensureUi();
    _running = true;
    _idx = 0;
    activate();
  }

  function stop() {
    _running = false;
    if (cardEl) cardEl.hidden = true;
    if (ringEl) ringEl.hidden = true;
    if (window.ELI15 && typeof window.ELI15.closeDrawer === 'function') {
      window.ELI15.closeDrawer();
    }
  }

  function next() {
    if (!_running) return;
    if (_idx >= STEPS.length - 1) { stop(); return; }
    _idx += 1;
    activate();
  }

  function prev() {
    if (!_running || _idx === 0) return;
    _idx -= 1;
    activate();
  }

  function jump(i) {
    if (!_running) start();
    if (i < 0 || i >= STEPS.length) return;
    _idx = i;
    activate();
  }

  function activate() {
    const step = STEPS[_idx];
    if (!step) { stop(); return; }

    // Open the chapter in the drawer. openChapter no-ops if the id is
    // missing from the registry — we log so a future author adding a step
    // with a typo gets a visible warning instead of a silent no-op.
    if (window.ELI15 && typeof window.ELI15.openChapter === 'function') {
      try { window.ELI15.openChapter(step.id); }
      catch (e) { console.warn('[tour] openChapter failed for ' + step.id, e); }
    } else {
      console.warn('[tour] ELI15 framework not ready; continuing without drawer');
    }

    // Paint the coach-mark card. Registry lookup gives us the authoritative
    // title so the tour stays in sync if a chapter's title is edited.
    const chapters = (window.ELI15 && window.ELI15.listChapters) ? window.ELI15.listChapters() : {};
    const chapter = chapters[step.id] || {};
    cardStepEl.textContent = 'Step ' + (_idx + 1) + ' of ' + STEPS.length;
    cardTitleEl.textContent = chapter.title || step.id;
    cardOneLinerEl.textContent = step.rationale || chapter.oneLiner || '';
    renderProgressDots();
    cardPrevEl.disabled = (_idx === 0);
    cardNextEl.textContent = (_idx === STEPS.length - 1) ? 'Finish' : 'Next →';
    cardEl.hidden = false;
    positionCard();

    // Ring + anchor scroll. A missing anchor hides the ring but leaves the
    // card visible (useful for conceptual-only steps like fitness-function).
    const target = step.anchor ? document.querySelector(step.anchor) : null;
    if (target) {
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      positionRing(target);
    } else {
      ringEl.hidden = true;
    }
  }

  function renderProgressDots() {
    const dots = [];
    for (let i = 0; i < STEPS.length; i++) {
      const cls = i < _idx ? 'eli15-tour-dot eli15-tour-dot-done'
        : i === _idx ? 'eli15-tour-dot eli15-tour-dot-current'
        : 'eli15-tour-dot';
      dots.push('<span class="' + cls + '" data-idx="' + i + '" aria-label="Jump to step ' + (i + 1) + '"></span>');
    }
    cardProgressEl.innerHTML = dots.join('');
    cardProgressEl.querySelectorAll('.eli15-tour-dot').forEach(function (d) {
      d.addEventListener('click', function () {
        const idx = Number(d.getAttribute('data-idx')) | 0;
        jump(idx);
      });
    });
  }

  function positionRing(target) {
    const rect = target.getBoundingClientRect();
    // Clamp to viewport so the ring doesn't fly off during smooth scroll.
    const top = Math.max(8, rect.top - 6) + window.scrollY;
    const left = Math.max(8, rect.left - 6) + window.scrollX;
    const width = Math.max(24, rect.width + 12);
    const height = Math.max(24, rect.height + 12);
    ringEl.style.top = top + 'px';
    ringEl.style.left = left + 'px';
    ringEl.style.width = width + 'px';
    ringEl.style.height = height + 'px';
    ringEl.hidden = false;
  }

  // Position the card in the bottom-left of the viewport, keeping clear of
  // the drawer on the right. If the viewport is too narrow (mobile), the
  // drawer covers the whole screen — in that case we let the card anchor
  // to the bottom of the drawer instead.
  function positionCard() {
    if (window.innerWidth < 640) {
      cardEl.style.left = '8px';
      cardEl.style.right = '8px';
      cardEl.style.bottom = '8px';
      cardEl.style.top = 'auto';
      cardEl.style.maxWidth = '';
    } else {
      cardEl.style.left = '1em';
      cardEl.style.right = 'auto';
      cardEl.style.bottom = '1em';
      cardEl.style.top = 'auto';
      cardEl.style.maxWidth = '320px';
    }
  }

  // Keyboard shortcuts while the tour is running. We deliberately do not
  // hijack Escape — that closes the drawer, which is a reasonable thing
  // for a learner to try first; the tour ends with it as a side-effect.
  document.addEventListener('keydown', function (ev) {
    if (!_running) return;
    if (ev.target && ((ev.target.tagName || '').toUpperCase() === 'INPUT' ||
      (ev.target.tagName || '').toUpperCase() === 'TEXTAREA' ||
      ev.target.isContentEditable)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); next(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prev(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); stop(); }
  });

  // Build the FAB eagerly so it's discoverable even before the user presses
  // anything — same pattern as the ELI15 drawer FAB in index.js.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
  } else {
    ensureUi();
  }

  window.ELI15Tour = {
    start: start,
    stop: stop,
    next: next,
    prev: prev,
    jump: jump,
    isRunning: function () { return _running; },
    currentIndex: function () { return _idx; },
    steps: function () { return STEPS.slice(); },
  };
})();
