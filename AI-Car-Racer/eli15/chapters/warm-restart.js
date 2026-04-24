// eli15/chapters/warm-restart.js
// Placeholder — real content ships with Phase 1A (F3).
export default {
  id: 'warm-restart',
  title: 'Saving and reopening the whole brain archive',
  oneLiner: 'A brain archive is a museum — you can save it, reopen it tomorrow, or give the whole museum to a friend.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 1A of the RuLake-inspired roadmap.</em></p>',
    '<p>Today the archive rebuilds itself from IndexedDB every page load. Every',
    'brain is re-inserted into HNSW one by one, which is fine at 50 brains',
    'and painful at 5,000. The fix is to save the graph\'s state <em>itself</em>,',
    'not just the raw vectors, and restore it byte-for-byte on the next load —',
    'the same way your laptop reopens yesterday\'s tabs instead of rebuilding',
    'them from scratch.</p>',
    '<p>Bonus: once the archive is a file, you can share it. Export the',
    'archive, send the file to a friend, and their site will race against your',
    'pre-trained population on the first generation.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 1A.</p>',
  ].join('\n'),
};
