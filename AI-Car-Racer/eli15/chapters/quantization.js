// eli15/chapters/quantization.js
// Placeholder — real content ships with Phase 1B (F1).
export default {
  id: 'quantization',
  title: 'Throwing away 31 out of every 32 bits and still finding the right neighbour',
  oneLiner: 'A brain\'s fingerprint is hundreds of decimal numbers. RaBitQ keeps only the sign bit of each and barely loses any accuracy.',
  comingSoon: true,
  body: [
    '<p><em>Coming soon — lands with Phase 1B of the RuLake-inspired roadmap.</em></p>',
    '<p>Every brain gets squashed into a vector of ~92 floating-point numbers.',
    'A float is 32 bits. Multiply by 5,000 brains and the archive is megabytes',
    'of RAM. Is all of that precision doing useful work?</p>',
    '<p>Turns out: no. If you first <strong>rotate</strong> the vectors with a',
    'trick called a Hadamard transform, then keep only the <strong>sign bit</strong>',
    'of each component (positive → 1, negative → 0), the Hamming distance',
    'between two bitstrings is a provably unbiased estimate of the angle',
    'between the original vectors. The archive shrinks 32× and recall stays',
    'within 10% of the full-float baseline.</p>',
    '<p>Same idea as SimHash, applied to HNSW candidates.</p>',
    '<p>Progress: see <code>docs/plan/rulake-inspired-features.md</code> →',
    'Phase 1B.</p>',
  ].join('\n'),
};
