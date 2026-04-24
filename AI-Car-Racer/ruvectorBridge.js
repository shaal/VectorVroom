// ruvectorBridge.js
// Vector-memory integration surface for AI-Car-Racer.
// Wraps @ruvector/wasm (VectorDB + HNSW) and @ruvector/cnn (image embedder),
// adds native-IndexedDB persistence, and — as of P1.A — reranks retrieval with
// a GNN over the lineage DAG when enough archived brains are present, falling
// back to the EMA-weighted path otherwise.

// Cache-bust query is load-bearing on the live site: CF Pages edge
// had a pre-2026-04 cached entry for the bare URL with `immutable`
// set, which kept serving a Rocket-Loader/auto-minify-transformed
// copy even after the hnsw-wasm rebuild. A new query-stringed URL
// has no stale edge entry and inherits the current `no-transform`
// header policy. Bump `?v=...` on any future vendor rebuild if the
// stale entry bites again.
import initVec, { VectorDB } from '../vendor/ruvector/ruvector_wasm/ruvector_wasm.js?v=hnsw-wasm-20260424b';
import initCnn, { CnnEmbedder } from '../vendor/ruvector/ruvector_cnn_wasm/index.js';
import { flatten, unflatten, FLAT_LENGTH, TOPOLOGY, BRAIN_SCHEMA_VERSION } from './brainCodec.js';
import { loadGnn, isReady as gnnIsReady, gnnScore } from './gnnReranker.js';
// P3.A — hyperbolic HNSW swap. `loadHyperbolic` boots the wasm side; the
// adapter mimics the slice of VectorDB the bridge actually calls (insert /
// search / len / isEmpty) so the swap is a one-line constructor change.
// When the wasm fails to load, the flag silently falls back to Euclidean.
import {
  loadHyperbolic,
  isHyperbolicReady,
  HyperbolicVectorDB,
} from './hyperbolicAdapter.js';
// P3.B — lineage DAG. Replaces the hand-walked parentIds traversal in
// getLineage() with a cycle-safe DAG structure (ruvector_dag_wasm) shadowed
// by a JS-side adjacency list for O(depth) queries. Same fallback discipline
// as gnnReranker: when the wasm module doesn't load, the bridge keeps the
// legacy in-function walk around (exposed as getLineageLegacy for the P3.B
// equivalence harness). See AI-Car-Racer/lineage/dag.js for the wrapper.
import {
  loadDag,
  isReady as dagIsReady,
  addBrain as dagAddBrain,
  getLineage as dagGetLineage,
  hydrateFromMirror as dagHydrateFromMirror,
  getGraphSnapshot as dagGetGraphSnapshot,
  info as dagInfo,
  _debugReset as dagDebugReset,
} from './lineage/dag.js';
// P2.A — the SONA engine is a façade that subsumes the P1.B MicroLoRA
// adapter (unchanged call shape: adapt / reward / drift) and adds trajectory
// recording + ReasoningBank pattern extraction. We keep the `lora*` local
// names so the rest of this file reads the same as before P2.A, and pull in
// the new SONA surface under a separate `sona*` namespace.
import {
  loadEngine as loadSonaEngine,
  isReady as loraIsReady,
  sonaReady,
  adapt as loraAdapt,
  reward as loraReward,
  info as sonaEngineInfo,
  serialize as loraSerialize,
  deserialize as loraDeserialize,
  recentDrift as loraRecentDrift,
  _debugReset as sonaEngineDebugReset,
  beginTrajectory as sonaBeginTrajectory,
  addStep as sonaAddStep,
  endTrajectory as sonaEndTrajectory,
  findPatterns as sonaFindPatterns,
} from './sona/engine.js';

const IDB_NAME = 'rv_car_learning';
// Bumped to 3 in P1.C to add the dynamics store. onupgradeneeded for v3
// creates the new store only; brains/tracks/observations/lora are untouched,
// so old archives continue to hydrate unchanged — they just don't have
// dynamicsId set on any brain meta (backwards-compat: missing → skip the
// dynamics term in recommendSeeds).
const IDB_VERSION = 3;
const BRAINS_STORE = `brains_${TOPOLOGY.join('_')}`; // topology-scoped per PRD risk #6
const TRACKS_STORE = 'tracks';
const OBS_STORE = 'observations';
const LORA_STORE = 'lora_track';
const LORA_KEY = 'singleton'; // single-row store; this is the only id ever used
const DYNAMICS_STORE = 'dynamics';

const TRACK_DIM = 512;
const DYNAMICS_DIM = 64; // matches dynamicsEmbedder.DYNAMICS_DIM
// VectorDB returns cosine DISTANCE (1 - similarity), range [0, 2]. Dedup when
// distance is tiny, i.e. the two track vectors are essentially identical.
const TRACK_DEDUPE_MAX_DIST = 0.005; // ≈ 0.9975 cosine similarity
const EMA_ALPHA = 0.3;
const PERSIST_DEBOUNCE_MS = 250;

