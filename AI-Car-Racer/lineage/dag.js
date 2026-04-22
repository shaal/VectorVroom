// lineage/dag.js — P3.B
// Shadow the `ruvector_dag_wasm` WasmDag crate with our own JS-side adjacency
// store so lineage queries are O(depth) and decoupled from _brainMirror.
//
// Why both? The Rust crate gives us a cycle-safe DAG (add_edge rejects cycles),
// topo sort, and a serialisable structure we can reuse in the viewer. But it
// doesn't expose per-node neighbours, so for the O(depth) `getLineage()` walk
// we mirror the edges in a JS `childToParents: Map<idx, number[]>` table. The
// WasmDag stays authoritative for structural invariants; the JS side is the
// hot-path query cache.
//
// Public API:
//   loadDag()            — async. Resolves when wasm is live (or null on fail).
//   isReady()            — sync. Did the wasm module load?
//   addBrain(id, meta)   — incremental add. Idempotent on duplicate id.
//   getLineage(id, max)  — walk best-fitness parent backwards. Same semantics
//                          as the legacy bridge path so the equivalence test
//                          passes on identical inputs.
//   hydrateFromMirror(m) — rebuild from Map<id, {vector, meta}> (used once on
//                          boot, after ruvectorBridge.hydrate() populates the
//                          mirror from IndexedDB).
//   getGraphSnapshot()   — { nodes: [{id, fitness, generation}], edges }. Used
//                          by lineage/viewer.js.
//   info()               — { ready, nodeCount, edgeCount, droppedEdges }.
//   _debugReset()        — test-only: wipe state and recreate the WasmDag.
//
// Failure mode: if the wasm module fails to load the bridge continues to use
// its legacy in-function traversal — this module's `isReady()` stays false and
// every other call becomes a no-op (or an empty-result return). Same pattern
// as gnnReranker.js.

let _dagReady = null;
let _dagMod = null;
let _dag = null;                 // WasmDag instance
let _idToIdx = new Map();        // string brain id → u32 slot in the DAG
let _idxToId = [];               // reverse lookup by slot index
let _nodeMeta = [];              // [{ fitness, generation, parentIds: string[] }]
let _childToParents = new Map(); // childIdx → number[] (parent indices)
let _droppedEdges = 0;           // edges rejected by WasmDag's cycle check

// Load + init the DAG wasm module. Resolves to a truthy handle when ready,
// or null if loading fails. Safe to call multiple times.
export function loadDag() {
  if (_dagReady) return _dagReady;
  _dagReady = (async () => {
    try {
      const mod = await import('../../vendor/ruvector/ruvector_dag_wasm/ruvector_dag_wasm.js');
      await mod.default();
      _dagMod = mod;
      _dag = new mod.WasmDag();
      return { mod: _dagMod, dag: _dag };
    } catch (e) {
      console.warn('[lineage-dag] load failed; legacy getLineage fallback will be used', e);
      _dagMod = null;
      _dag = null;
      return null;
    }
  })();
  return _dagReady;
}

export function isReady() {
  return !!(_dagMod && _dag);
}

// Append one brain to the DAG. Idempotent: calling twice with the same id is
// a no-op (returns the existing slot). Parent edges are added for every pid
// that's already been seen; unknown parents are ignored (same relaxed policy
// as the legacy walk — missing parents just don't show up in lineage).
export function addBrain(id, meta) {
  if (!isReady()) return -1;
  if (!id) return -1;

  const existing = _idToIdx.get(id);
  if (existing !== undefined) return existing;

  const fitness = Number((meta && meta.fitness)) || 0;
  const generation = Number((meta && meta.generation)) || 0;
  const parentIds = Array.isArray(meta && meta.parentIds) ? meta.parentIds.slice() : [];

  // op=0: we only have one node kind (brain). cost=fitness so critical_path()
  // picks out the high-fitness spine if we ever call it. The u32 return is
  // the index we'll use for edge construction.
  const idx = _dag.add_node(0, fitness);
  _idToIdx.set(id, idx);
  _idxToId[idx] = id;
  _nodeMeta[idx] = { fitness, generation, parentIds };

  const myParents = [];
  for (const pid of parentIds) {
    const pidx = _idToIdx.get(pid);
    if (pidx === undefined) continue; // unknown parent — match legacy behavior
    const ok = _dag.add_edge(pidx, idx);
    if (ok) {
      myParents.push(pidx);
    } else {
      // WasmDag rejected the edge (cycle). Should never fire for well-formed
      // archive data; log loudly if it does.
      _droppedEdges += 1;
      console.warn('[lineage-dag] dropped cycle-creating edge', pid, '→', id);
    }
  }
  _childToParents.set(idx, myParents);
  return idx;
}

