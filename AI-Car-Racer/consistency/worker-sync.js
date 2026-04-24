// consistency/worker-sync.js
// Phase 1C (F4) — helper for propagating a frozen snapshot to an A/B
// baseline worker. The actual postMessage wiring into sim-worker.js is
// a follow-up polish item (see TODO below); this file exists so future
// work has a clear, callable consumer.
//
// The plan's A/B-mode motivation: when the primary pin is in `frozen`,
// a parallel baseline worker must start from the exact same archive
// snapshot — otherwise the baseline wanders and the A/B delta is
// meaningless. This helper computes the payload a future consumer
// would postMessage to the baseline worker:
//
//   { type: 'freeze', snapshot: /* ArchiveSnapshot */ }
//
// TODO (post-1C): wire this into main.js's `spawnB()` path. The
// sim-worker already has a minimal `case 'freeze'` hook (see
// sim-worker.js onmessage) that will call importSnapshot +
// setConsistencyMode('frozen') once the worker side has a bridge
// adapter available.

import { getMode, getFrozenSnapshot } from './mode.js';

// Returns a payload suitable for postMessage to a baseline sim-worker.
// When not in frozen mode, returns null — callers use that as "no sync
// needed" (the worker either runs its own fresh queries or stays
// bridgeless, matching current A/B behaviour).
//
// `exportFn` is the bridge's exportSnapshot() function, passed in so
// this helper stays free of a direct bridge import cycle. Typical call
// site: `computeFrozenSyncPayload(bridge.exportSnapshot)`.
export function computeFrozenSyncPayload(exportFn) {
  if (getMode() !== 'frozen') return null;
  // Prefer the frozen snapshot reference if the bridge stashed one at
  // freeze time — that's the exact view queries were pinned to, so a
  // downstream worker runs against the identical data. Fall back to a
  // fresh exportSnapshot() if the frozen ref isn't a full snapshot
  // (e.g. the bridge's cap-by-insertionOrder shortcut stores only a
  // count + id set — fine for the primary, insufficient for a worker
  // that needs the actual vectors to query).
  let snapshot = getFrozenSnapshot();
  const looksLikeSnapshot = snapshot && Array.isArray(snapshot.brains) && snapshot.hnsw;
  if (!looksLikeSnapshot && typeof exportFn === 'function') {
    try { snapshot = exportFn(); } catch (e) {
      console.warn('[consistency/worker-sync] exportSnapshot failed', e);
      return null;
    }
  }
  if (!snapshot) return null;
  return { type: 'freeze', snapshot };
}

// Convenience wrapper that imports the bridge lazily at call time. Only
// useful in contexts where main.js has already populated
// window.__rvBridge (i.e. the UI thread). Workers should use
// computeFrozenSyncPayload directly with their own exportFn.
export function computeFrozenSyncPayloadFromGlobal() {
  if (typeof window === 'undefined' || !window.__rvBridge) return null;
  return computeFrozenSyncPayload(window.__rvBridge.exportSnapshot);
}