// Minimum archive size before we switch from EMA to GNN. Rationale: a GNN
// needs a non-trivial graph to be meaningful — with <10 brains the lineage DAG
// is typically a chain of 1–2 nodes and message passing degenerates to identity.
const GNN_MIN_ARCHIVE = 10;

let _rerankerMode = 'none'; // 'gnn' | 'ema' | 'none' — most recent path actually taken

// P3.F — per-generation seeding-source breakdown. Counters are set by the
// caller (main.js buildBrainsBuffer) via setLastSeedSources() *after* it has
// assigned every slot, because the localStorage_prior / random_init buckets
// are decisions made outside this module. `total` lets the UI assert that
// archive + prior + random sums to the full population N — any drift means
// some slot was silently unaccounted for. `generation` is the gen index at
// which the snapshot was taken; rendering clients use it as a cache key.
let _lastSeedSources = {
  archive_recall: 0,
  localStorage_prior: 0,
  random_init: 0,
  total: 0,
  generation: -1,
};
export function setLastSeedSources(obj) {
  if (!obj || typeof obj !== 'object') return;
  const archive = Math.max(0, (obj.archive_recall | 0));
  const prior = Math.max(0, (obj.localStorage_prior | 0));
  const random = Math.max(0, (obj.random_init | 0));
  _lastSeedSources = {
    archive_recall: archive,
    localStorage_prior: prior,
    random_init: random,
    total: archive + prior + random,
    generation: Number.isFinite(obj.generation) ? (obj.generation | 0) : -1,
  };
}

// P4.A — UI-facing policy switches. The A/B toggle strip sets these; the
// test harnesses can still reach the low-level boolean overrides (setForceEma,
// setBypassLora) for backwards compatibility.
//
// Reranker policy (what the toggle picks, vs. what recommendSeeds ends up doing):
//   'auto' — original behaviour: gnn if wasm loaded AND archive ≥ GNN_MIN_ARCHIVE, else ema
//   'none' — skip the reranker term entirely (rerankTerm = 1, pure trackSim × fitness)
//   'ema'  — force EMA path
//   'gnn'  — force GNN path when wasm loaded (ignores archive-size threshold)
let _rerankerPolicy = 'auto';
const VALID_RERANKER_MODES = ['auto', 'none', 'ema', 'gnn'];
export function setRerankerMode(mode) {
  if (!VALID_RERANKER_MODES.includes(mode)) return false;
  _rerankerPolicy = mode;
  return true;
}
export function getRerankerMode() { return _rerankerPolicy; }

let _forceEma = false;      // test-only override; see setForceEma()

// Test-only: forces the EMA path regardless of GNN availability. Used by
// the scripted replay harness in tests/gnn-replay.html to get an
// apples-to-apples EMA-vs-GNN comparison from a single archive snapshot.
export function setForceEma(on) { _forceEma = !!on; }

// Adapter policy. The toggle strip picks one of these; `_bypassLora` and
// `_sonaPaused` are the two low-level flags the rest of the bridge reads.
//   'sona'       — P2.A default: LoRA adapts query vectors, SONA records trajectories
//   'micro-lora' — P1.B-era behaviour: LoRA active, SONA trajectory recording paused
//   'off'        — ablate the adapter entirely: raw track vector, no SONA trajectories
let _adapterMode = 'sona';
let _sonaPaused = false;
const VALID_ADAPTER_MODES = ['off', 'micro-lora', 'sona'];
export function setAdapterMode(mode) {
  if (!VALID_ADAPTER_MODES.includes(mode)) return false;
  _adapterMode = mode;
  _bypassLora = (mode === 'off');
  _sonaPaused = (mode !== 'sona');
  return true;
}
export function getAdapterMode() { return _adapterMode; }

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
let _dynamicsDB = null;
let _cnn = null;

