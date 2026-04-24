// archive/dedup.js
// Phase 1D — F5: Content-addressed dedup.
//
// Two brains with identical flattened weights should collapse to a single
// canonical node rather than creating duplicates in the archive and lineage
// DAG. We key every brain by `hashBrain(flat)` (xxHash32 hex — see
// archive/hash.js for why xxHash and not crypto.subtle), remember the first
// id we saw for each hash, and report duplicates back to callers so they can
// increment a visible "×N" badge / stat instead of adding a new node.
//
// This module is purely in-memory state: it's rebuilt from scratch every page
// load. Persistence happens downstream (lineage DAG, IDB archive); here we
// only answer "have I seen this flat before?" for the current session.
//
// API
//   maybeInsert(flat, fallbackId)
//     → { inserted: true,  canonicalId: hash }
//     → { inserted: false, canonicalId: hash, firstSeenId: <existing id> }
//     On `inserted: false` we also bump the duplicate counter the caller can
//     read via `stats()` for the "% duplicates" panel.
//
//   stats()                     → { total, duplicates, duplicateRatio }
//   _debugReset()               — test hook; wipes the table.

import { hashBrain } from './hash.js';

// hash → { firstSeenId, duplicateCount }
// duplicateCount counts *additional* sightings past the first — so a brain
// seen three times has duplicateCount=2. total sightings = 1 + duplicateCount.
let _table = new Map();
let _totalInserts = 0;       // every maybeInsert call (first + repeats)
let _duplicateInserts = 0;   // only the repeats

// Idempotent insert keyed by the content hash of `flat`. `fallbackId` is the
// id the caller would have used (usually a per-session counter or the meta's
// pre-hash id); we remember it as `firstSeenId` the first time we see a hash
// so later duplicate sightings can point back to the canonical node.
export function maybeInsert(flat, fallbackId) {
  if (!flat || typeof flat.buffer === 'undefined') {
    throw new Error('archive/dedup.maybeInsert: flat must be a Float32Array');
  }
  const hash = hashBrain(flat);
  _totalInserts += 1;
  const existing = _table.get(hash);
  if (existing) {
    existing.duplicateCount += 1;
    _duplicateInserts += 1;
    return { inserted: false, canonicalId: hash, firstSeenId: existing.firstSeenId };
  }
  _table.set(hash, { firstSeenId: fallbackId != null ? String(fallbackId) : hash, duplicateCount: 0 });
  return { inserted: true, canonicalId: hash };
}

// Lookup without mutating counts — useful for "is this hash already known?"
// questions (import path uses this to skip rows we've already archived).
export function has(hash) {
  return _table.has(hash);
}

// Inspect the entry for a hash (or undefined). Returned object is live — do
// not mutate externally. Kept read-only by convention.
export function get(hash) {
  return _table.get(hash);
}

// Aggregate stats for the "% duplicates" training-panel readout.
// duplicateRatio is over insert *attempts*, not unique brains — matches the
// user-facing framing "of the last N brains we tried to archive, X% were
// already known".
export function stats() {
  const total = _totalInserts;
  const duplicates = _duplicateInserts;
  return {
    total,
    duplicates,
    duplicateRatio: total === 0 ? 0 : duplicates / total,
  };
}

// Test-only. Wipes every counter and the table itself.
export function _debugReset() {
  _table = new Map();
  _totalInserts = 0;
  _duplicateInserts = 0;
}
