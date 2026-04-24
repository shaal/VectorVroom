// eli15/chapters/federation.js
// Phase 2A (F2) — real content. Explains why we ask two different
// nearest-neighbour indexes at once, why that needs over-requesting per
// shard, and how the GNN picks the final top-k from the union.
export default {
  id: 'federation',
  title: 'Asking two different maps of brain-space at once',
  oneLiner: 'The Euclidean and hyperbolic indexes disagree about who counts as a neighbour — so ask both, then let the GNN vote.',
  body: [
    '<p>VectorVroom has two different nearest-neighbour indexes over the',
    'same archive of brains: a <strong>Euclidean</strong> one and a',
    '<strong>hyperbolic</strong> one. They answer the same question —',
    '"who\'s most similar to this brain?" — in two different geometries.</p>',

    '<h3>Why the two indexes disagree</h3>',

    '<p>Euclidean space is flat. Distance is the ordinary straight-line',
    'measure. It\'s great at <em>geometric</em> similarity: two brains with',
    'similar weight vectors count as neighbours, regardless of where they',
    'sit in the lineage tree. A well-adapted brain for Track-A and a',
    'totally independent well-adapted brain for the same kind of Track-A',
    'will land next to each other even if they come from unrelated',
    'families.</p>',

    '<p>Hyperbolic space curves negatively. Distance grows exponentially',
    'as you move away from the origin, which is exactly how a tree grows:',
    'a parent has two children, each of those has two more, and very',
    'quickly you run out of "room" in Euclidean space but have plenty of',
    'it in hyperbolic. This geometry is the natural home for',
    '<em>hierarchical</em> similarity. Sibling brains — close cousins in',
    'the lineage DAG — stay close, even when their weights have drifted.',
    'Descendants of the same high-fitness ancestor cluster tightly the',
    'way branches of a tree do.</p>',

    '<p>So when you ask "who looks like this brain?", the two indexes can',
    'legitimately hand back different lists. Both lists are right — they',
    'just answer different questions. Federation is the decision to stop',
    'picking one and instead ask both, then combine.</p>',

    '<h3>The over-request trick</h3>',

    '<p>If we ask each index for the top <code>k</code> and union the',
    'results, the union has <em>at most</em> <code>2k</code> items but',
    'some of the true global top-<code>k</code> are almost certainly',
    'sitting just outside each shard\'s top-<code>k</code>. So we over-',
    'request:</p>',

    '<p><code>k\' = k + ⌈√(k · ln S)⌉</code></p>',

    '<p>where <code>S</code> is the number of shards. For our setup',
    '(<code>k=10, S=2</code>):</p>',

    '<p><code>k\' = 10 + ⌈√(10 · ln 2)⌉ = 10 + ⌈√6.93⌉ = 10 + 3 = 13</code></p>',

    '<p>So each shard returns its top 13; we union those into a set that\'s',
    'between 13 and 26 entries. The classical-bound argument (due to the',
    'federated-retrieval literature) says the union then contains the true',
    'global top-<code>k</code> with high probability. The exact √ term is',
    'the union-bound slack — just enough to cover the "I missed a real',
    'neighbour by one slot" case.</p>',

    '<h3>Union, dedup, rerank</h3>',

    '<p>The union is the raw list of candidates from all shards. Two',
    'things matter there:</p>',

    '<ul>',
    '  <li><strong>Dedup via F5 hash.</strong> A brain that exists in both',
    '      indexes (which is always — they\'re two views of the same',
    '      archive) will surface from both shards, but the hash of its',
    '      flattened weights is identical. We use <code>hashBrain</code>',
    '      (xxHash32 over the Float32 bytes) as the canonical key so the',
    '      union counts that brain once, not twice. The viewer tracks',
    '      "dedupe hits" per query — that counter climbs when both shards',
    '      agreed on a neighbour.</li>',
    '  <li><strong>GNN rerank over the union.</strong> The Graph Neural',
    '      Network reranker (see "how the GNN reranker works") already',
    '      knows how to score candidates using lineage edges and node',
    '      features. Under federation it runs on the <em>union</em>',
    '      instead of a single-shard top-<code>k</code>. Same rerank,',
    '      bigger input. The final ordering reflects both geometries',
    '      simultaneously.</li>',
    '</ul>',

    '<h3>How this composes with other features</h3>',

    '<p>Federation isn\'t a standalone mode — it layers over the 1C',
    'consistency controls and the 1D dedup. In <strong>eventual</strong>',
    'mode the TTL cache memoises the <em>final</em> top-<code>k</code>',
    'after rerank, not the per-shard results, so a cached federated query',
    'is still exactly the answer you\'d get by running the whole pipeline.',
    'In <strong>frozen</strong> mode the archive-pin filter applies to the',
    'union: a brain archived after you froze will not appear in federated',
    'results even if a shard surfaces it. And the F5 dedup is what makes',
    'the union mergeable in the first place — without content hashes, the',
    'same brain under two different shard-local ids would double-count.</p>',

    '<h3>Turn it on</h3>',

    '<p>Click the <strong>🌐 Federation</strong> toggle in the Vector',
    'Memory panel, or load the page with <code>?federation=1</code>. The',
    'split-screen viewer shows each shard\'s top-<code>k\'</code> and the',
    'final unioned + reranked top-<code>k</code> side-by-side so you can',
    'see the disagreement and the resolution.</p>',
  ].join('\n'),
};
