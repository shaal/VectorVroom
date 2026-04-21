// gnnReranker.js
// Graph Neural Network reranker over the lineage DAG.
//
// Closes the P2.C [!] note in ruvectorBridge.js: replaces the scalar EMA term
// in recommendSeeds() with a GNN forward pass whose node features carry
// fitness, generation, and track similarity, and whose edges follow the
// parentIds DAG assembled from _brainMirror.
//
// The GNN layer (JsRuvectorLayer, from ruvector-gnn-wasm) is a single-message
// aggregator with multi-head attention. We run it once per brain: each brain's
// node embedding is refreshed from its parents, and the scalar score we return
// is derived from the post-message-pass embedding (mean of the updated vector,
// shifted into a multiplicative band so the bridge's `trackTerm * fitTerm *
// score` composition stays well-behaved).
//
// This module is intentionally standalone: it does NOT import ruvectorBridge
// (ruvectorBridge imports us), and it gracefully returns null from loadGnn()
// when the wasm module is unavailable so the bridge can silently fall back to
// the EMA path.

let _gnnReady = null;
let _gnnMod = null;
let _gnnLayer = null;

const GNN_INPUT_DIM = 3;   // [fitnessNorm, generationNorm, trackSim]
const GNN_HIDDEN_DIM = 8;  // small hidden for a tiny lineage graph
const GNN_HEADS = 2;
const GNN_DROPOUT = 0.0;   // deterministic at inference

// Load + init the GNN wasm module. Returns a truthy handle when ready, or
// null if loading fails (missing artifact, wasm instantiation error, API
// mismatch). Safe to call multiple times.
export function loadGnn() {
  if (_gnnReady) return _gnnReady;
  _gnnReady = (async () => {
    try {
      // Same dynamic-import pattern as ruvectorBridge uses for the CNN module
      // (--target web glue; default export is the init function).
      const mod = await import('../vendor/ruvector/ruvector_gnn_wasm/ruvector_gnn_wasm.js');
      await mod.default();
      _gnnMod = mod;
      _gnnLayer = new mod.JsRuvectorLayer(GNN_INPUT_DIM, GNN_HIDDEN_DIM, GNN_HEADS, GNN_DROPOUT);
      return { mod: _gnnMod, layer: _gnnLayer };
    } catch (e) {
      console.warn('[gnn-reranker] load failed; EMA fallback will be used', e);
      _gnnMod = null;
      _gnnLayer = null;
      return null;
    }
  })();
  return _gnnReady;
}

export function isReady() {
  return !!(_gnnMod && _gnnLayer);
}

// Core scoring entry point.
//
// Arguments:
//   brainMirror — Map<id, { vector, meta }>  (ruvectorBridge._brainMirror)
//   candidates  — Map<id, trackSim>          (output of the bridge's track-hit join)
//
// Returns Map<id, number>: a multiplicative score in roughly [0.5, 1.5] that
// slots into recommendSeeds() where the EMA `obsTerm` used to live.
export function gnnScore(brainMirror, candidates) {
  if (!isReady()) return null;
  if (!brainMirror || brainMirror.size === 0) return new Map();

  // Normalise features across the full archive so the GNN sees a stable
  // distribution regardless of candidate-set size.
  let maxFit = 0, maxGen = 0;
  for (const { meta } of brainMirror.values()) {
    const f = Math.abs((meta && meta.fitness) || 0);
    const g = Math.abs((meta && meta.generation) || 0);
    if (f > maxFit) maxFit = f;
    if (g > maxGen) maxGen = g;
  }
  const fitScale = maxFit > 0 ? maxFit : 1;
  const genScale = maxGen > 0 ? maxGen : 1;

  // Build node features for every brain (even non-candidates — they might be
  // parents of candidates, and we want their embeddings in the graph).
  const feats = new Map();
  for (const [id, entry] of brainMirror) {
    const meta = entry.meta || {};
    const fitnessNorm = (Number(meta.fitness) || 0) / fitScale;
    const generationNorm = (Number(meta.generation) || 0) / genScale;
    const trackSim = candidates.has(id) ? candidates.get(id) : 0;
    feats.set(id, new Float32Array([fitnessNorm, generationNorm, trackSim]));
  }

  // One message-pass per brain: aggregate from meta.parentIds (the lineage
  // edges). The layer's forward() takes (nodeEmb, neighborEmbArray, edgeWeights).
  // We weight edges uniformly at 1.0 — upstream fitness is already in the
  // neighbor's feature vector, so uniform weights keep the propagation
  // interpretable.
  const out = new Map();
  for (const [id, entry] of brainMirror) {
    const meta = entry.meta || {};
    const parentIds = Array.isArray(meta.parentIds) ? meta.parentIds : [];
    const neighborEmbs = [];
    for (const pid of parentIds) {
      const pf = feats.get(pid);
      if (pf) neighborEmbs.push(pf);
    }
    const nodeEmb = feats.get(id);
    let updated;
    try {
      if (neighborEmbs.length === 0) {
        // Isolated nodes (no archived parents) — forward with a single zero
        // self-loop so the layer has a neighbour to attend to. This keeps the
        // GNN output dimensionality consistent across nodes.
        const zeros = new Float32Array(GNN_INPUT_DIM);
        updated = _gnnLayer.forward(nodeEmb, [zeros], new Float32Array([1.0]));
      } else {
        const weights = new Float32Array(neighborEmbs.length).fill(1.0);
        updated = _gnnLayer.forward(nodeEmb, neighborEmbs, weights);
      }
    } catch (e) {
      // If a single forward fails (bad shape, NaN, etc.), give this node a
      // neutral score rather than killing the whole reranker.
      console.warn('[gnn-reranker] forward failed for', id, e);
      out.set(id, 1.0);
      continue;
    }
    // Collapse the hidden vector to a scalar via mean; tanh-squash + shift into
    // [0.7, 1.3] so the GNN term plays the same role shape as the old obsTerm
    // (which lived in [0.7, 1.3] for EMA weight ∈ [-1, 1]).
    let sum = 0;
    const n = updated.length || 1;
    for (let i = 0; i < n; i++) sum += updated[i];
    const mean = sum / n;
    const squashed = Math.tanh(mean);
    out.set(id, 1 + 0.3 * squashed);
  }

  // Restrict the returned map to just the candidate set; callers only rerank
  // within that set, and keeping non-candidates would just bloat the return.
  const scored = new Map();
  for (const id of candidates.keys()) {
    scored.set(id, out.has(id) ? out.get(id) : 1.0);
  }
  return scored;
}

// Test-only: reset the module state so unit tests can re-init with fresh state.
export function _debugReset() {
  _gnnReady = null;
  _gnnMod = null;
  _gnnLayer = null;
}
