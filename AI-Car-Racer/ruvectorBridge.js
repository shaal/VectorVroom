// ruvectorBridge.js
// Vector-memory integration surface for AI-Car-Racer.
// Wraps @ruvector/wasm (VectorDB + HNSW) and @ruvector/cnn (image embedder),
// adds native-IndexedDB persistence, and — as of P1.A — reranks retrieval with
// a GNN over the lineage DAG when enough archived brains are present, falling
// back to the EMA-weighted path otherwise.

import initVec, { VectorDB } from '../vendor/ruvector/ruvector_wasm/ruvector_wasm.js';
import initCnn, { CnnEmbedder } from '../vendor/ruvector/ruvector_cnn_wasm/index.js';
import { flatten, unflatten, FLAT_LENGTH, TOPOLOGY } from './brainCodec.js';
import { loadGnn, isReady as gnnIsReady, gnnScore } from './gnnReranker.js';
import {
  loadAdapter,
  isReady as loraIsReady,
  adapt as loraAdapt,
  reward as loraReward,
  info as loraInfo,
  serialize as loraSerialize,
  deserialize as loraDeserialize,
  recentDrift as loraRecentDrift,
  _debugReset as loraDebugReset,
} from './lora/trackAdapter.js';

const IDB_NAME = 'rv_car_learning';
// Bumped to 2 in P1.B to add the lora_track store. onupgradeneeded creates the
// new store without touching the existing brains/tracks/observations stores,
// so old archives hydrate unchanged on first load after the upgrade.
const IDB_VERSION = 2;
const BRAINS_STORE = `brains_${TOPOLOGY.join('_')}`; // topology-scoped per PRD risk #6
const TRACKS_STORE = 'tracks';
const OBS_STORE = 'observations';
const LORA_STORE = 'lora_track';
const LORA_KEY = 'singleton'; // single-row store; this is the only id ever used

const TRACK_DIM = 512;
// VectorDB returns cosine DISTANCE (1 - similarity), range [0, 2]. Dedup when
// distance is tiny, i.e. the two track vectors are essentially identical.
const TRACK_DEDUPE_MAX_DIST = 0.005; // ≈ 0.9975 cosine similarity
const EMA_ALPHA = 0.3;
const PERSIST_DEBOUNCE_MS = 250;

// Minimum archive size before we switch from EMA to GNN. Rationale: a GNN
// needs a non-trivial graph to be meaningful — with <10 brains the lineage DAG
// is typically a chain of 1–2 nodes and message passing degenerates to identity.
const GNN_MIN_ARCHIVE = 10;

let _rerankerMode = 'none'; // 'gnn' | 'ema' | 'none'
let _forceEma = false;      // test-only override; see setForceEma()

// Test-only: forces the EMA path regardless of GNN availability. Used by
// the scripted replay harness in tests/gnn-replay.html to get an
// apples-to-apples EMA-vs-GNN comparison from a single archive snapshot.
export function setForceEma(on) { _forceEma = !!on; }

// Test-only: when true, recommendSeeds() searches with the *raw* track vector
// instead of the LoRA-adapted one. Lets the lora-replay harness compare
// adapted vs un-adapted retrieval against the same archive. Has no effect on
// reward(): the adapter still receives reward signals when archiveBrain runs,
// because that's the bit we're trying to keep behaviour-equivalent.
let _bypassLora = false;
export function setBypassLora(on) { _bypassLora = !!on; }

let _ready = null;
let _brainDB = null;
let _trackDB = null;
let _cnn = null;

const _brainMirror = new Map(); // id -> { vector: Float32Array, meta }
const _trackMirror = new Map(); // id -> { vector: Float32Array, meta }
const _observations = new Map(); // brainId -> { weight, count }

let _persistTimer = null;
let _persistInFlight = null;

// ─── init ────────────────────────────────────────────────────────────────────

