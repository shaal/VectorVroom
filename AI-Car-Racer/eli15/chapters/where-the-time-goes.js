// eli15/chapters/where-the-time-goes.js
// Placeholder — real content ships with Phase 3A (F7).
export default {
  id: 'where-the-time-goes',
  title: 'Where each generation\'s milliseconds actually go',
  oneLiner: 'HNSW traversal, GNN rerank, LoRA adapt, sensor embedding, GA ops — a flame-graph-lite of the whole pipeline.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 3A of the RuLake-inspired roadmap.</em></p>',
    '<p>Every generation is a lot of work under the hood: retrieve neighbours,',
    'rerank with the GNN, adapt the query vector with LoRA, embed sensor',
    'readings, run the GA. The observability panel breaks each down into a',
    'live stacked bar so you can see which stage is actually expensive —',
    'which is a surprisingly good way to build intuition for how ML pipelines',
    'trade quality for latency.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 3A.</p>',
  ].join('\n'),
};
