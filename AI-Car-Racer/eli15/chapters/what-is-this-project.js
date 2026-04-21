// eli15/chapters/what-is-this-project.js
// The framing chapter. Every other chapter hangs off this one.
export default {
  id: 'what-is-this-project',
  title: 'What is this project even doing?',
  oneLiner: 'A browser-based genetic-algorithm racer with a vector-memory bridge.',
  body: [
    '<p>This is a car racing game where nobody writes the driving logic by hand. Each',
    'car has a tiny neural network — 92 floating-point numbers, arranged as a',
    '<code>6 → 8 → 4</code> topology — that reads from sensors (rays poking out of the car)',
    'and decides which pedals and steering to press. At the start of training the',
    'networks are <em>random</em>, so the cars drive like drunk toddlers. A few make it a',
    'little further than the others. Those are the "winners" of the generation.</p>',
    '<p>A <strong>genetic algorithm</strong> breeds the next generation from the winners: copy the best',
    'brain, then randomly nudge some weights (that\'s "mutation"). Over many generations,',
    'brains that stay on the road win, brains that don\'t die out, and the surviving',
    'population gets better at the track. No gradients, no backprop — just "whoever drives',
    'furthest gets to be a parent".</p>',
    '<p>The <strong>vector-memory bridge</strong> sits on top of the GA. When you finish training on one',
    'track, the bridge archives the best brain plus a 512-dimensional "fingerprint" of the',
    'track shape. Next time you train on a <em>different</em> track, the bridge asks: "have I seen',
    'a track that looks like this before?" and warm-starts the new population with copies of',
    'the brains that did well on the most similar past tracks. That\'s why the system gets',
    'faster at learning new tracks the more tracks you\'ve played.</p>',
    '<p>Everything runs in the browser. No server, no backend, no API calls. The neural',
    'networks, the CNN that makes the track fingerprints, and the nearest-neighbour search',
    'are all WebAssembly modules vendored into the repo.</p>',
  ].join('\n'),
  diagram: [
    '<pre class="eli15-ascii">',
    '  random brains  →  race on track  →  score each car by fitness',
    '        ▲                                     │',
    '        │                                     ▼',
    '   next generation  ←  mutate + breed  ←  pick the best',
    '                                              │',
    '                                              ▼',
    '                                   archive best brain',
    '                                   + track fingerprint',
    '                                              │',
    '                                              ▼',
    '                              (used to seed future tracks)',
    '</pre>',
  ].join('\n'),
  related: [
    // Forward-references to chapters that will ship in P0.B. They are
    // listed here so the link appears the moment the target chapter is
    // registered — no edit to this file needed.
    'genetic-algorithm',
    'neural-network',
    'cnn-embedder',
    'vectordb-hnsw',
  ],
};