export function ready() {
  if (_ready) return _ready;
  _ready = (async () => {
    await Promise.all([initVec(), initCnn()]);
    _brainDB = new VectorDB(FLAT_LENGTH, 'cosine');
    _trackDB = new VectorDB(TRACK_DIM, 'cosine');
    _cnn = new CnnEmbedder(); // default 224×224, 512-dim, L2-normalized
    // Kick off GNN + LoRA loads in parallel with hydrate(). Best-effort: if
    // either resolves to null, the corresponding code path silently falls back
    // (EMA reranker for GNN; identity transform for LoRA).
    const gnnPromise = loadGnn();
    const loraPromise = loadAdapter();
    await hydrate();
    try { await gnnPromise; } catch (_) { /* already logged inside loadGnn */ }
    try {
      await loraPromise;
      // Hydrate adapter B-matrices after the wasm engines are live. Done
      // here (not inside hydrate) because hydrate() runs before loadAdapter
      // resolves on slow loads, and we need the wasm to exist before set_b.
      await hydrateLoraSnapshot();
    } catch (_) { /* already logged inside loadAdapter */ }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => { try { flushPersist(); } catch (_) {} });
    }
    console.log(`[ruvector] ready — brains=${_brainMirror.size} tracks=${_trackMirror.size} obs=${_observations.size}`);
  })();
  return _ready;
}

function requireReady() {
  if (!_brainDB || !_trackDB || !_cnn) {
    throw new Error('ruvectorBridge: call await ready() before using the bridge');
  }
}

// ─── archive / retrieve ──────────────────────────────────────────────────────

export function archiveBrain(brain, fitness, trackVec, generation = 0, parentIds = [], fastestLap) {
  requireReady();
  const vec = flatten(brain);
  const trackId = trackVec ? upsertTrack(trackVec) : null;
  const lap = Number.isFinite(fastestLap) ? Number(fastestLap) : undefined;
  const meta = {
    fitness: Number(fitness) || 0,
    trackId,
    generation: generation | 0,
    parentIds: Array.isArray(parentIds) ? parentIds.slice() : [],
    timestamp: Date.now(),
  };
  if (lap !== undefined) meta.fastestLap = lap;
  const id = _brainDB.insert(vec, null, meta);
  _brainMirror.set(id, { vector: vec, meta });
  // Feed the LoRA reward signal: the most-recent adapt() input (cached inside
  // trackAdapter) is the gradient direction; fitness gates whether it fires.
  // No-op when the adapter isn't ready or `recommendSeeds` hasn't been called
  // yet for this track (no cached input).
  try { loraReward(meta.fitness); } catch (e) { console.warn('[lora] reward failed', e); }
  schedulePersist();
  return id;
}

function upsertTrack(trackVec) {
  if (!(trackVec instanceof Float32Array) || trackVec.length !== TRACK_DIM) {
    throw new Error(`ruvectorBridge: trackVec must be Float32Array(${TRACK_DIM}), got ${trackVec && trackVec.length}`);
  }
  if (!_trackDB.isEmpty()) {
    const hits = _trackDB.search(trackVec, 1);
    if (hits.length && hits[0].score <= TRACK_DEDUPE_MAX_DIST) return hits[0].id;
  }
  const id = _trackDB.insert(trackVec, null, { firstSeen: Date.now() });
  _trackMirror.set(id, { vector: trackVec, meta: { firstSeen: Date.now() } });
  return id;
}

