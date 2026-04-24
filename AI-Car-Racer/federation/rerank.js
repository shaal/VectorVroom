// federation/rerank.js — Phase 2A (F2)
//
// Union the per-shard fan-out results into a single candidate list, keyed by
// content hash (so the same brain surfacing from both shards collapses to one
// node), and select a final top-k from a reranked candidate map.
//
// API:
//   unionByHash(shardResults, hashLookup)
//     → { candidates: [{id, shards: [name, ...], bestScore, hash}],
//         dedupeHits: number }
//
//     `shardResults` is the return value of fanOut(): an array of
//       {name, kPrime, results: [{id, score, ...}]}.
//     `hashLookup(id)` is a callback the caller provides to translate a brain
//     id → content hash string. Returning `null`/`undefined` means "no hash
//     known" (pre-dedup brain); we fall back to the id itself as the dedup
//     key so the candidate still makes it through.
//
//   selectTopK(candidates, scoreMap, k)
//     → [{id, score, shards, hash}, ...]  (length ≤ k, sorted desc by score)
//
//     `candidates` is the union list from unionByHash. `scoreMap` is a
//     Map<id, number> — typically the GNN-rerank output (the bridge already
//     consumes `gnnScore` this way). Ids missing from scoreMap fall back to
//     their `bestScore` from the union so we never silently drop a candidate.

// Merge per-shard results into a deduped candidate list.
//
// Dedup policy: we key by hash when we can compute one, else by id. Two
// shards surfacing the *same brain id* always collapse even without a hash,
// because id == id; two shards surfacing *different ids for the same
// content* (e.g. hyperbolic's hb_N vs euclidean's numeric id) collapse via
// the hash path when hashLookup resolves both to the same digest.
export function unionByHash(shardResults, hashLookup) {
  const byKey = new Map(); // key → candidate
  let dedupeHits = 0;
  const hLookup = typeof hashLookup === 'function' ? hashLookup : () => null;

  for (const shard of (shardResults || [])) {
    const shardName = (shard && shard.name) || 'shard';
    const hits = (shard && Array.isArray(shard.results)) ? shard.results : [];
    for (const hit of hits) {
      if (!hit || hit.id == null) continue;
      const id = String(hit.id);
      let hash = null;
      try { hash = hLookup(id); } catch (_) { hash = null; }
      const key = hash || id;
      // Prefer the "closest" result per hash: lower score = closer
      // (VectorDB convention — cosine distance). We carry bestScore
      // for tie-break / fallback ordering when the GNN doesn't
      // supply a score.
      const score = Number.isFinite(hit.score) ? hit.score : 1;
      const prev = byKey.get(key);
      if (prev) {
        dedupeHits += 1;
        if (!prev.shards.includes(shardName)) prev.shards.push(shardName);
        if (score < prev.bestScore) {
          prev.bestScore = score;
          // Keep the id from whichever shard had the closer score so the
          // downstream mirror lookup uses the id the bridge actually knows.
          prev.id = id;
        }
      } else {
        byKey.set(key, {
          id,
          hash: hash || null,
          shards: [shardName],
          bestScore: score,
        });
      }
    }
  }

  return { candidates: Array.from(byKey.values()), dedupeHits };
}

// Pick the final top-k from a reranked union. `scoreMap` is treated as
// "higher is better" (matches gnnScore's output, which returns values in
// roughly [0.7, 1.3] where higher ranks first). Candidates missing from
// scoreMap fall back to -bestScore (lower distance → higher rank) so the
// ordering is still sensible if the GNN didn't run.
export function selectTopK(candidates, scoreMap, k) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const kk = Math.max(1, k | 0);
  const out = candidates.map((c) => {
    let s;
    if (scoreMap && typeof scoreMap.get === 'function' && scoreMap.has(c.id)) {
      s = scoreMap.get(c.id);
    } else {
      s = -Number(c.bestScore || 0);
    }
    return { id: c.id, hash: c.hash, shards: c.shards.slice(), score: s };
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, kk);
}
