// quantization/index.js
// Phase 1B (F1) — public surface for the 1-bit quantizer.
//
// Consumers (F2 federation, future Phase 2A) should import from this file
// rather than reaching directly into rabitq.js or hadamard.js. Keeps the
// internal module layout refactorable without a caller-wide rename.

export {
  quantize,
  hammingDistance,
  estimatedCosine,
  estimatedCosineDistance,
  memoryFootprint,
  RESIDUAL_DIM,
} from './rabitq.js';

export {
  nextPow2,
  padToPow2,
  fwht,
  fwhtOrthonormal,
  hadamardRotate,
} from './hadamard.js';