// P3.A — index geometry. `_indexKind` is the *active* backend ('euclidean' or
// 'hyperbolic'), flipped at ready() time based on the `?hhnsw=1` URL flag OR
// by the A/B toggle strip calling setIndexKind() at runtime. We always boot
// the wasm in the background so flipping the toggle later doesn't stall on a
// wasm-pack download; isHyperbolicReady() reports readiness for the UI.
let _indexKind = 'euclidean';
const VALID_INDEX_KINDS = ['euclidean', 'hyperbolic'];
function pickIndexClass(kind) {
  if (kind === 'hyperbolic' && isHyperbolicReady()) return HyperbolicVectorDB;
  return VectorDB;
}
export function getIndexKind() { return _indexKind; }
// Runtime swap: tears the stores down and rebuilds the index under the new
// geometry from _brainMirror / _trackMirror / _dynamicsMirror. Persistence is
// preserved because hydrate() always rebuilds from IDB anyway. Intentionally
// synchronous (no IDB trip) so the A/B toggle feels instant.
export function setIndexKind(kind) {
  if (!VALID_INDEX_KINDS.includes(kind)) return false;
  if (kind === 'hyperbolic' && !isHyperbolicReady()) {
    console.warn('[ruvector] hyperbolic wasm not ready — staying on euclidean');
    return false;
  }
  if (kind === _indexKind) return true;
  _indexKind = kind;
  rebuildIndicesFromMirror();
  return true;
}
function rebuildIndicesFromMirror() {
  if (!_brainDB || !_trackDB || !_dynamicsDB) return;
  const IndexClass = pickIndexClass(_indexKind);
  _brainDB = new IndexClass(FLAT_LENGTH, 'cosine');
  _trackDB = new IndexClass(TRACK_DIM, 'cosine');
  _dynamicsDB = new IndexClass(DYNAMICS_DIM, 'cosine');
  for (const [id, { vector, meta }] of _trackMirror) {
    _trackDB.insert(vector, id, meta || {});
  }
  for (const [id, { vector, meta }] of _dynamicsMirror) {
    _dynamicsDB.insert(vector, id, meta || {});
  }
  for (const [id, { vector, meta }] of _brainMirror) {
    _brainDB.insert(vector, id, meta || {});
  }
}

// Dynamics retrieval toggle. Default off per P1.C plan: adding the extra
// similarity term shifts seeding behaviour, so we keep it opt-in and let the
// panel checkbox drive it. `_queryDynamicsVec` is set by callers (main.js /
// uiPanels) before recommendSeeds so the bridge stays pure-read.
let _useDynamics = false;
let _queryDynamicsVec = null;
// Weight of the dynamics-sim term in the final score product. Small enough
// that dynamics can tie-break but won't drown out fitness × track-similarity.
const DYNAMICS_TERM_WEIGHT = 0.3;

const _brainMirror = new Map(); // id -> { vector: Float32Array, meta }
const _trackMirror = new Map(); // id -> { vector: Float32Array, meta }
const _dynamicsMirror = new Map(); // id -> { vector: Float32Array, meta }
const _observations = new Map(); // brainId -> { weight, count }

let _persistTimer = null;
let _persistInFlight = null;

// ─── init ────────────────────────────────────────────────────────────────────

// ─── boot profiling (temporary) ────────────────────────────────────────
// Records per-phase durations of ready() so heavy archives have a visible
// trace of where the 30s startup time goes. Exposed as window.__bootTimings
// for quick copy/paste diagnosis. Safe to leave in place — each call is one
// performance.now() and a Map.set(), ~microseconds total.
const _bootTimings = {};
function _tStart() { return performance.now(); }
function _tEnd(label, start) {
  const ms = performance.now() - start;
  _bootTimings[label] = Math.round(ms * 10) / 10;
  return ms;
}
if (typeof window !== 'undefined') { window.__bootTimings = _bootTimings; }

// Phase A0 — brain schema version guard. A mismatch means stored brains were
// produced by a different inference pipeline (e.g. v1 threshold vs v2 tanh),
// so seeding from them would be actively misleading. We wipe IDB + the
// localStorage sidecars and write the current version so subsequent boots
// skip this path. `null` (no key) is treated as an implicit v1 because that
// was the state before versioning shipped.
async function migrateBrainSchemaIfNeeded() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('brainSchemaVersion');
  const effective = stored == null ? '1' : stored;
  const current = String(BRAIN_SCHEMA_VERSION);
  if (effective === current) return;
  console.log(`[ruvector] brain schema v${effective} → v${current} — clearing archive`);
  if (typeof indexedDB !== 'undefined') {
    try {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(IDB_NAME);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    } catch (e) { console.warn('[ruvector] schema migrate: DB delete failed', e); }
  }
  try { localStorage.removeItem('bestBrain'); } catch (_) {}
  try { localStorage.removeItem('oldBestBrain'); } catch (_) {}
  try { localStorage.removeItem('progress'); } catch (_) {}
  try { localStorage.setItem('brainSchemaVersion', current); } catch (_) {}
}

