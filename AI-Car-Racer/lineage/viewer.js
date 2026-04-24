// lineage/viewer.js — P3.B
// Canvas renderer for the lineage DAG. Drop-in widget mounted inside
// #rv-panel; reads its data from ruvectorBridge.getLineageGraph() on each
// repaint. Idempotent — you can call LineageViewer.mount() once the canvas
// is in the DOM and then call render() at will.
//
// Layout strategy:
//   - Y axis: generation. Spread from top (oldest) to bottom (newest).
//   - X axis: deterministic slotting within each generation band. Nodes
//     inherit their x from the best-fitness parent so lineages visually
//     stay in one column; sideways branches are pushed to the next slot
//     in that generation.
//   - Node colour: fitness, mapped to a blue → orange gradient.
//   - Edges: thin semi-transparent lines from parent (x,y) → child (x,y).
//
// Click handling: a node click opens the `lineage-dag` ELI15 chapter. We
// keep click routing in this file (rather than delegating via [data-eli15])
// because the nodes live on a canvas, not in the DOM.

(function () {
  if (typeof window === 'undefined') return;
  if (window.LineageViewer) return;

  const DPR = window.devicePixelRatio || 1;
  const MIN_NODE_R = 3;
  const MAX_NODE_R = 6;
  const SLOT_W = 14; // horizontal pixel step between sibling slots
  const TOP_PAD = 18;
  const BOTTOM_PAD = 10;
  const LEFT_PAD = 12;
  const RIGHT_PAD = 12;

  let canvas = null;
  let statusEl = null;
  let tooltipEl = null;
  let ctx = null;

  // Memoised layout so hit-testing + tooltip don't recompute on every mouse move.
  let layout = null; // { nodes: [{id, x, y, r, fitness}], edges, bbox }
  let lastSnapshotKey = '';
  let lastWidth = 0;
  let lastHeight = 0;

  // ─── public API ────────────────────────────────────────────────────────
  function mount(opts) {
    opts = opts || {};
    canvas = opts.canvas;
    statusEl = opts.statusEl || null;
    tooltipEl = opts.tooltipEl || null;
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('mouseleave', hideTooltip);
    return true;
  }

  function render() {
    if (!canvas || !ctx) return;
    const bridge = window.__rvBridge;
    if (!bridge || typeof bridge.getLineageGraph !== 'function') {
      renderEmpty('bridge not ready');
      return;
    }
    let snap;
    try { snap = bridge.getLineageGraph(); }
    catch (e) {
      renderEmpty('error: ' + (e && e.message || e));
      return;
    }
    if (!snap || !snap.ready) {
      renderEmpty('lineage DAG is still loading…');
      return;
    }
    const nodeCount = snap.nodes ? snap.nodes.length : 0;
    if (nodeCount === 0) {
      renderEmpty('no archived brains yet — train a generation');
      return;
    }
    // Cheap snapshot fingerprint: node count + last node id + edge count.
    // Good enough to skip relayout when nothing meaningful changed.
    const last = snap.nodes[snap.nodes.length - 1];
    const key = nodeCount + '|' + (last ? last.id : '') + '|' + snap.edges.length;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (key !== lastSnapshotKey || w !== lastWidth || h !== lastHeight) {
      layout = computeLayout(snap, w, h);
      lastSnapshotKey = key;
      lastWidth = w;
      lastHeight = h;
    }
    resizeForDpr(w, h);
    drawLayout(layout, snap, w, h);
    if (statusEl) {
      statusEl.textContent = nodeCount + ' brain' + (nodeCount === 1 ? '' : 's') +
        ' · ' + snap.edges.length + ' edge' + (snap.edges.length === 1 ? '' : 's') +
        (snap.droppedEdges ? ' · ' + snap.droppedEdges + ' cycle-drops' : '');
    }
  }

  // ─── internals ─────────────────────────────────────────────────────────

  function renderEmpty(msg) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    resizeForDpr(w, h);
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, h / 2);
    ctx.restore();
    if (statusEl) statusEl.textContent = msg;
    layout = null;
    lastSnapshotKey = '';
  }

  function resizeForDpr(w, h) {
    const targetW = Math.max(1, Math.round(w * DPR));
    const targetH = Math.max(1, Math.round(h * DPR));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }

  // Assign (x, y) to every node. Generations map to horizontal bands via
  // the min→max gen range in the snapshot; within each band we lay siblings
  // side-by-side, biasing each node's x toward its best-fitness parent so
  // lineages read vertically.
  function computeLayout(snap, viewW, viewH) {
    const nodes = snap.nodes;
    const edges = snap.edges;

    // Child lookup so we can pick each node's preferred x from its parent.
    const parentByChild = new Map(); // childId → best-fit parentId
    const childToParents = new Map(); // childId → [parentId]
    for (const e of edges) {
      if (!childToParents.has(e.to)) childToParents.set(e.to, []);
      childToParents.get(e.to).push(e.from);
    }
    const nodeById = new Map();
    for (const n of nodes) nodeById.set(n.id, n);
    for (const [childId, parents] of childToParents) {
      let best = null;
      let bestFit = -Infinity;
      for (const pid of parents) {
        const pn = nodeById.get(pid);
        if (!pn) continue;
        if (pn.fitness > bestFit) { bestFit = pn.fitness; best = pid; }
      }
      if (best) parentByChild.set(childId, best);
    }

    let genMin = Infinity;
    let genMax = -Infinity;
    let fitMin = Infinity;
    let fitMax = -Infinity;
    for (const n of nodes) {
      if (n.generation < genMin) genMin = n.generation;
      if (n.generation > genMax) genMax = n.generation;
      if (n.fitness < fitMin) fitMin = n.fitness;
      if (n.fitness > fitMax) fitMax = n.fitness;
    }
    if (!isFinite(genMin)) { genMin = 0; genMax = 0; }
    if (!isFinite(fitMin)) { fitMin = 0; fitMax = 0; }
    const genRange = Math.max(1, genMax - genMin);
    const fitRange = Math.max(1e-6, fitMax - fitMin);

    // Sort ascending by generation so each node's parent slot is already
    // assigned by the time we place the child. Secondary key: fitness desc
    // (so the best sibling gets the leftmost slot).
    const sorted = nodes.slice().sort(function (a, b) {
      if (a.generation !== b.generation) return a.generation - b.generation;
      return b.fitness - a.fitness;
    });

    const slotsByGen = new Map(); // gen → next free slot index
    const slotByNode = new Map(); // id → slot index
    for (const n of sorted) {
      const preferred = parentByChild.has(n.id)
        ? slotByNode.get(parentByChild.get(n.id))
        : undefined;
      const cur = slotsByGen.get(n.generation) || 0;
      // Start at the parent's slot (or current bank head, whichever is later)
      // so the lineage column isn't split between unrelated branches.
      const slot = Math.max(cur, preferred === undefined ? 0 : preferred);
      slotByNode.set(n.id, slot);
      slotsByGen.set(n.generation, slot + 1);
    }

    const innerW = Math.max(40, viewW - LEFT_PAD - RIGHT_PAD);
    const innerH = Math.max(40, viewH - TOP_PAD - BOTTOM_PAD);

    // Compress x to fit if we have lots of siblings; widen if few.
    let maxSlot = 0;
    for (const count of slotsByGen.values()) {
      if (count - 1 > maxSlot) maxSlot = count - 1;
    }
    const slotPx = maxSlot <= 0 ? 0 : Math.min(SLOT_W, innerW / maxSlot);

    const placed = [];
    for (const n of sorted) {
      const slot = slotByNode.get(n.id) || 0;
      const x = LEFT_PAD + slot * slotPx + slotPx * 0.5;
      const y = TOP_PAD + ((n.generation - genMin) / genRange) * innerH;
      const t = (n.fitness - fitMin) / fitRange; // 0..1
      const r = MIN_NODE_R + t * (MAX_NODE_R - MIN_NODE_R);
      placed.push({
        id: n.id, x, y, r,
        fitness: n.fitness,
        generation: n.generation,
        t,
        duplicateCount: n.duplicateCount || 0,
      });
    }
    return { nodes: placed, edges: edges, fitMin, fitMax, genMin, genMax };
  }

  function drawLayout(l, snap, w, h) {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background grid — faint horizontal lines per generation bucket, so the
    // y-axis reads as "generations from old to young".
    const buckets = Math.min(8, Math.max(2, (l.genMax - l.genMin) + 1));
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= buckets; i++) {
      const y = TOP_PAD + (i / buckets) * (h - TOP_PAD - BOTTOM_PAD);
      ctx.beginPath();
      ctx.moveTo(LEFT_PAD, y + 0.5);
      ctx.lineTo(w - RIGHT_PAD, y + 0.5);
      ctx.stroke();
    }

    // Edges first (underneath nodes).
    const byId = new Map();
    for (const n of l.nodes) byId.set(n.id, n);
    ctx.strokeStyle = 'rgba(58,123,213,0.5)';
    ctx.lineWidth = 1;
    for (const e of snap.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Nodes.
    for (const n of l.nodes) {
      ctx.fillStyle = fitnessToColor(n.t);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // F5: duplicate badge. For any node that has absorbed ≥1 content-
    // identical sighting we draw a small "×N" label above-right of the dot.
    // N is total sightings (1 + duplicateCount) so the reader sees "×3"
    // when a brain has been seen three times, which matches intuition better
    // than "×2 extra".
    ctx.font = '9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const n of l.nodes) {
      if (!n.duplicateCount) continue;
      const total = 1 + n.duplicateCount;
      const label = '×' + total;
      const bx = n.x + n.r + 2;
      const by = n.y - n.r - 1;
      const pad = 2;
      const w = ctx.measureText(label).width + pad * 2;
      const h = 11;
      ctx.fillStyle = 'rgba(211,139,75,0.9)'; // warm — same palette as hi-fit colour
      ctx.fillRect(bx, by - h / 2, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, bx + pad, by);
    }

    // Axis label — a small "gen 0" / "gen N" hint so the reader knows which
    // way time flows without having to open DevTools.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('gen ' + l.genMin, 4, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('gen ' + l.genMax, 4, h - 2);
    ctx.restore();
  }

  // Blue (cool, low fitness) → orange (warm, high fitness).
  function fitnessToColor(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(58 + t * (211 - 58));
    const g = Math.round(123 + t * (139 - 123));
    const b = Math.round(213 + t * (75 - 213));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function hitTest(ev) {
    if (!layout) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    // Last node wins on overlaps — newer (lower y) nodes are added later so
    // this naturally favours the foreground.
    let best = null;
    let bestDist = Infinity;
    for (const n of layout.nodes) {
      const dx = n.x - x;
      const dy = n.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= (n.r + 3) * (n.r + 3) && d2 < bestDist) {
        bestDist = d2;
        best = n;
      }
    }
    return best;
  }

  function onCanvasClick(ev) {
    const hit = hitTest(ev);
    if (!hit) return;
    // Opening the ELI15 chapter serves two purposes: teach the concept, and
    // give the user a consistent "I clicked a node, something happened" cue.
    // The chapter's body links to the JS call for programmatic exploration.
    if (window.ELI15 && typeof window.ELI15.openChapter === 'function') {
      window.ELI15.openChapter('lineage-dag');
    }
  }

  function onCanvasMove(ev) {
    const hit = hitTest(ev);
    if (!hit || !tooltipEl) { hideTooltip(); return; }
    tooltipEl.hidden = false;
    const dupSuffix = hit.duplicateCount
      ? ' · ×' + (1 + hit.duplicateCount) + ' seen'
      : '';
    tooltipEl.textContent =
      hit.id + ' · gen ' + hit.generation +
      ' · fit ' + (Number.isFinite(hit.fitness) ? hit.fitness.toFixed(1) : '—') +
      dupSuffix;
    const rect = canvas.getBoundingClientRect();
    // Position above the cursor; clamp to canvas bounds.
    const tx = Math.max(0, Math.min(rect.width - 140, hit.x - 70));
    tooltipEl.style.left = (rect.left + tx) + 'px';
    tooltipEl.style.top = (rect.top + hit.y - 28) + 'px';
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.hidden = true;
  }

  window.LineageViewer = {
    mount: mount,
    render: render,
  };
})();
