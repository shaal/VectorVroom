// quantization/hadamard.js
// Phase 1B (F1) — Fast Walsh-Hadamard Transform (FWHT).
//
// Why a Hadamard rotation before we take sign bits: the sign-bit trick
// (RaBitQ / SimHash) assumes each axis of the input carries roughly the
// same amount of information. Raw brain weights don't — bias slots, first
// layer weights, and output weights have wildly different scales and
// correlations. A Hadamard rotation is a cheap orthonormal mixing matrix
// that (a) preserves inner products, (b) spreads energy evenly across all
// axes, and (c) has no parameters to learn or store. After rotation, the
// sign bit of each axis is ~equally informative, which is exactly what the
// 1-bit Hamming-distance estimator needs.
//
// The transform runs in O(D log D) using the butterfly pattern, in place.
// D must be a power of 2, so we pad the input (244 → 256 for VectorVroom's
// FLAT_LENGTH) with zeros. Zero-padding is orthonormal-safe because zero
// components contribute nothing to the inner product pre- or post-rotation.

// Next power-of-two ≥ n. For n ≤ 0, returns 1 (edge case; we never call
// this with a non-positive length in practice).
export function nextPow2(n) {
  if (n <= 1) return 1;
  return 1 << Math.ceil(Math.log2(n));
}

// Zero-pad `src` up to `paddedLen` and return a new Float32Array. If
// src.length === paddedLen we still copy so callers can mutate freely.
export function padToPow2(src, paddedLen = nextPow2(src.length)) {
  const out = new Float32Array(paddedLen);
  out.set(src);
  return out;
}

// In-place iterative Fast Walsh-Hadamard Transform.
// Input: Float32Array of length D, where D is a power of 2.
// Output: the same array, transformed. Unnormalized.
//
// The butterfly pattern: for each block size h = 1, 2, 4, …, D/2, pair
// elements (i, i+h) inside each block of size 2h and apply the 2×2
// Hadamard matrix [[1, 1], [1, -1]].
export function fwht(vec) {
  const n = vec.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fwht: length must be a power of 2, got ${n}`);
  }
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const a = vec[j];
        const b = vec[j + h];
        vec[j] = a + b;
        vec[j + h] = a - b;
      }
    }
  }
  return vec;
}

// Orthonormal FWHT — divides by sqrt(D) so the transform preserves the
// L2 norm (and therefore cosine similarity is invariant). The plain fwht
// above inflates the norm by sqrt(D); for the sign-bit quantizer we don't
// care about magnitude (only sign), so callers that only need the sign can
// skip the normalization.
export function fwhtOrthonormal(vec) {
  fwht(vec);
  const scale = 1 / Math.sqrt(vec.length);
  for (let i = 0; i < vec.length; i++) vec[i] *= scale;
  return vec;
}

// Convenience: pad `src` to the next pow2 and run fwht in place on the
// padded copy. Returns the padded, transformed array.
export function hadamardRotate(src) {
  const paddedLen = nextPow2(src.length);
  const padded = padToPow2(src, paddedLen);
  fwht(padded);
  return padded;
}
