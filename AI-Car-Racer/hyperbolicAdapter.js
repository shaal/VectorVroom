// hyperbolicAdapter.js — P3.A
//
// Thin wrapper around `HyperbolicIndex` (from ruvector-hyperbolic-hnsw-wasm)
// that mimics the slice of the Euclidean `VectorDB` surface the bridge uses:
//
//   new HyperbolicVectorDB(dimensions, metric)
//   insert(vec, id?, metadata?) → string id
//   search(queryVec, k)         → [{ id, score, vector?, metadata? }]
//   len() / isEmpty()
//
// The three non-trivial things this adapter is responsible for:
//
// 1. **ID plumbing.** `HyperbolicIndex` hands out numeric ids; the bridge
//    stores brains / tracks by string id and joins retrieval results against
//    a JS-side mirror map. We keep two dictionaries — stringId ↔ numericId —
//    and emit string ids on insert/search so call-sites stay unchanged.
//
// 2. **Poincaré-ball projection.** Inputs are L2-normalised CNN vectors
//    (norm = 1), which sit on the boundary of the default c=1 ball. We call
//    `projectToBall` on every vector before it hits the wasm index, otherwise
//    Poincaré distances explode near the boundary.
//
// 3. **Score-space coercion.** The Euclidean VectorDB returns cosine
//    *distance* in [0, 2] and the bridge reads `sim = 1 - score`. Hyperbolic
//    distance is unbounded, so we squash with `score = 1 - exp(-d_hyp)` ∈
//    [0, 1). Then `sim = exp(-d_hyp) ∈ (0, 1]` stays in the range the bridge's
//    multiplicative composition expects. Ranking is monotonic in d_hyp, so
//    nearest-neighbour order is preserved — only absolute magnitudes shift.

import initHyp, {
  HyperbolicIndex,
  projectToBall,
} from '../vendor/ruvector/ruvector_hyperbolic_hnsw_wasm/ruvector_hyperbolic_hnsw_wasm.js';

// Default curvature matches the crate's `DEFAULT_CURVATURE`. We stay at c=1
// (unit Poincaré ball) so the L2-normalised CNN outputs need only a tiny
// numerical-safety shrink inside projectToBall.
const CURVATURE = 1.0;
// ef_search=50 mirrors the crate's default — a sensible quality/latency trade
// for archive sizes in the hundreds.
const EF_SEARCH = 50;

let _wasmReady = null;
let _wasmAvailable = false;

export function loadHyperbolic() {
  if (_wasmReady) return _wasmReady;
  _wasmReady = (async () => {
    try {
      await initHyp();
      _wasmAvailable = true;
    } catch (e) {
      console.warn('[hyperbolic-hnsw] wasm init failed — flag will be ignored', e);
      _wasmAvailable = false;
    }
  })();
  return _wasmReady;
}

export function isHyperbolicReady() { return _wasmAvailable; }

// Converts hyperbolic Poincaré distance (unbounded, ≥0) into a bounded
// "distance-like" score in [0, 1) matching the sign convention of cosine
// distance (0 = identical, larger = farther). The bridge reads
// `sim = 1 - score`, so downstream math gets sim ∈ (0, 1].
function squashDistance(d) {
  if (!Number.isFinite(d) || d < 0) return 1;
  return 1 - Math.exp(-d);
}

export class HyperbolicVectorDB {
  // Signature matches `new VectorDB(dim, metric)` — metric is accepted but
  // ignored (the backing index is always Poincaré). The bridge passes 'cosine'
  // for every store, so we treat that as a no-op and document the override in
  // the ELI15 chapter rather than surfacing it here.
  constructor(dimensions, _metric = 'cosine') {
    if (!_wasmAvailable) {
      throw new Error('HyperbolicVectorDB: loadHyperbolic() must resolve before instantiating');
    }
    this._dim = dimensions | 0;
    this._index = new HyperbolicIndex(EF_SEARCH, CURVATURE);
    // String ↔ numeric id bookkeeping. The index hands out sequential usize
    // ids; the bridge prefers stable string ids (especially for hydrated
    // archives). We allocate our own string ids when the caller passes null.
    this._numToString = new Map(); // numericId → stringId
    this._stringToNum = new Map(); // stringId → numericId
    // Vector + metadata mirror so search results can include them (the
    // Euclidean VectorDB does this by default; the hyperbolic index only
    // stores vectors, and no metadata).
    this._mirror = new Map(); // stringId → { vector: Float32Array, metadata: any }
    this._idCounter = 0;
  }

  insert(vector, id = null, metadata = null) {
    if (!(vector instanceof Float32Array)) {
      vector = new Float32Array(vector);
    }
    if (vector.length !== this._dim) {
      throw new Error(`HyperbolicVectorDB.insert: expected dim=${this._dim}, got ${vector.length}`);
    }
    const projected = projectToBall(vector, CURVATURE);
    let strId;
    if (id != null) {
      strId = String(id);
      // If the caller hands us an `hb_N` id (e.g. rebuildIndicesFromMirror
      // replaying a previously-persisted archive into a fresh instance),
      // bump the counter past N so a subsequent null-id insert can't
      // collide. Without this, an archive → index-flip → flip-back →
      // archive sequence would mint a second `hb_0` and silently alias
      // the two entries in the mirror.
      if (strId.startsWith('hb_')) {
        const n = parseInt(strId.slice(3), 10);
        if (Number.isFinite(n) && n >= this._idCounter) {
          this._idCounter = n + 1;
        }
      }
    } else {
      strId = `hb_${this._idCounter++}`;
    }
    const numId = this._index.insert(projected);
    this._numToString.set(numId, strId);
    this._stringToNum.set(strId, numId);
    // Keep the ORIGINAL pre-projection vector in the mirror so callers that
    // read back the vector (hydrate → persist round-trip, bench harness)
    // see what they inserted, not the slightly-shrunk ball projection.
    this._mirror.set(strId, { vector, metadata: metadata || null });
    return strId;
  }

  search(queryVec, k) {
    if (!(queryVec instanceof Float32Array)) {
      queryVec = new Float32Array(queryVec);
    }
    if (queryVec.length !== this._dim) {
      throw new Error(`HyperbolicVectorDB.search: expected dim=${this._dim}, got ${queryVec.length}`);
    }
    if (this._index.isEmpty()) return [];
    const projected = projectToBall(queryVec, CURVATURE);
    // `search` returns a JSON array `[{id: usize, distance: f32}]` via
    // serde-wasm-bindgen. We coerce to the `{id: string, score, vector,
    // metadata}` shape the bridge's existing code reads.
    const raw = this._index.search(projected, Math.max(1, k | 0)) || [];
    const out = [];
    for (const r of raw) {
      const strId = this._numToString.get(r.id);
      if (strId === undefined) continue;
      const entry = this._mirror.get(strId) || {};
      out.push({
        id: strId,
        score: squashDistance(r.distance),
        vector: entry.vector,
        metadata: entry.metadata,
      });
    }
    return out;
  }

  len() { return this._index.len(); }
  isEmpty() { return this._index.isEmpty(); }

  // Parity helper for symmetry with VectorDB's `.dimensions` getter — unused
  // by the bridge today but handy for the bench harness.
  get dimensions() { return this._dim; }
}
