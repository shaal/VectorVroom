// archive/hash.js
// Phase 0 — Foundations. xxHash32 over a flattened Float32Array brain,
// returned as an 8-char lowercase hex string. Used as the canonical brain ID
// by F3 (warm-restart bundles), F5 (content-addressed dedup), and F6
// (cross-tab — hash makes "is this the same brain?" a byte comparison).
//
// Why xxHash32 and not crypto.subtle.digest(): we need to hash on the hot
// path during GA evaluation (potentially thousands per second), and the
// crypto API is async-only. xxHash32 is non-cryptographic but
// collision-resistant enough for a browser archive of ≤10⁵ brains — the
// collision worry at 10⁵ entries in a 2³² space is ~1 in 1000, which we
// detect cheaply by comparing the underlying flat bytes on collision.
//
// Reference impl: https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md

const PRIME32_1 = 0x9e3779b1 | 0;
const PRIME32_2 = 0x85ebca77 | 0;
const PRIME32_3 = 0xc2b2ae3d | 0;
const PRIME32_4 = 0x27d4eb2f | 0;
const PRIME32_5 = 0x165667b1 | 0;

function rotl32(x, r) { return ((x << r) | (x >>> (32 - r))) | 0; }
function mul32(a, b) { return Math.imul(a, b) | 0; }

// Hash a Uint8Array into an unsigned 32-bit integer.
export function xxHash32Bytes(bytes, seed = 0) {
  const len = bytes.length;
  let h32;
  let i = 0;

  if (len >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) | 0;
    let v2 = (seed + PRIME32_2) | 0;
    let v3 = (seed + 0) | 0;
    let v4 = (seed - PRIME32_1) | 0;

    while (i + 16 <= len) {
      const k1 = bytes[i] | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24);
      const k2 = bytes[i+4] | (bytes[i+5] << 8) | (bytes[i+6] << 16) | (bytes[i+7] << 24);
      const k3 = bytes[i+8] | (bytes[i+9] << 8) | (bytes[i+10] << 16) | (bytes[i+11] << 24);
      const k4 = bytes[i+12] | (bytes[i+13] << 8) | (bytes[i+14] << 16) | (bytes[i+15] << 24);
      v1 = mul32(rotl32((v1 + mul32(k1, PRIME32_2)) | 0, 13), PRIME32_1);
      v2 = mul32(rotl32((v2 + mul32(k2, PRIME32_2)) | 0, 13), PRIME32_1);
      v3 = mul32(rotl32((v3 + mul32(k3, PRIME32_2)) | 0, 13), PRIME32_1);
      v4 = mul32(rotl32((v4 + mul32(k4, PRIME32_2)) | 0, 13), PRIME32_1);
      i += 16;
    }

    h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) | 0;
  } else {
    h32 = (seed + PRIME32_5) | 0;
  }

  h32 = (h32 + len) | 0;

  while (i + 4 <= len) {
    const k = bytes[i] | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24);
    h32 = mul32(rotl32((h32 + mul32(k, PRIME32_3)) | 0, 17), PRIME32_4);
    i += 4;
  }

  while (i < len) {
    h32 = mul32(rotl32((h32 + mul32(bytes[i], PRIME32_5)) | 0, 11), PRIME32_1);
    i++;
  }

  h32 ^= h32 >>> 15;
  h32 = mul32(h32, PRIME32_2);
  h32 ^= h32 >>> 13;
  h32 = mul32(h32, PRIME32_3);
  h32 ^= h32 >>> 16;

  return h32 >>> 0;
}

// Hash a Float32Array (a flattened brain) into an 8-char lowercase hex string.
export function hashBrain(flat, seed = 0) {
  const bytes = new Uint8Array(flat.buffer, flat.byteOffset, flat.byteLength);
  const h = xxHash32Bytes(bytes, seed);
  return h.toString(16).padStart(8, '0');
}
