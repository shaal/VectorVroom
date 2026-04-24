// quantization/rabitq.js
// Phase 1B (F1) — RaBitQ-style 1-bit quantizer.
//
// Pipeline:
//   1. Pad the input Float32Array to the next power of 2 (FLAT_LENGTH=244 → 256).
//   2. Rotate via Hadamard (hadamard.js) so energy is spread evenly.
//   3. Take the sign bit of each rotated component → 1 bit per dim.
//   4. Pack into a Uint32Array (D/32 words — 256/32 = 8 words, 32 bytes).
//   5. Stash a small float residual (RESIDUAL_DIM floats) so a rerank pass
//      can pull back the float tail when we need tighter ranking.
//
// Distance primitives:
//   - hammingDistance(a, b): popcount of XOR. Range [0, D].
//   - estimatedCosine(a, b): uses the sign-bit → angle relationship.
//     For rotated, mean-zero inputs the expected Hamming distance between
//     two hashes is (D / π) · θ where θ is the angle between originals.
//     So estimatedCosine = cos(π · hamming / D). This is the standard
//     SimHash / RaBitQ recovery formula.
//
// Determinism: the Hadamard matrix is data-independent, so quantize(v) is
// a pure function of v. No RNG, no training, no per-dataset codebook.

import { nextPow2, padToPow2, fwht } from './hadamard.js';

// Size of the float residual we keep alongside the 1-bit code. This is NOT
// the top-k rerank set — it's a small fingerprint of the rotated vector's
// first RESIDUAL_DIM coordinates, which a future reranker can use to break
// ties among Hamming-equidistant candidates. 16 floats × 4 bytes = 64 B.
// Combined with the 32 B bit-code that's 96 B/brain vs. 244×4 = 976 B for
// the float baseline — ~10× shrink including the residual, ~30× without.
export const RESIDUAL_DIM = 16;

// Public: quantize a Float32Array of arbitrary length.
// Returns { packed: Uint32Array, residual: Float32Array, rotatedDim }.
// `rotatedDim` is the padded length (a power of 2) so the consumer knows
// how many bits are meaningful.
export function quantize(flat) {
  const rotatedDim = nextPow2(flat.length);
  const rotated = padToPow2(flat, rotatedDim);
  fwht(rotated);

  const wordCount = rotatedDim >>> 5; // D/32
  const packed = new Uint32Array(wordCount);
  for (let i = 0; i < rotatedDim; i++) {
    // sign bit: positive (including +0) → 1, negative → 0. JS -0 has the
    // sign bit set but compares === 0; we explicitly treat 0 as positive
    // so the output is deterministic regardless of input sign-of-zero.
    if (rotated[i] >= 0) {
      packed[i >>> 5] |= 1 << (i & 31);
    }
  }

  const residualLen = Math.min(RESIDUAL_DIM, rotatedDim);
  const residual = new Float32Array(residualLen);
  for (let i = 0; i < residualLen; i++) residual[i] = rotated[i];

  return { packed, residual, rotatedDim };
}

// popcount of a 32-bit integer (Wegner / Kernighan-style fused variant).
function popcount32(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24);
}

// Hamming distance between two packed Uint32Array codes. Undefined if
// lengths differ — caller is responsible for matching rotatedDim.
export function hammingDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`hammingDistance: length mismatch ${a.length} vs ${b.length}`);
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += popcount32(a[i] ^ b[i]);
  }
  return d;
}

// Estimated cosine from Hamming distance. Inverse of the sign-bit / angle
// relationship: Hamming/D ≈ θ/π ⇒ θ ≈ π · H/D ⇒ cos(θ) ≈ cos(π · H/D).
// Returns a value in [-1, 1]; identical codes give cos(0)=1; antipodal
// codes (all bits flipped) give cos(π)=-1.
export function estimatedCosine(a, b, rotatedDim = a.length * 32) {
  const h = hammingDistance(a, b);
  return Math.cos(Math.PI * h / rotatedDim);
}

// Convenience: estimated cosine distance = 1 - estimatedCosine.
export function estimatedCosineDistance(a, b, rotatedDim = a.length * 32) {
  return 1 - estimatedCosine(a, b, rotatedDim);
}

// Memory footprint per vector in bytes, excluding JS object overhead.
// Useful for the viewer's "memory meter". Returns { bits, packedBytes,
// residualBytes, totalBytes, floatBaselineBytes, compressionRatio }.
export function memoryFootprint(originalLen) {
  const rotatedDim = nextPow2(originalLen);
  const packedBytes = (rotatedDim >>> 5) * 4;
  const residualBytes = Math.min(RESIDUAL_DIM, rotatedDim) * 4;
  const totalBytes = packedBytes + residualBytes;
  const floatBaselineBytes = originalLen * 4;
  return {
    bits: rotatedDim,
    packedBytes,
    residualBytes,
    totalBytes,
    floatBaselineBytes,
    compressionRatio: floatBaselineBytes / totalBytes,
    bitOnlyRatio: floatBaselineBytes / packedBytes,
  };
}
