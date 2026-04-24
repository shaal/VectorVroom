// eli15/chapters/cross-tab-federation.js
// Placeholder — real content ships with Phase 2B (F6).
export default {
  id: 'cross-tab-federation',
  title: 'Two browser tabs training in sync',
  oneLiner: 'Open two tabs on different tracks; each discovers a good brain, the other tab sees it arrive in real time.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 2B of the RuLake-inspired roadmap.</em></p>',
    '<p>Once every brain is content-addressed by a hash (F5) and every archive',
    'can be serialized as a snapshot (F3), sharing a brain between two tabs',
    'becomes a one-line broadcast: <code>BroadcastChannel.postMessage({ brain,',
    'hash })</code>. The receiving tab computes the hash, sees it\'s new, inserts.</p>',
    '<p>No locking, no conflicts — because <em>content-addressing makes the',
    'identity of a brain independent of where it was created</em>. Two tabs',
    'arriving at the same weights produce the same hash and converge for free.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 2B.</p>',
  ].join('\n'),
};