// Returns [{ id, vector, meta, score }, ...] ordered best first.
// Caller is expected to unflatten vectors into NeuralNetwork instances.
export function recommendSeeds(trackVec, k = 5) {
  requireReady();
  if (_brainMirror.size === 0) return [];

  // Gather candidate brain ids by joining trackDB hits against meta.trackId.
  // VectorDB scores are cosine DISTANCE (0 = identical, 2 = opposite); convert
  // to similarity for downstream math where higher = better.
  // Run the incoming track vector through the LoRA adapter before searching.
  // adapt() returns the input unchanged if the adapter isn't ready or the shape
  // doesn't match — so this is safe even on cold boot. The adapter caches the
  // *raw* vector internally so reward() can use it as a gradient signal later;
  // we don't want to feed the post-adapter vector back as gradient (that would
  // amplify whatever direction B currently points in).
  const queryVec = trackVec ? (_bypassLora ? trackVec : loraAdapt(trackVec)) : null;

  const candidates = new Map(); // brainId -> trackSim (best across matched tracks)
  if (queryVec && !_trackDB.isEmpty()) {
    const trackHits = _trackDB.search(queryVec, Math.min(5, Number(_trackDB.len())));
    for (const th of trackHits) {
      const sim = 1 - th.score;
      for (const [bid, entry] of _brainMirror) {
        if (entry.meta && entry.meta.trackId === th.id) {
          const prev = candidates.get(bid);
          if (prev === undefined || prev < sim) candidates.set(bid, sim);
        }
      }
    }
  }

  // Cold-fallback: no track match → use the whole archive with trackSim=0.
  // This keeps retrieval meaningful on first-ever run or on a totally novel track.
  if (candidates.size === 0) {
    for (const bid of _brainMirror.keys()) candidates.set(bid, 0);
  }

  // Decide reranker: GNN when it's loaded AND the archive has ≥ GNN_MIN_ARCHIVE
  // (10) brains — smaller lineage graphs carry no useful signal for message
  // passing. Otherwise fall back to the EMA observation weight automatically.
  const useGnn = !_forceEma && gnnIsReady() && _brainMirror.size >= GNN_MIN_ARCHIVE;
  const gnnMap = useGnn ? gnnScore(_brainMirror, candidates) : null;
  _rerankerMode = useGnn && gnnMap ? 'gnn' : (candidates.size > 0 ? 'ema' : 'none');

  const scored = [];
  for (const [bid, trackSim] of candidates) {
    const entry = _brainMirror.get(bid);
    const normFit = Math.tanh(((entry.meta && entry.meta.fitness) || 0) / 100);
    // Map cosine [-1,1] → [0,1] so negative sims don't flip sign of product.
    const trackTerm = 0.5 + 0.5 * trackSim;
    const fitTerm = 0.5 + 0.5 * normFit;
    let rerankTerm;
    if (gnnMap && gnnMap.has(bid)) {
      rerankTerm = gnnMap.get(bid);
    } else {
      const obs = _observations.get(bid);
      const emaBoost = obs ? obs.weight : 0;
      rerankTerm = 1 + 0.3 * emaBoost;
    }
    scored.push({
      id: bid,
      vector: entry.vector,
      meta: entry.meta,
      score: trackTerm * fitTerm * rerankTerm,
      trackSim,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, k | 0));
}

// ─── embedding + observation ─────────────────────────────────────────────────

// imageData: Uint8Array of RGB bytes (length = width*height*3, no alpha).
export function embedTrack(imageData, width, height) {
  requireReady();
  return _cnn.extract(imageData, width, height);
}

export function cosineSimilarity(a, b) {
  requireReady();
  return _cnn.cosineSimilarity(a, b);
}

export function observe(retrievedIds, outcomeFitness) {
  requireReady();
  if (!retrievedIds || retrievedIds.length === 0) return;
  const normOut = Math.tanh((Number(outcomeFitness) || 0) / 100);
  for (const id of retrievedIds) {
    const prev = _observations.get(id) || { weight: 0, count: 0 };
    const w = EMA_ALPHA * normOut + (1 - EMA_ALPHA) * prev.weight;
    _observations.set(id, { weight: w, count: prev.count + 1 });
  }
  schedulePersist();
}

// ─── introspection (for UI + debugging) ──────────────────────────────────────

export function info() {
  // `observations` = distinct brain ids that have received feedback (kept for
  // backwards-compat with existing logs). `observationEvents` = total number
  // of observe() calls (sums per-id counts); this is what the reranker-shift
  // indicator keys off, because repeat observes on the same id also rerun
  // the EMA and can reshuffle the ordering.
  let events = 0;
  for (const o of _observations.values()) events += (o.count | 0);
  // `reranker` reflects the mode used on the most recent recommendSeeds() call
  // ('gnn' | 'ema' | 'none'). `gnn` is a derived convenience flag for legacy
  // callers. `gnnLoaded` is "is the GNN wasm module actually available"; we
  // still fall back to EMA if the archive is below GNN_MIN_ARCHIVE.
  // LoRA snapshot — `lora.ready` is the canonical "should the UI show
  // adapter-related widgets" flag. `lora.drift` is the L2 distance between the
  // most recent adapt() input and output; `lora.driftRecent` is a short
  // history for the sparkline. When the adapter never ran this session,
  // drift is 0 and recent is empty.
  const lora = loraInfo();
  lora.driftRecent = loraRecentDrift();
  return {
    brains: _brainMirror.size,
    tracks: _trackMirror.size,
    observations: _observations.size,
    observationEvents: events,
    ready: !!_brainDB,
    gnn: _rerankerMode === 'gnn',
    gnnLoaded: gnnIsReady(),
    reranker: _rerankerMode,
    rerankerThreshold: GNN_MIN_ARCHIVE,
    topology: TOPOLOGY.slice(),
    lora,
  };
}

// Walk meta.parentIds backwards to assemble a lineage trail.
// At each step, when a brain has multiple parents, we pick the highest-fitness
// ancestor — that is "the line of descent we credit this genome to". Cycle-safe
// via a visited set; depth-capped so pathological graphs can't blow the stack.
// Returns entries oldest→newest (i.e. ancestor first, queried id last).
export function getLineage(id, maxDepth = 6) {
  if (!id || !_brainMirror.has(id)) return [];
  const seen = new Set();
  const trail = [];
  let cur = id;
  const cap = Math.max(1, maxDepth | 0);
  while (cur && !seen.has(cur) && trail.length < cap) {
    const entry = _brainMirror.get(cur);
    if (!entry) break;
    seen.add(cur);
    const m = entry.meta || {};
    trail.push({
      id: cur,
      fitness: typeof m.fitness === 'number' ? m.fitness : 0,
      generation: typeof m.generation === 'number' ? m.generation : 0,
    });
    const parents = Array.isArray(m.parentIds) ? m.parentIds : [];
    let best = null;
    let bestFit = -Infinity;
    for (const pid of parents) {
      if (seen.has(pid)) continue;
      const pe = _brainMirror.get(pid);
      if (!pe) continue;
      const pf = (pe.meta && typeof pe.meta.fitness === 'number') ? pe.meta.fitness : 0;
      if (pf > bestFit) { bestFit = pf; best = pid; }
    }
    cur = best;
  }
  return trail.reverse();
}

// ─── persistence (native IndexedDB) ──────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BRAINS_STORE)) db.createObjectStore(BRAINS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(TRACKS_STORE)) db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(OBS_STORE)) db.createObjectStore(OBS_STORE, { keyPath: 'id' });
      // LORA_STORE was added in IDB v2 (P1.B). Keying on `id` matches the
      // pattern of the other stores; we only ever store one row (LORA_KEY).
      if (!db.objectStoreNames.contains(LORA_STORE)) db.createObjectStore(LORA_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function hydrate() {
  if (typeof indexedDB === 'undefined') return;
  let db;
  try { db = await openDB(); } catch (e) {
    console.warn('[ruvector] hydrate: openDB failed', e);
    return;
  }
  try {
    const [brainRows, trackRows, obsRows] = await Promise.all([
      readAll(db, BRAINS_STORE),
      readAll(db, TRACKS_STORE),
      readAll(db, OBS_STORE),
    ]);
    // Tracks first, so upsertTrack-dedup can reference them (not strictly needed
    // since we load by id, but keeps mirror/DB consistent).
    for (const row of trackRows) {
      const vec = toFloat32(row.vec);
      if (vec.length !== TRACK_DIM) continue;
      _trackDB.insert(vec, row.id, row.meta || {});
      _trackMirror.set(row.id, { vector: vec, meta: row.meta || {} });
    }
    for (const row of brainRows) {
      const vec = toFloat32(row.vec);
      if (vec.length !== FLAT_LENGTH) continue;
      _brainDB.insert(vec, row.id, row.meta || {});
      _brainMirror.set(row.id, { vector: vec, meta: row.meta || {} });
    }
    for (const row of obsRows) {
      _observations.set(row.id, { weight: row.weight || 0, count: row.count | 0 });
    }
  } finally {
    db.close();
  }
}

// Read the single-row LORA_STORE and hand it to the adapter. Called from
// ready() *after* loadAdapter() resolves — set_b needs the wasm engines live.
// Failures are swallowed: the adapter just stays at its (zero-B) cold state.
async function hydrateLoraSnapshot() {
  if (typeof indexedDB === 'undefined') return;
  if (!loraIsReady()) return;
  let db;
  try { db = await openDB(); } catch (e) {
    console.warn('[lora] hydrate openDB failed', e); return;
  }
  try {
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(LORA_STORE, 'readonly');
      const req = tx.objectStore(LORA_STORE).get(LORA_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (row && row.snapshot) {
      const ok = loraDeserialize(row.snapshot);
      if (!ok) console.warn('[lora] hydrate snapshot rejected (shape mismatch)');
    }
  } catch (e) {
    console.warn('[lora] hydrate failed', e);
  } finally {
    db.close();
  }
}

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function toFloat32(v) {
  if (v instanceof Float32Array) return v;
  if (Array.isArray(v)) return new Float32Array(v);
  if (v && v.buffer) return new Float32Array(v.buffer, v.byteOffset || 0, v.byteLength / 4);
  return new Float32Array(0);
}

function schedulePersist() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persist().catch((e) => console.warn('[ruvector] persist failed', e));
  }, PERSIST_DEBOUNCE_MS);
}

