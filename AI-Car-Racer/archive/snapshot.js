// archive/snapshot.js
// Phase 0 — Foundations. Single source of truth for the on-disk shape of a
// VectorVroom archive bundle. Consumed by F3 (warm-restart), F4 (frozen
// consistency mode), F5 (content-addressed dedup), F6 (cross-tab) — each of
// those features is a Phase 1/2 swarm task; this file exists so those tasks
// don't each invent their own shape.
//
// No runtime behaviour yet — this module only defines the shape, a version
// constant, and a validator. Serializer + deserializer land in F3 (1A).

export const ARCHIVE_SCHEMA_VERSION = 1;

// Valid values for snapshot.consistency. Mirrors the F4 taxonomy.
export const CONSISTENCY_MODES = ['fresh', 'eventual', 'frozen'];

// Shape documented here rather than as TypeScript since the project is pure
// JS. Treat this as the contract — adding fields is fine (readers must
// tolerate unknown keys); renaming/removing fields requires a version bump.
//
//   ArchiveSnapshot = {
//     version: 1,
//     createdAt: ISO-8601 string,
//     consistency: 'fresh' | 'eventual' | 'frozen',
//     brains: [{
//       id:        string,            // stable hash (see archive/hash.js)
//       flat:      Float32Array,      // FLAT_LENGTH weights
//       meta:      object,            // fitness, generation, trackId, etc.
//       parentIds: string[],          // lineage edges (hash IDs)
//     }],
//     hnsw: {
//       // Either 'serialized' (preferred once ruvector_wasm exposes it) or
//       // 'replay' (fallback: deterministic re-insertion by insertion order).
//       mode: 'serialized' | 'replay',
//       // When mode === 'serialized': the raw bytes ruvector_wasm emits.
//       serialized: Uint8Array | null,
//       // When mode === 'replay': the insertion order of brain IDs; the
//       // importer re-inserts in this exact order to reproduce the graph.
//       insertionOrder: string[] | null,
//       params: { dim: number, metric: 'cosine' | 'l2', indexKind: 'euclidean' | 'hyperbolic' },
//     },
//     witness: string,   // sha-256 hex of (brains bytes + hnsw bytes); anti-tamper anchor
//   }
//
// `witness` is intentionally *not* a cryptographic authentication token — it's
// a self-check so a corrupted download fails loudly at import rather than
// silently at query time. Matches RuLake's "witness chain" idea adapted to
// the browser where we have no trust root to sign against.

export function emptySnapshot(consistency = 'fresh') {
  return {
    version: ARCHIVE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    consistency,
    brains: [],
    hnsw: { mode: 'replay', serialized: null, insertionOrder: [], params: {} },
    witness: '',
  };
}

// Cheap structural validator. Returns { ok: true } or { ok: false, reason }.
// Deliberately permissive about unknown keys (forward-compat); strict about
// the fields any reader depends on.
export function validateSnapshot(s) {
  if (!s || typeof s !== 'object') return { ok: false, reason: 'not-object' };
  if (s.version !== ARCHIVE_SCHEMA_VERSION) {
    return { ok: false, reason: `version-mismatch: got ${s.version}, expected ${ARCHIVE_SCHEMA_VERSION}` };
  }
  if (!Array.isArray(s.brains)) return { ok: false, reason: 'brains-not-array' };
  if (!s.hnsw || typeof s.hnsw !== 'object') return { ok: false, reason: 'hnsw-missing' };
  if (s.hnsw.mode !== 'serialized' && s.hnsw.mode !== 'replay') {
    return { ok: false, reason: `hnsw.mode invalid: ${s.hnsw.mode}` };
  }
  if (!CONSISTENCY_MODES.includes(s.consistency)) {
    return { ok: false, reason: `consistency invalid: ${s.consistency}` };
  }
  return { ok: true };
}
