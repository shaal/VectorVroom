// eli15/chapters/content-addressing.js
// Placeholder — real content ships with Phase 1D (F5).
export default {
  id: 'content-addressing',
  title: 'Giving every brain a fingerprint',
  oneLiner: 'Two brains with identical weights are the same brain — so ID them by a hash of their contents, not an auto-incrementing number.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 1D of the RuLake-inspired roadmap.</em></p>',
    '<p>Genetic algorithms produce a lot of near-duplicate brains: an elite',
    'survives unchanged across generations, siblings share most of their',
    'weights, mutations sometimes come up identical. Today each one gets a',
    'fresh ID and sits as a separate node in the lineage DAG.</p>',
    '<p>If we instead ID a brain by a <strong>hash</strong> of its weights,',
    'duplicates collide automatically — importing the same archive twice',
    'becomes a no-op, the family tree stops double-counting, and cross-tab',
    'sharing (F6) becomes conflict-free because every tab agrees on what',
    '"the same brain" means.</p>',
    '<p>We use xxHash32 instead of SHA-256 because this runs on the hot path',
    'during training; cryptographic strength isn\'t needed for a collision-',
    'detection scheme that falls back to a bytes-equal check.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 1D.</p>',
  ].join('\n'),
};