// Synchronous-ish flush used on beforeunload. Best-effort — browsers may kill
// the IDB transaction before it commits; for the demo we accept that risk.
function flushPersist() {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  persist();
}

export async function persist() {
  if (typeof indexedDB === 'undefined') return;
  // Serialize: collapse concurrent calls into one queued follow-up.
  if (_persistInFlight) {
    await _persistInFlight;
  }
  _persistInFlight = (async () => {
    const db = await openDB();
    try {
      const tx = db.transaction([BRAINS_STORE, TRACKS_STORE, OBS_STORE, LORA_STORE], 'readwrite');
      const brains = tx.objectStore(BRAINS_STORE);
      const tracks = tx.objectStore(TRACKS_STORE);
      const obs = tx.objectStore(OBS_STORE);
      const lora = tx.objectStore(LORA_STORE);
      // Full rewrite keeps the logic simple; archive size stays small (hundreds
      // of entries, <100KB serialized) so the write cost is negligible.
      brains.clear();
      tracks.clear();
      obs.clear();
      lora.clear();
      for (const [id, { vector, meta }] of _brainMirror) {
        brains.put({ id, vec: Array.from(vector), meta });
      }
      for (const [id, { vector, meta }] of _trackMirror) {
        tracks.put({ id, vec: Array.from(vector), meta });
      }
      for (const [id, { weight, count }] of _observations) {
        obs.put({ id, weight, count });
      }
      // Snapshot the adapter state. Skipped silently when the wasm module
      // didn't load — we never persist a vacuous snapshot, which would
      // overwrite a real one on the next boot.
      const snapshot = loraSerialize();
      if (snapshot) lora.put({ id: LORA_KEY, snapshot });
      await txPromise(tx);
    } finally {
      db.close();
    }
  })();
  try { await _persistInFlight; } finally { _persistInFlight = null; }
}

