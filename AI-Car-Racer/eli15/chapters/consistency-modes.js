// eli15/chapters/consistency-modes.js
// Placeholder — real content ships with Phase 1C (F4).
export default {
  id: 'consistency-modes',
  title: 'Fresh, Eventual, Frozen — three ways training looks at the archive',
  oneLiner: 'Should training re-query the archive every generation, periodically, or lock in a snapshot? Each answer is a different mode.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 1C of the RuLake-inspired roadmap.</em></p>',
    '<p>Every generation, the training loop asks the archive "who does this',
    'track look like, and which brains worked on those tracks?" But that',
    'question doesn\'t have one right answer.</p>',
    '<ul>',
    '  <li><strong>Fresh</strong> — re-ask every generation. Always current,',
    '      but results can wobble as new brains land in the archive mid-run.</li>',
    '  <li><strong>Eventual</strong> — cache the answer, re-ask every N',
    '      generations. Faster and steadier.</li>',
    '  <li><strong>Frozen</strong> — lock in a snapshot at the start of the',
    '      run; ignore new additions entirely. Best for A/B comparisons where',
    '      two workers need to see exactly the same archive.</li>',
    '</ul>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 1C.</p>',
  ].join('\n'),
};