// Equivalence contract (see tests/lineage-dag-equivalence.html):
// Returns [{id, fitness, generation}] oldest→newest. At each step picks the
// non-visited parent with the highest fitness; depth-capped at maxDepth.
// Mirrors ruvectorBridge.getLineageLegacy() so a per-brain diff can assert
// structural identity on a seeded archive.
export function getLineage(id, maxDepth = 6) {
  if (!isReady()) return [];
  const startIdx = _idToIdx.get(id);
  if (startIdx === undefined) return [];

  const cap = Math.max(1, maxDepth | 0);
  const seen = new Set();
  const trail = [];
  let cur = startIdx;

  while (cur !== undefined && cur !== -1 && !seen.has(cur) && trail.length < cap) {
    const meta = _nodeMeta[cur];
    if (!meta) break;
    seen.add(cur);
    trail.push({
      id: _idxToId[cur],
      fitness: meta.fitness,
      generation: meta.generation,
    });
    const parents = _childToParents.get(cur) || [];
    let best = -1;
    let bestFit = -Infinity;
    for (const pidx of parents) {
      if (seen.has(pidx)) continue;
      const pm = _nodeMeta[pidx];
      if (!pm) continue;
      if (pm.fitness > bestFit) { bestFit = pm.fitness; best = pidx; }
    }
    cur = best === -1 ? undefined : best;
  }
  return trail.reverse();
}

// One-shot rebuild from a mirror Map<id, {vector, meta}>. Called by the bridge
// after hydrate() populates _brainMirror. Two-pass: first register every node
// so parent edges can reference future ids; second pass adds the edges. This
// is necessary because IDB-restored entries come back in insertion order but
// `parentIds` is recorded eagerly at archive time, so a brain may reference a
// parent whose addBrain() hasn't run yet in the rebuild loop.
export function hydrateFromMirror(mirror) {
  if (!isReady()) return;
  if (!mirror || typeof mirror.values !== 'function') return;

  // Pass 1: register nodes only (parentIds stored for pass 2).
  for (const [id, entry] of mirror) {
    if (_idToIdx.has(id)) continue;
    const meta = (entry && entry.meta) || {};
    const fitness = Number(meta.fitness) || 0;
    const generation = Number(meta.generation) || 0;
    const parentIds = Array.isArray(meta.parentIds) ? meta.parentIds.slice() : [];
    const idx = _dag.add_node(0, fitness);
    _idToIdx.set(id, idx);
    _idxToId[idx] = id;
    _nodeMeta[idx] = { fitness, generation, parentIds };
    _childToParents.set(idx, []);
  }

  // Pass 2: connect edges. Deliberately skip the WASM _dag.add_edge() path
  // here — it runs DFS-based cycle detection per insert, which is O(V+E)
  // worst-case and grew to ~56s on a 2392-brain archive (all cost, no
  // benefit: the WASM DAG is write-only — nothing ever queries it; all
  // query paths read the JS shadow _childToParents with a seen-set for
  // cycle safety).
  //
  // JS-side cycle rejection uses a generation-monotonicity check: a parent
  // strictly older than its child can never close a cycle in a DAG where
  // generation is the partial order. Ties and backwards edges (same or
  // newer parent) are rejected, matching the intent of the original WASM
  // guard while running in O(1) per edge.
  const dropsBefore = _droppedEdges;
  for (const [id] of mirror) {
    const idx = _idToIdx.get(id);
    if (idx === undefined) continue;
    const meta = _nodeMeta[idx];
    if (!meta) continue;
    const myParents = [];
    for (const pid of meta.parentIds) {
      const pidx = _idToIdx.get(pid);
      if (pidx === undefined) continue;
      const pmeta = _nodeMeta[pidx];
      if (!pmeta) { _droppedEdges += 1; continue; }
      if (pmeta.generation < meta.generation) {
        myParents.push(pidx);
      } else {
        _droppedEdges += 1;
      }
    }
    _childToParents.set(idx, myParents);
  }
  const dropped = _droppedEdges - dropsBefore;
  if (dropped > 0) {
    console.debug('[lineage-dag] hydrate dropped', dropped, 'cycle edge(s)');
  }
}

// Snapshot the DAG structure for the viewer. Returns lightweight plain objects
// so rendering code doesn't need to know about the wasm types. Fitness +
// generation are read from the JS meta table (not the DAG's f32 cost) so the
// numbers match what the stats panel shows — no precision round-trip.
export function getGraphSnapshot() {
  if (!isReady()) {
    return { nodes: [], edges: [], droppedEdges: _droppedEdges };
  }
  const nodes = [];
  for (let i = 0; i < _idxToId.length; i++) {
    const meta = _nodeMeta[i];
    if (!meta) continue;
    nodes.push({
      id: _idxToId[i],
      idx: i,
      fitness: meta.fitness,
      generation: meta.generation,
    });
  }
  const edges = [];
  for (const [childIdx, parents] of _childToParents) {
    const childId = _idxToId[childIdx];
    if (!childId) continue;
    for (const pidx of parents) {
      const parentId = _idxToId[pidx];
      if (parentId) edges.push({ from: parentId, to: childId });
    }
  }
  return { nodes, edges, droppedEdges: _droppedEdges };
}

export function info() {
  return {
    ready: isReady(),
    nodeCount: isReady() ? _dag.node_count() : 0,
    edgeCount: isReady() ? _dag.edge_count() : 0,
    droppedEdges: _droppedEdges,
  };
}

// Test-only. Recreates the WasmDag (free the old one if wasm supports it) and
// clears every piece of JS-side shadow state. The bridge's _debugReset() calls
// this so a page-level reset fully returns the lineage DAG to cold.
export function _debugReset() {
  _idToIdx = new Map();
  _idxToId = [];
  _nodeMeta = [];
  _childToParents = new Map();
  _droppedEdges = 0;
  if (_dagMod) {
    try { if (_dag && typeof _dag.free === 'function') _dag.free(); } catch (_) { /* ignore */ }
    _dag = new _dagMod.WasmDag();
  }
}