// Test-only: load a fixture archive directly into the in-memory state,
// bypassing IndexedDB. The fixture shape mirrors persist()'s output:
//   { brains:  [{ id, vec, meta }],
//     tracks:  [{ id, vec, meta }],
//     observations: [{ id, weight, count }] }
// Used by tests/gnn-replay.html for deterministic archive replay.
export function hydrateFromFixture(fixture) {
  requireReady();
  _brainMirror.clear();
  _trackMirror.clear();
  _observations.clear();
  _brainDB = new VectorDB(FLAT_LENGTH, 'cosine');
  _trackDB = new VectorDB(TRACK_DIM, 'cosine');
  const toF32 = (v) => (v instanceof Float32Array) ? v : new Float32Array(v);
  for (const row of (fixture.tracks || [])) {
    const vec = toF32(row.vec);
    if (vec.length !== TRACK_DIM) continue;
    _trackDB.insert(vec, row.id, row.meta || {});
    _trackMirror.set(row.id, { vector: vec, meta: row.meta || {} });
  }
  for (const row of (fixture.brains || [])) {
    const vec = toF32(row.vec);
    if (vec.length !== FLAT_LENGTH) continue;
    _brainDB.insert(vec, row.id, row.meta || {});
    _brainMirror.set(row.id, { vector: vec, meta: row.meta || {} });
  }
  for (const row of (fixture.observations || [])) {
    _observations.set(row.id, { weight: row.weight || 0, count: row.count | 0 });
  }
  _rerankerMode = 'none';
}

// Danger-knob: purge everything. Exposed for the verifier + dev console; the
// game never calls this.
export async function _debugReset() {
  _brainMirror.clear();
  _trackMirror.clear();
  _observations.clear();
  loraDebugReset();
  if (typeof indexedDB !== 'undefined') {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
}
