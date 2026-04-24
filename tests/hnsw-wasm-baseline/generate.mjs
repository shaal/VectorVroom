// generate.mjs — deterministic baseline for the current FlatIndex behavior
// of the ruvector WASM build. Imported by build.mjs and verify.mjs.
//
// Why this exists: plan docs/plan/ruvector-hnsw-in-wasm.md swaps the wasm
// fallback from FlatIndex to a true HNSW backend. HNSW is approximate, so
// we pin the exact top-K FlatIndex emits today and later assert the HNSW
// swap preserves recall@5 ≥ 0.95 against this baseline.
//
// Loads the vendored wasm via initSync + readFileSync so the baseline is
// reproducible from Node with no dev server.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import initWasm, { VectorDB } from '../../vendor/ruvector/ruvector_wasm/ruvector_wasm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dirname, '../../vendor/ruvector/ruvector_wasm/ruvector_wasm_bg.wasm');

export const BRAIN_DIM = 244;    // matches brainCodec.FLAT_LENGTH (TOPOLOGY [10,16,4])
export const TRACK_DIM = 512;    // matches ruvectorBridge TRACK_DIM
export const DYNAMICS_DIM = 64;  // matches ruvectorBridge DYNAMICS_DIM
export const N_PER_DB = 300;
export const N_QUERIES = 20;
export const K = 5;

// mulberry32 — identical to tests/fixtures/build-fixtures.mjs so seeding
// semantics stay consistent across the repo.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeUnitVec(rand, dim) {
  const v = new Float32Array(dim);
  let sum = 0;
  for (let i = 0; i < dim; i++) { v[i] = rand() * 2 - 1; sum += v[i] * v[i]; }
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

// Brain vectors are NOT unit-normalised in the real bridge — brainCodec
// flatten() just emits raw weights. Cosine distance is scale-invariant so
// the index sorts the same way either way, but we match production shape.
function makeRawVec(rand, dim) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rand() * 2 - 1;
  return v;
}

function padId(prefix, i) { return prefix + String(i).padStart(4, '0'); }

function buildCorpus(seed, dim, prefix, normalise) {
  const rand = mulberry32(seed);
  const entries = [];
  for (let i = 1; i <= N_PER_DB; i++) {
    const vec = normalise ? makeUnitVec(rand, dim) : makeRawVec(rand, dim);
    entries.push({ id: padId(prefix, i), vec });
  }
  return entries;
}

function buildQueries(seed, dim, normalise) {
  const rand = mulberry32(seed);
  const qs = [];
  for (let i = 0; i < N_QUERIES; i++) {
    qs.push(normalise ? makeUnitVec(rand, dim) : makeRawVec(rand, dim));
  }
  return qs;
}

// Round a score to a fixed decimal representation so JSON diffs don't
// trip on trailing-ULP jitter between runs. 9 digits is more than enough
// resolution to detect real reordering; cosine distance is [0, 2].
function roundScore(s) {
  return Number(s.toFixed(9));
}

function runSection({ db, corpus, queries }) {
  for (const { id, vec } of corpus) {
    db.insert(vec, id, null);
  }
  const results = queries.map((q, qi) => {
    const hits = db.search(q, K, null);
    return {
      queryIndex: qi,
      topK: hits.map(h => ({ id: h.id, score: roundScore(h.score) })),
    };
  });
  return results;
}

export async function generateBaseline() {
  const wasmBytes = readFileSync(WASM_PATH);
  // Modern wasm-bindgen API wants an options object; passing raw bytes
  // still works but logs a "deprecated parameters" warning.
  await initWasm({ module_or_path: wasmBytes });

  // Distinct seeds per section keeps vectors independent across DBs while
  // staying deterministic. Query seeds are offset by +1000 so query vecs
  // aren't identical to corpus vecs (the top-1 match would then be trivial).
  const brainCorpus    = buildCorpus(11, BRAIN_DIM, 'B', /* normalise */ false);
  const trackCorpus    = buildCorpus(22, TRACK_DIM, 'T', true);
  const dynamicsCorpus = buildCorpus(33, DYNAMICS_DIM, 'D', true);

  const brainQueries    = buildQueries(1011, BRAIN_DIM, false);
  const trackQueries    = buildQueries(1022, TRACK_DIM, true);
  const dynamicsQueries = buildQueries(1033, DYNAMICS_DIM, true);

  // Match bridge construction at ruvectorBridge.js:202-204 — two args,
  // which means use_hnsw defaults to true on the Rust side and the core
  // logs the "HNSW requested but not available" warning before falling
  // back to FlatIndex. That is exactly the behavior we are baselining.
  const brainDB    = new VectorDB(BRAIN_DIM, 'cosine');
  const trackDB    = new VectorDB(TRACK_DIM, 'cosine');
  const dynamicsDB = new VectorDB(DYNAMICS_DIM, 'cosine');

  const brain    = runSection({ db: brainDB, corpus: brainCorpus, queries: brainQueries });
  const track    = runSection({ db: trackDB, corpus: trackCorpus, queries: trackQueries });
  const dynamics = runSection({ db: dynamicsDB, corpus: dynamicsCorpus, queries: dynamicsQueries });

  return {
    _doc: {
      description: 'FlatIndex top-K baseline for the ruvector wasm build. See docs/plan/ruvector-hnsw-in-wasm.md P0.',
      nPerDb: N_PER_DB,
      nQueries: N_QUERIES,
      k: K,
      backend: 'FlatIndex (wasm fallback; HNSW requested but not available)',
      scoreMetric: 'cosine distance (0 = identical, 2 = opposite)',
      scoreRounding: '9 decimal places',
    },
    brain,
    track,
    dynamics,
  };
}

export function stableStringify(obj) {
  // Match JSON.stringify(..., 2) with stable key ordering. Our payload is
  // already in a fixed insertion order, so this is belt-and-braces.
  return JSON.stringify(obj, null, 2) + '\n';
}
