// federation/viewer.js — Phase 2A (F2)
//
// Plain-DOM split-screen viewer. No canvas, no animations. Three columns:
//
//   [Euclidean top-k']     [Hyperbolic top-k']
//   ────────────────────   ─────────────────────
//          [Unioned + GNN-reranked top-k]
//
// and a one-line formula readout underneath:
//
//     k' = k + ⌈√(k · ln S)⌉   (k=<k>, S=<S> → k'=<kp>)
//
// Usage:
//   mountViewer(containerEl, capturer)
//
// `capturer` is a {onSnapshot} object the caller pushes into; the bridge calls
// capturer.onSnapshot(snap) after each federated query. We store the last
// snapshot and re-render. Multiple mounts on the same capturer object stack
// via a small listener array so the panel viewer and any future test-harness
// viewer both stay in sync without fighting for the single slot.
//
// Snapshot shape (bridge contract):
//   {
//     k: number,                       // final top-k requested
//     kPrime: number,                  // per-shard over-request
//     shards: [{ name, results: [{id, score}, ...] }, ...],
//     unionSize: number,               // distinct candidates post-dedup
//     dedupeHits: number,
//     final: [{ id, score, shards:[names], hash? }, ...],  // top-k
//   }

export function createCapturer() {
  const listeners = [];
  let last = null;
  return {
    onSnapshot(snap) {
      last = snap;
      for (const fn of listeners) {
        try { fn(snap); } catch (e) { console.warn('[federation/viewer] listener failed', e); }
      }
    },
    subscribe(fn) {
      listeners.push(fn);
      if (last) {
        try { fn(last); } catch (_) {}
      }
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    last() { return last; },
  };
}

function fmtScore(s) {
  if (!Number.isFinite(s)) return '—';
  if (Math.abs(s) >= 100) return s.toFixed(0);
  if (Math.abs(s) >= 10) return s.toFixed(2);
  return s.toFixed(3);
}

function renderShardTable(el, shard) {
  const name = (shard && shard.name) || '—';
  const rows = (shard && Array.isArray(shard.results)) ? shard.results : [];
  const header = '<div class="fv-col-title">' + escapeHtml(name) + ' <span class="fv-col-count">(' + rows.length + ')</span></div>';
  if (rows.length === 0) {
    el.innerHTML = header + '<div class="fv-empty">no results</div>';
    return;
  }
  const lines = rows.slice(0, 20).map((r) => {
    return '<div class="fv-row"><span class="fv-id">' + escapeHtml(String(r.id)) + '</span>' +
           '<span class="fv-score">' + fmtScore(Number(r.score)) + '</span></div>';
  }).join('');
  el.innerHTML = header + lines;
}

function renderFinal(el, snap) {
  const final = (snap && Array.isArray(snap.final)) ? snap.final : [];
  const k = snap ? snap.k : 0;
  const kp = snap ? snap.kPrime : 0;
  const S = (snap && Array.isArray(snap.shards)) ? snap.shards.length : 0;
  const unionSize = snap ? snap.unionSize : 0;
  const dedupeHits = snap ? snap.dedupeHits : 0;
  const header =
    '<div class="fv-col-title">Unioned + reranked <span class="fv-col-count">(' + final.length + '/' + k + ')</span></div>' +
    '<div class="fv-formula"><code>k\' = k + ⌈√(k · ln S)⌉</code> &nbsp; ' +
    'k=' + k + ', S=' + S + ' → k\'=' + kp + '</div>' +
    '<div class="fv-stats">union size: ' + unionSize + ' &nbsp;·&nbsp; dedupe hits: ' + dedupeHits + '</div>';
  if (final.length === 0) {
    el.innerHTML = header + '<div class="fv-empty">no snapshots yet — run a query</div>';
    return;
  }
  const lines = final.map((r) => {
    const shards = Array.isArray(r.shards) ? r.shards.join('+') : '';
    return '<div class="fv-row fv-row-final">' +
             '<span class="fv-id">' + escapeHtml(String(r.id)) + '</span>' +
             '<span class="fv-shards">' + escapeHtml(shards) + '</span>' +
             '<span class="fv-score">' + fmtScore(Number(r.score)) + '</span>' +
           '</div>';
  }).join('');
  el.innerHTML = header + lines;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mountViewer(container, capturer) {
  if (!container) return () => {};
  container.classList.add('fv-root');
  container.innerHTML = [
    '<style>',
    '.fv-root { font: 12px/1.4 system-ui, sans-serif; border: 1px solid #cfd4dc; border-radius: 6px; padding: 8px; margin-top: 8px; background: #fafbfc; }',
    '.fv-shards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }',
    '.fv-col { background: #fff; border: 1px solid #e3e6eb; border-radius: 4px; padding: 6px; max-height: 180px; overflow-y: auto; }',
    '.fv-col-title { font-weight: 600; margin-bottom: 4px; color: #333; }',
    '.fv-col-count { color: #888; font-weight: 400; }',
    '.fv-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 1px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
    '.fv-row-final { grid-template-columns: 1fr 90px 64px; }',
    '.fv-id { color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.fv-shards { color: #667; font-size: 10px; text-align: right; }',
    '.fv-score { color: #456; text-align: right; }',
    '.fv-final { background: #fff; border: 1px solid #e3e6eb; border-radius: 4px; padding: 6px; }',
    '.fv-formula { color: #456; margin: 4px 0; font-size: 11px; }',
    '.fv-stats { color: #667; font-size: 11px; margin-bottom: 4px; }',
    '.fv-empty { color: #999; font-style: italic; padding: 4px 0; }',
    '</style>',
    '<div class="fv-shards">',
    '  <div class="fv-col" data-fv="euclidean"><div class="fv-empty">Euclidean: waiting for first query…</div></div>',
    '  <div class="fv-col" data-fv="hyperbolic"><div class="fv-empty">Hyperbolic: waiting for first query…</div></div>',
    '</div>',
    '<div class="fv-final" data-fv="final"><div class="fv-empty">no snapshots yet</div></div>',
  ].join('');

  const elEuc = container.querySelector('[data-fv="euclidean"]');
  const elHyp = container.querySelector('[data-fv="hyperbolic"]');
  const elFinal = container.querySelector('[data-fv="final"]');

  function render(snap) {
    if (!snap) return;
    const shards = Array.isArray(snap.shards) ? snap.shards : [];
    // Find by canonical names; fall back to index order.
    let eShard = shards.find((s) => s && s.name === 'euclidean');
    let hShard = shards.find((s) => s && s.name === 'hyperbolic');
    if (!eShard) eShard = shards[0] || null;
    if (!hShard) hShard = shards[1] || null;
    if (eShard) renderShardTable(elEuc, eShard);
    else elEuc.innerHTML = '<div class="fv-empty">Euclidean: no shard</div>';
    if (hShard) renderShardTable(elHyp, hShard);
    else elHyp.innerHTML = '<div class="fv-empty">Hyperbolic: shard unavailable (wasm not loaded)</div>';
    renderFinal(elFinal, snap);
  }

  const unsub = capturer && typeof capturer.subscribe === 'function'
    ? capturer.subscribe(render)
    : () => {};
  return unsub;
}