export function ready() {
  if (_ready) return _ready;
  _ready = (async () => {
    const _t0 = _tStart();
    // Run BEFORE any IDB reads so hydrate() sees an empty DB on mismatch.
    await migrateBrainSchemaIfNeeded();
    // P3.A — boot hyperbolic wasm in parallel with the Euclidean / CNN
    // inits. We always load it so the A/B toggle can flip to hyperbolic
    // without a cold-start stall, even when the URL flag isn't set.
    // `?hhnsw=1` flips the default kind at init time; the toggle can still
    // override later. This mirrors the pattern already used for `?rv=0`.
    const hyperbolicPromise = loadHyperbolic();
    let wantHyperbolic = false;
    try {
      if (typeof window !== 'undefined' && typeof URLSearchParams === 'function') {
        const usp = new URLSearchParams(window.location.search || '');
        wantHyperbolic = usp.get('hhnsw') === '1';
      }
    } catch (_) { /* ignore — fall back to euclidean */ }
    const _tWasmInit = _tStart();
    await Promise.all([initVec(), initCnn()]);
    _tEnd('1_initVec+initCnn', _tWasmInit);
    const _tHyper = _tStart();
    try { await hyperbolicPromise; } catch (_) { /* already logged */ }
    _tEnd('2_loadHyperbolic', _tHyper);
    _indexKind = (wantHyperbolic && isHyperbolicReady()) ? 'hyperbolic' : 'euclidean';
    const IndexClass = pickIndexClass(_indexKind);
    _brainDB = new IndexClass(FLAT_LENGTH, 'cosine');
    _trackDB = new IndexClass(TRACK_DIM, 'cosine');
    _dynamicsDB = new IndexClass(DYNAMICS_DIM, 'cosine');
    _cnn = new CnnEmbedder(); // default 224×224, 512-dim, L2-normalized
    // Kick off GNN + LoRA loads in parallel with hydrate(). Best-effort: if
    // either resolves to null, the corresponding code path silently falls back
    // (EMA reranker for GNN; identity transform for LoRA).
    const gnnPromise = loadGnn();
    // P3.B — boot the DAG wasm in parallel with everything else. Loading it
    // here (before hydrate() resolves) means the hydrateDagFromMirror() call
    // at the tail of ready() can populate it in one go; if loadDag fails we
    // silently leave isReady() false and the bridge falls back to the legacy
    // walk.
    const dagPromise = loadDag();
    // P2.A — loadSonaEngine boots the LoRA adapter AND the SONA ephemeral
    // agent in parallel. Either side can fail independently without taking
    // the other down; we log+fall through in both cases.
    const sonaPromise = loadSonaEngine();
    const _tHydrate = _tStart();
    await hydrate();
    _tEnd('3_hydrate_total', _tHydrate);
    const _tGnn = _tStart();
    try { await gnnPromise; } catch (_) { /* already logged inside loadGnn */ }
    _tEnd('4_loadGnn', _tGnn);
    const _tDag = _tStart();
    try { await dagPromise; } catch (_) { /* already logged inside loadDag */ }
    _tEnd('5_loadDag', _tDag);
    const _tDagHydrate = _tStart();
    try { if (dagIsReady()) dagHydrateFromMirror(_brainMirror); }
    catch (e) { console.warn('[lineage-dag] hydrate failed', e); }
    _tEnd('6_dagHydrateFromMirror', _tDagHydrate);
    const _tSona = _tStart();
    try {
      await sonaPromise;
      // Hydrate adapter B-matrices after the wasm engines are live. Done
      // here (not inside hydrate) because hydrate() runs before the engine
      // promise resolves on slow loads, and we need the wasm to exist
      // before set_b. The SONA agent keeps no persisted state — pattern
      // clusters are session-scoped, consistent with the plan's
      // "trajectories, ReasoningBank clusters, EWC++ anti-forgetting" being
      // driven by *this session's* training.
      await hydrateLoraSnapshot();
    } catch (_) { /* already logged inside loadSonaEngine */ }
    _tEnd('7_sona+loraSnapshot', _tSona);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => { try { flushPersist(); } catch (_) {} });
    }
    _tEnd('0_total_ready', _t0);
    _bootTimings._archiveSize = {
      brains: _brainMirror.size,
      tracks: _trackMirror.size,
      obs: _observations.size,
      dynamics: _dynamicsMirror.size,
    };
    console.log(`[ruvector] ready — brains=${_brainMirror.size} tracks=${_trackMirror.size} obs=${_observations.size}`);
    // One compact line so the full breakdown survives console truncation and
    // can be copy-pasted back for diagnosis.
    console.log('[boot-timings] ' + JSON.stringify(_bootTimings));
  })();
  return _ready;
}

function requireReady() {
  if (!_brainDB || !_trackDB || !_dynamicsDB || !_cnn) {
    throw new Error('ruvectorBridge: call await ready() before using the bridge');
  }
}

// P1.C — dynamics retrieval controls. UI owns the toggle; `setUseDynamics`
// flips the flag, `setQueryDynamicsVec` stages the current-generation vector
// the next recommendSeeds() call will use. Both are no-ops when the bridge
// isn't ready or dynamics archive is empty — the call-site can fire-and-forget.
export function setUseDynamics(on) { _useDynamics = !!on; }
export function isUsingDynamics() { return !!_useDynamics; }
export function setQueryDynamicsVec(vec) {
  _queryDynamicsVec = (vec instanceof Float32Array && vec.length === DYNAMICS_DIM) ? vec : null;
}

