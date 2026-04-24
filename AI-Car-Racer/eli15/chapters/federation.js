// eli15/chapters/federation.js
// Placeholder — real content ships with Phase 2A (F2).
export default {
  id: 'federation',
  title: 'Asking two different maps of brain-space at once',
  oneLiner: 'The Euclidean and hyperbolic indexes disagree about who counts as a neighbour — so ask both, then let the GNN vote.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 2A of the RuLake-inspired roadmap.</em></p>',
    '<p>VectorVroom already has two nearest-neighbour indexes: a flat',
    'Euclidean one (good for geometric track similarity) and a hyperbolic',
    'one (good for lineage-like hierarchical similarity). Today you pick one',
    'at load time via <code>?hhnsw=1</code>. Federation runs both, unions',
    'their candidates, and lets the GNN reranker pick the final order.</p>',
    '<p>The clever part is how many candidates to ask each index for: the',
    'formula <code>k\' = k + ⌈√(k · ln S)⌉</code> (with <code>S</code> = number of shards)',
    'over-requests just enough from each that the true top-k is almost',
    'certainly somewhere in the union.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 2A.</p>',
  ].join('\n'),
};
