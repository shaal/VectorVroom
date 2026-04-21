// eli15/index.js — teaching-drawer framework.
//
// Loaded as a classic <script> (matches the rest of the app's no-build
// pattern); chapters are lazy-loaded ES modules via dynamic import().
//
// Public surface (window.ELI15):
//   .openChapter(id)  — show the drawer with chapter `id` loaded
//   .closeDrawer()    — hide the drawer
//   .toggleDrawer()   — toggle with the last-viewed chapter (defaults to welcome)
//   .register(id, descriptor)  — add a chapter entry at runtime (for later phases)
//   .listChapters()   — return the registry (id → {title, oneLiner})
//
// Badge pattern: any element with [data-eli15="chapter-id"] becomes a clickable
// help badge. We attach one delegated listener on document rather than per-badge
// so later phases can inject badges into dynamically-rendered panels (e.g.
// rv-panel tick) without having to re-bind.

(function () {
  if (typeof window === 'undefined' || window.ELI15) return;

  // ─── registry ──────────────────────────────────────────────────────────
  // Static map — edit one line here + drop one file in chapters/ to add a
  // chapter. `loader` returns a Promise<{default: ChapterBody}>; the import
  // is deferred until the user actually opens the chapter.
  const REGISTRY = {
    'what-is-this-project': {
      title: 'What is this project even doing?',
      oneLiner: 'A browser-based genetic-algorithm racer with a vector-memory bridge.',
      loader: function () { return import('./chapters/what-is-this-project.js'); },
    },
    'sensors': {
      title: 'The car\'s eyes are five invisible rays',
      oneLiner: 'Ray-cast sensors feed a number per ray into the neural network.',
      loader: function () { return import('./chapters/sensors.js'); },
    },
    'neural-network': {
      title: 'A brain made of 92 numbers',
      oneLiner: 'Six sensor inputs → eight hidden neurons → four pedal/steer outputs.',
      loader: function () { return import('./chapters/neural-network.js'); },
    },
    'genetic-algorithm': {
      title: 'Breeding brains instead of training them',
      oneLiner: 'Copy the winners, nudge their weights, discard the losers. Repeat.',
      loader: function () { return import('./chapters/genetic-algorithm.js'); },
    },
    'fitness-function': {
      title: 'How we decide which car is "best"',
      oneLiner: 'Checkpoints passed + completed laps × track length.',
      loader: function () { return import('./chapters/fitness-function.js'); },
    },
    'cnn-embedder': {
      title: 'Turning a track picture into 512 numbers',
      oneLiner: 'A tiny CNN squashes a track drawing into a fixed-length vector we can compare.',
      loader: function () { return import('./chapters/cnn-embedder.js'); },
    },
    'vectordb-hnsw': {
      title: 'Nearest-neighbour search that doesn\'t scan everything',
      oneLiner: 'HNSW builds a multi-layer graph so queries only touch log(N) vectors.',
      loader: function () { return import('./chapters/vectordb-hnsw.js'); },
    },
    'ema-reranker': {
      title: 'Learning which recommendations actually help',
      oneLiner: 'An EMA per retrieved brain nudges future rankings toward ones that paid off.',
      loader: function () { return import('./chapters/ema-reranker.js'); },
    },
    'lineage': {
      title: 'Every brain has parents',
      oneLiner: 'parentIds + getLineage() reconstruct a brain\'s family tree on demand.',
      loader: function () { return import('./chapters/lineage.js'); },
    },
    'track-similarity': {
      title: 'Not starting from scratch on every new track',
      oneLiner: 'Use brains that did well on similar-shaped past tracks as starting seeds.',
      loader: function () { return import('./chapters/track-similarity.js'); },
    },
  };

  // In-memory chapter body cache: once loaded, reuse on subsequent opens.
  const BODY_CACHE = new Map();
  let lastChapterId = null;

  // ─── drawer DOM ────────────────────────────────────────────────────────
  let drawerEl = null;
  let titleEl = null;
  let oneLinerEl = null;
  let bodyEl = null;
  let diagramEl = null;
  let relatedEl = null;
  let backdropEl = null;
  let fabEl = null;

  function ensureDrawer() {
    if (drawerEl) return;

    backdropEl = document.createElement('div');
    backdropEl.className = 'eli15-backdrop';
    backdropEl.addEventListener('click', closeDrawer);

    drawerEl = document.createElement('aside');
    drawerEl.className = 'eli15-drawer';
    drawerEl.setAttribute('role', 'dialog');
    drawerEl.setAttribute('aria-modal', 'true');
    drawerEl.setAttribute('aria-labelledby', 'eli15-title');
    drawerEl.setAttribute('aria-hidden', 'true');
    drawerEl.innerHTML = [
      '<header class="eli15-header">',
      '  <div class="eli15-header-text">',
      '    <div class="eli15-kicker">🎓 ELI15 — explain like I\'m fifteen</div>',
      '    <h2 id="eli15-title" class="eli15-title"></h2>',
      '    <p class="eli15-oneliner"></p>',
      '  </div>',
      '  <button class="eli15-close" type="button" aria-label="Close ELI15 drawer">×</button>',
      '</header>',
      '<div class="eli15-body"></div>',
      '<div class="eli15-diagram" hidden></div>',
      '<div class="eli15-related" hidden>',
      '  <div class="eli15-related-label">Related chapters</div>',
      '  <ul class="eli15-related-list"></ul>',
      '</div>',
    ].join('');

    titleEl = drawerEl.querySelector('.eli15-title');
    oneLinerEl = drawerEl.querySelector('.eli15-oneliner');
    bodyEl = drawerEl.querySelector('.eli15-body');
    diagramEl = drawerEl.querySelector('.eli15-diagram');
    relatedEl = drawerEl.querySelector('.eli15-related');

    drawerEl.querySelector('.eli15-close').addEventListener('click', closeDrawer);

    // Floating 🎓 button — always-available entry point. Plan P0.A calls for
    // "? key or 🎓 button in the phase bar". We don't have a dedicated phase
    // bar element, so a fixed-position FAB anchors to the viewport corner.
    fabEl = document.createElement('button');
    fabEl.type = 'button';
    fabEl.className = 'eli15-fab';
    fabEl.setAttribute('aria-label', 'Open ELI15 teaching drawer (shortcut: ?)');
    fabEl.title = 'ELI15 — explain like I\'m 15  (?)';
    fabEl.textContent = '🎓';
    fabEl.addEventListener('click', toggleDrawer);

    document.body.appendChild(backdropEl);
    document.body.appendChild(drawerEl);
    document.body.appendChild(fabEl);
  }

  function openDrawer() {
    ensureDrawer();
    drawerEl.classList.add('eli15-drawer-open');
    backdropEl.classList.add('eli15-backdrop-open');
    drawerEl.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('eli15-drawer-open');
    backdropEl.classList.remove('eli15-backdrop-open');
    drawerEl.setAttribute('aria-hidden', 'true');
  }

  function toggleDrawer() {
    ensureDrawer();
    const isOpen = drawerEl.classList.contains('eli15-drawer-open');
    if (isOpen) {
      closeDrawer();
    } else {
      openChapter(lastChapterId || 'what-is-this-project');
    }
  }

  // ─── chapter load + render ─────────────────────────────────────────────

  function openChapter(id) {
    ensureDrawer();
    const entry = REGISTRY[id];
    if (!entry) {
      renderError(id, 'Chapter not found. Check eli15/registry.');
      openDrawer();
      return;
    }
    lastChapterId = id;
    openDrawer();

    // Show a loading state immediately so the drawer doesn't look frozen on
    // first open (the dynamic import adds a round-trip even for already-cached
    // modules on slow disks).
    titleEl.textContent = entry.title;
    oneLinerEl.textContent = entry.oneLiner || '';
    bodyEl.innerHTML = '<p class="eli15-loading">Loading…</p>';
    diagramEl.hidden = true;
    relatedEl.hidden = true;

    const cached = BODY_CACHE.get(id);
    if (cached) {
      renderBody(id, cached);
      return;
    }

    entry.loader().then(function (mod) {
      const body = (mod && mod.default) ? mod.default : mod;
      BODY_CACHE.set(id, body);
      // User may have navigated away before the import resolved; only render
      // if this chapter is still the active one.
      if (lastChapterId === id) renderBody(id, body);
    }).catch(function (err) {
      console.error('[eli15] failed to load chapter "' + id + '"', err);
      if (lastChapterId === id) renderError(id, String(err && err.message || err));
    });
  }

  function renderBody(id, body) {
    // Chapters ship authored HTML strings. They are *not* user input — we
    // trust them the same way we trust any other file in the repo — so
    // assignment is fine. If you ever expose chapter content to untrusted
    // authors, switch to a sanitiser here.
    bodyEl.innerHTML = (body && body.body) || '<p>(chapter has no body)</p>';
    if (body && body.diagram) {
      diagramEl.innerHTML = body.diagram;
      diagramEl.hidden = false;
    } else {
      diagramEl.hidden = true;
    }
    renderRelated(body && body.related);
  }

  function renderRelated(relatedIds) {
    if (!Array.isArray(relatedIds) || relatedIds.length === 0) {
      relatedEl.hidden = true;
      return;
    }
    const list = relatedEl.querySelector('.eli15-related-list');
    list.innerHTML = '';
    let rendered = 0;
    for (const rid of relatedIds) {
      const entry = REGISTRY[rid];
      if (!entry) continue; // quietly skip forward-references to unshipped chapters
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'eli15-related-link';
      a.textContent = entry.title;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        openChapter(rid);
      });
      li.appendChild(a);
      list.appendChild(li);
      rendered += 1;
    }
    relatedEl.hidden = (rendered === 0);
  }

  function renderError(id, msg) {
    titleEl.textContent = 'Chapter not available';
    oneLinerEl.textContent = id;
    bodyEl.innerHTML =
      '<p class="eli15-error">Could not load chapter <code>' + escapeHtml(id) +
      '</code>.</p><pre class="eli15-error-detail">' + escapeHtml(msg) + '</pre>';
    diagramEl.hidden = true;
    relatedEl.hidden = true;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return (
        c === '&' ? '&amp;' :
        c === '<' ? '&lt;' :
        c === '>' ? '&gt;' :
        c === '"' ? '&quot;' : '&#39;'
      );
    });
  }

  // ─── input handlers ────────────────────────────────────────────────────

  function isTypingContext(ev) {
    const t = ev.target;
    if (!t) return false;
    const tag = (t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (t.isContentEditable) return true;
    return false;
  }

  document.addEventListener('keydown', function (ev) {
    // `?` is Shift+/ on US layouts. Modern browsers deliver ev.key === '?'.
    // We skip when the user is typing or combining with Ctrl/Meta so we don't
    // eat browser shortcuts.
    if (isTypingContext(ev)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === '?') {
      ev.preventDefault();
      toggleDrawer();
      return;
    }
    if (ev.key === 'Escape' && drawerEl && drawerEl.classList.contains('eli15-drawer-open')) {
      ev.preventDefault();
      closeDrawer();
    }
  });

  // Delegated click for badge pattern. Closest() means the badge can be a
  // nested element (e.g. a span inside a styled link) and the click still
  // routes correctly.
  document.addEventListener('click', function (ev) {
    const badge = ev.target && ev.target.closest && ev.target.closest('[data-eli15]');
    if (!badge) return;
    const id = badge.getAttribute('data-eli15');
    if (!id) return;
    ev.preventDefault();
    openChapter(id);
  });

  // ─── public API ────────────────────────────────────────────────────────

  window.ELI15 = {
    openChapter: openChapter,
    closeDrawer: closeDrawer,
    toggleDrawer: toggleDrawer,
    register: function (id, descriptor) { REGISTRY[id] = descriptor; },
    listChapters: function () {
      const out = {};
      for (const k of Object.keys(REGISTRY)) {
        out[k] = { title: REGISTRY[k].title, oneLiner: REGISTRY[k].oneLiner };
      }
      return out;
    },
  };

  // Build the drawer eagerly so the FAB is available before the user presses
  // anything. Cheap — creates ~200 bytes of DOM and attaches three listeners.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDrawer, { once: true });
  } else {
    ensureDrawer();
  }
})();