// ─── archive / retrieve ──────────────────────────────────────────────────────

export function archiveBrain(brain, fitness, trackVec, generation = 0, parentIds = [], fastestLap, dynamicsVec) {
  requireReady();
  const vec = flatten(brain);
  const trackId = trackVec ? upsertTrack(trackVec) : null;
  const dynamicsId = (dynamicsVec instanceof Float32Array && dynamicsVec.length === DYNAMICS_DIM)
    ? insertDynamics(dynamicsVec) : null;
  const lap = Number.isFinite(fastestLap) ? Number(fastestLap) : undefined;
  const meta = {
    fitness: Number(fitness) || 0,
    trackId,
    generation: generation | 0,
    parentIds: Array.isArray(parentIds) ? parentIds.slice() : [],
    timestamp: Date.now(),
  };
  if (lap !== undefined) meta.fastestLap = lap;
  // Only write dynamicsId when we actually got a vector. Older archives
  // without this field stay shape-compatible; recommendSeeds skips them
  // automatically because `!entry.meta.dynamicsId` → no lookup.
  if (dynamicsId !== null) meta.dynamicsId = dynamicsId;
  const id = _brainDB.insert(vec, null, meta);
  _brainMirror.set(id, { vector: vec, meta });
  // P3.B — incremental DAG add. Safe no-op when the dag wasm didn't load.
  // The DAG uses meta.parentIds to wire edges; unknown parents (not yet in
  // the mirror) are silently skipped — same relaxed contract as the legacy
  // walk, which just returns shorter trails when an ancestor is missing.
  try { dagAddBrain(id, meta); } catch (e) { console.warn('[lineage-dag] addBrain failed', e); }
  // Feed the LoRA reward signal: the most-recent adapt() input (cached inside
  // trackAdapter) is the gradient direction; fitness gates whether it fires.
  // No-op when the adapter isn't ready or `recommendSeeds` hasn't been called
  // yet for this track (no cached input).
  try { loraReward(meta.fitness); } catch (e) { console.warn('[lora] reward failed', e); }
  // P2.A — record the generation as a SONA trajectory step. The dynamics
  // vector (P1.C) is the natural "activations" signal for this step: it's
  // a fixed-dim summary of *how the car drove* during the generation, which
  // is exactly what SONA's REINFORCE gradient estimator wants from
  // TrajectoryStep.activations. When dynamicsVec is absent we fall through
  // to trackVec; when both are absent (very short runs) we skip the step.
  // The trajectory itself is framed by main.js on phase-4 enter/exit —
  // here we just append a step to whatever's currently open (no-op if
  // nothing's open).
  try {
    const stepActs = (dynamicsVec instanceof Float32Array) ? dynamicsVec
                    : (trackVec instanceof Float32Array) ? trackVec : null;
    if (stepActs && !_sonaPaused) sonaAddStep(stepActs, null, meta.fitness);
  } catch (e) { console.warn('[sona] step failed', e); }
  schedulePersist();
  return id;
}

// Dynamics vectors are deliberately *not* deduped: two runs on the same track
// by genuinely different brains will produce different trajectories, and the
// whole point of the dynamics key is "how this brain drove", not "what track
// this was". Each archiveBrain call gets its own dynamicsId.
function insertDynamics(dynamicsVec) {
  const id = _dynamicsDB.insert(dynamicsVec, null, { firstSeen: Date.now() });
  _dynamicsMirror.set(id, { vector: dynamicsVec, meta: { firstSeen: Date.now() } });
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

  // Decide reranker. The toggle policy (P4.A) takes precedence over
  // auto-mode thresholds, and the legacy _forceEma test override still pins
  // the decision to 'ema' when set (keeps gnn-replay.html deterministic).
  let useGnn = false;
  let skipRerank = false;
  if (_forceEma) {
    useGnn = false;
  } else if (_rerankerPolicy === 'none') {
    skipRerank = true;
  } else if (_rerankerPolicy === 'ema') {
    useGnn = false;
  } else if (_rerankerPolicy === 'gnn') {
    useGnn = gnnIsReady();
  } else { // 'auto'
    useGnn = gnnIsReady() && _brainMirror.size >= GNN_MIN_ARCHIVE;
  }
  const gnnMap = useGnn ? gnnScore(_brainMirror, candidates) : null;
  if (skipRerank) {
    _rerankerMode = 'none';
  } else if (useGnn && gnnMap) {
    _rerankerMode = 'gnn';
  } else {
    _rerankerMode = candidates.size > 0 ? 'ema' : 'none';
  }

  // P1.C — precompute dynamics similarity per brain when the toggle is on,
  // we have a staged query vector, and the dynamics archive is non-empty.
  // This runs one nearest-neighbour sweep against _dynamicsDB (instead of
  // per-brain lookups) so the cost stays O(K log N) where K is the archive
  // size. Brains without `meta.dynamicsId` (pre-P1.C archives) silently
  // score 0 on this term — their overall ranking just stays determined by
  // trackTerm × fitTerm × rerankTerm, same as before this phase shipped.
  const dynamicsSimMap = new Map(); // brainId -> dynamicsSim in [-1,1]
  const dynamicsActive = _useDynamics && _queryDynamicsVec && !_dynamicsDB.isEmpty();
  if (dynamicsActive) {
    const dHits = _dynamicsDB.search(_queryDynamicsVec, Math.min(_dynamicsMirror.size, 25));
    const hitMap = new Map();
    for (const h of dHits) hitMap.set(h.id, 1 - h.score);
    for (const [bid, entry] of _brainMirror) {
      const did = entry.meta && entry.meta.dynamicsId;
      if (did != null && hitMap.has(did)) dynamicsSimMap.set(bid, hitMap.get(did));
    }
  }

  const scored = [];
  for (const [bid, trackSim] of candidates) {
    const entry = _brainMirror.get(bid);
    const normFit = Math.tanh(((entry.meta && entry.meta.fitness) || 0) / 100);
    // Map cosine [-1,1] → [0,1] so negative sims don't flip sign of product.
    const trackTerm = 0.5 + 0.5 * trackSim;
    const fitTerm = 0.5 + 0.5 * normFit;
    let rerankTerm;
    if (skipRerank) {
      // P4.A — 'none' policy: no reranker term. Ordering falls back to pure
      // trackSim × fitness, useful for A/B comparisons that isolate the
      // retrieval geometry from the peer-pressure / EMA-boost terms.
      rerankTerm = 1;
    } else if (gnnMap && gnnMap.has(bid)) {
      rerankTerm = gnnMap.get(bid);
    } else {
      const obs = _observations.get(bid);
      const emaBoost = obs ? obs.weight : 0;
      rerankTerm = 1 + 0.3 * emaBoost;
    }
    const dynamicsSim = dynamicsSimMap.has(bid) ? dynamicsSimMap.get(bid) : 0;
    // Map cosine [-1,1] → [1 - W, 1 + W] so the term multiplicatively nudges
    // the composite score up for similar trajectories and down for opposite
    // ones, while leaving brains with no dynamics data at term = 1.
    const dynamicsTerm = dynamicsActive
      ? (1 + DYNAMICS_TERM_WEIGHT * dynamicsSim)
      : 1;
    scored.push({
      id: bid,
      vector: entry.vector,
      meta: entry.meta,
      score: trackTerm * fitTerm * rerankTerm * dynamicsTerm,
      trackSim,
      dynamicsSim,
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
  // P2.A — sonaEngineInfo returns { lora: {...}, sona: {...} } where the
  // LoRA sub-object has the same shape as the P1.B info() used to return.
  const engineInfo = sonaEngineInfo();
  const lora = engineInfo.lora;
  const sona = engineInfo.sona;
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
    // P2.A — SONA stats exposed to the UI panel. `trajectories` grows with
    // endTrajectory + per-step flushes inside sona/engine.js; `patterns` is
    // the ReasoningBank cluster count; `microUpdates` is a local counter
    // (each process_task call bumps one); `ewcLambda` is the config value
    // for the anti-catastrophic-forgetting regulariser. `trajectoryOpen`
    // flips true between begin/end so the panel can show "recording…".
    sona,
    // P1.C. `enabled` is the UI toggle state; `count` is how many archived
    // brains actually have a dynamics vector associated — that lets the
    // panel show "off" vs "on but no data yet" vs "on, N trajectories".
    dynamics: {
      enabled: !!_useDynamics,
      count: _dynamicsMirror.size,
      hasQuery: !!_queryDynamicsVec,
    },
    // P3.B — lineage DAG stats. `lineageDag.ready` is the canonical flag for
    // the viewer's "is the graph live?" check. `nodeCount` / `edgeCount` come
    // straight from the wasm side; `droppedEdges` is >0 only if malformed
    // parent ids somehow produced a cycle.
    lineageDag: dagInfo(),
    // P3.F — per-generation seed-source breakdown. `archive_recall` counts
    // slots filled from a ruvector similarity-search hit (elite + light + heavy
    // mutation slots in main.js). `localStorage_prior` counts slots filled from
    // a saved bestBrain when the bridge returned nothing. `random_init` counts
    // pure-random fallbacks (novel-car slots and cold-boot). `total` must
    // equal the population N; the UI asserts this and logs if it drifts.
    seedSources: {
      archive_recall: _lastSeedSources.archive_recall,
      localStorage_prior: _lastSeedSources.localStorage_prior,
      random_init: _lastSeedSources.random_init,
      total: _lastSeedSources.total,
      generation: _lastSeedSources.generation,
    },
    // P4.A — A/B policy snapshot so uiPanels can reflect + round-trip the
    // toggle strip state. `rerankerPolicy` is what the user picked;
    // `reranker` above is what recommendSeeds actually did on the last call.
    policy: {
      reranker: _rerankerPolicy,
      adapter: _adapterMode,
      dynamics: !!_useDynamics,
      // P3.A — live index kind, flipped by setIndexKind() or the
      // `?hhnsw=1` URL flag at init. `hyperbolicLoaded` tells the UI
      // whether the toggle is even usable (if the wasm fails to load we
      // keep the button disabled so clicks don't silently no-op).
      index: _indexKind,
      hyperbolicLoaded: isHyperbolicReady(),
    },
  };
}

// ─── P2.A SONA trajectory + pattern surface ──────────────────────────────
//
// Exposed here (rather than having main.js import sona/engine.js directly)
// so the no-build classic-script consumer route via window.__rvBridge keeps
// working without a second sidecar import. These are thin pass-throughs.
// When SONA isn't ready, they no-op silently — callers can fire-and-forget.

export function beginPhase4Trajectory(trackVec) {
  if (_sonaPaused) return null;
  try { return sonaBeginTrajectory(trackVec); } catch (e) { console.warn('[sona] begin failed', e); return null; }
}
export function addPhase4Step(activations, attention, stepReward) {
  if (_sonaPaused) return;
  try { sonaAddStep(activations, attention, stepReward); } catch (e) { console.warn('[sona] addStep failed', e); }
}
export function endPhase4Trajectory(finalFitness) {
  if (_sonaPaused) return null;
  try { return sonaEndTrajectory(finalFitness); } catch (e) { console.warn('[sona] endTrajectory failed', e); return null; }
}
export function findSimilarCircuits(trackVec, k = 5) {
  try { return sonaFindPatterns(trackVec, k); } catch (e) { console.warn('[sona] findPatterns failed', e); return []; }
}

// P3.B — lineage assembly. When the DAG wasm is loaded we route through
// lineage/dag.js (cycle-safe, O(depth) via JS-side adjacency); otherwise we
// fall back to the legacy in-function walk over _brainMirror. Both paths
// share the same contract: return [{id, fitness, generation}] oldest→newest,
// pick highest-fitness non-visited parent at each step, cap at maxDepth.
//
// Test-only override `_forceLegacyLineage` lets the equivalence harness
// capture both outputs from a single archive snapshot without tearing state
// down in between.
let _forceLegacyLineage = false;
export function setForceLegacyLineage(on) { _forceLegacyLineage = !!on; }

export function getLineage(id, maxDepth = 6) {
  if (!_forceLegacyLineage && dagIsReady()) {
    const t = dagGetLineage(id, maxDepth);
    if (t && t.length > 0) return t;
    // Empty result can legitimately mean "id unknown to the DAG" — fall
    // through to the legacy path, which also answers [] for unknown ids but
    // using the mirror as source of truth. This way the API never silently
    // mismatches between paths on brains that exist in the mirror but aren't
    // yet mirrored in the DAG (e.g. an archive hydrated before the wasm
    // finished loading).
  }
  return getLineageLegacy(id, maxDepth);
}

// Walk meta.parentIds backwards to assemble a lineage trail.
// At each step, when a brain has multiple parents, we pick the highest-fitness
// ancestor — that is "the line of descent we credit this genome to". Cycle-safe
// via a visited set; depth-capped so pathological graphs can't blow the stack.
// Returns entries oldest→newest (i.e. ancestor first, queried id last).
export function getLineageLegacy(id, maxDepth = 6) {
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

// P3.B — surface the DAG structure to the viewer panel. Returns `{nodes,
// edges}` or empty lists when the wasm isn't ready. Viewer keeps its last
// non-empty snapshot so it doesn't blank out during hot-reload races.
export function getLineageGraph() {
  if (!dagIsReady()) return { nodes: [], edges: [], droppedEdges: 0, ready: false };
  const snap = dagGetGraphSnapshot();
  snap.ready = true;
  return snap;
}
export function getLineageDagInfo() { return dagInfo(); }

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
      // DYNAMICS_STORE was added in IDB v3 (P1.C). One row per archived
      // dynamics vector, keyed by the _dynamicsDB-assigned id — mirrors the
      // brains/tracks store shape.
      if (!db.objectStoreNames.contains(DYNAMICS_STORE)) db.createObjectStore(DYNAMICS_STORE, { keyPath: 'id' });
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
    // Dynamics store only exists on IDB v3+, but even an older DB file that
    // upgraded through onupgradeneeded will now have the empty store — so
    // readAll is safe. Still, wrap in try/catch to be defensive against
    // partial upgrades from a crashed earlier session.
    let dynamicsRows = [];
    const _tIdb = _tStart();
    try { dynamicsRows = await readAll(db, DYNAMICS_STORE); } catch (_) { dynamicsRows = []; }
    const [brainRows, trackRows, obsRows] = await Promise.all([
      readAll(db, BRAINS_STORE),
      readAll(db, TRACKS_STORE),
      readAll(db, OBS_STORE),
    ]);
    _tEnd('3a_idb_readAll', _tIdb);
    _bootTimings._rowCounts = {
      brains: brainRows.length,
      tracks: trackRows.length,
      obs: obsRows.length,
      dynamics: dynamicsRows.length,
    };
    // Tracks first, so upsertTrack-dedup can reference them (not strictly needed
    // since we load by id, but keeps mirror/DB consistent).
    const _tTracks = _tStart();
    for (const row of trackRows) {
      const vec = toFloat32(row.vec);
      if (vec.length !== TRACK_DIM) continue;
      _trackDB.insert(vec, row.id, row.meta || {});
      _trackMirror.set(row.id, { vector: vec, meta: row.meta || {} });
    }
    _tEnd('3b_insert_tracks', _tTracks);
    // Dynamics second — brain meta references dynamicsId, so the mirror
    // being populated when brains hydrate means recommendSeeds can find the
    // match immediately. (Brain rows from pre-P1.C archives simply won't
    // have meta.dynamicsId set; that's the backwards-compat path.)
    const _tDyn = _tStart();
    for (const row of dynamicsRows) {
      const vec = toFloat32(row.vec);
      if (vec.length !== DYNAMICS_DIM) continue;
      _dynamicsDB.insert(vec, row.id, row.meta || {});
      _dynamicsMirror.set(row.id, { vector: vec, meta: row.meta || {} });
    }
    _tEnd('3c_insert_dynamics', _tDyn);
    const _tBrains = _tStart();
    for (const row of brainRows) {
      const vec = toFloat32(row.vec);
      if (vec.length !== FLAT_LENGTH) continue;
      _brainDB.insert(vec, row.id, row.meta || {});
      _brainMirror.set(row.id, { vector: vec, meta: row.meta || {} });
    }
    _tEnd('3d_insert_brains', _tBrains);
    const _tObs = _tStart();
    for (const row of obsRows) {
      _observations.set(row.id, { weight: row.weight || 0, count: row.count | 0 });
    }
    _tEnd('3e_insert_obs', _tObs);
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
      const tx = db.transaction([BRAINS_STORE, TRACKS_STORE, OBS_STORE, LORA_STORE, DYNAMICS_STORE], 'readwrite');
      const brains = tx.objectStore(BRAINS_STORE);
      const tracks = tx.objectStore(TRACKS_STORE);
      const obs = tx.objectStore(OBS_STORE);
      const lora = tx.objectStore(LORA_STORE);
      const dynamics = tx.objectStore(DYNAMICS_STORE);
      // Full rewrite keeps the logic simple; archive size stays small (hundreds
      // of entries, <100KB serialized) so the write cost is negligible.
      brains.clear();
      tracks.clear();
      obs.clear();
      lora.clear();
      dynamics.clear();
      for (const [id, { vector, meta }] of _brainMirror) {
        brains.put({ id, vec: Array.from(vector), meta });
      }
      for (const [id, { vector, meta }] of _trackMirror) {
        tracks.put({ id, vec: Array.from(vector), meta });
      }
      for (const [id, { vector, meta }] of _dynamicsMirror) {
        dynamics.put({ id, vec: Array.from(vector), meta });
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
  _dynamicsMirror.clear();
  _observations.clear();
  // P3.A — respect the current index kind when rebuilding from a fixture.
  // bench-hnsw.html calls setIndexKind('hyperbolic') before hydrateFromFixture
  // to exercise the hyperbolic path against the same archive.
  const IndexClass = pickIndexClass(_indexKind);
  _brainDB = new IndexClass(FLAT_LENGTH, 'cosine');
  _trackDB = new IndexClass(TRACK_DIM, 'cosine');
  _dynamicsDB = new IndexClass(DYNAMICS_DIM, 'cosine');
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
  // P3.B — rebuild the lineage DAG from scratch so its state matches the
  // just-hydrated mirror. Skipped silently when the wasm didn't load.
  try {
    if (dagIsReady()) {
      dagDebugReset();
      dagHydrateFromMirror(_brainMirror);
    }
  } catch (e) { console.warn('[lineage-dag] fixture rehydrate failed', e); }
}

// Danger-knob: purge everything. Exposed for the verifier + dev console; the
// game never calls this.
export async function _debugReset() {
  _brainMirror.clear();
  _trackMirror.clear();
  _dynamicsMirror.clear();
  _observations.clear();
  _queryDynamicsVec = null;
  sonaEngineDebugReset();
  try { dagDebugReset(); } catch (_) { /* safe to ignore */ }
  if (typeof indexedDB !== 'undefined') {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
}
