// dynamicsEmbedder.js
// P1.C — Temporal sensor trajectory embedding.
//
// Records a per-frame 8-channel trajectory for the current best car and
// reduces it, on demand, to a fixed 64-dim "dynamics vector" that describes
// *how* the car drove the track — not just what the track looks like.
//
// Channels (fixed order; index = meaning):
//   0..4  — ray offsets (0 = wall touching, 1 = nothing in front) × 5 rays
//   5     — signed speed (speed / maxSpeed), range [-0.5, 1]
//   6     — steering     (-1 left, 0 centred, +1 right)
//   7     — throttle     (-1 reverse, 0 coast, +1 forward)
//
// The upstream `ruvector-temporal-tensor-wasm` crate would have been the
// compression engine for this data. See
// `vendor/ruvector/ruvector_temporal_tensor_wasm/VENDORED.md` for why we
// ship a pure-JS reducer here instead — short version: the wasm crate has
// only raw C FFI, and for a browser-local archive of a few hundred brains
// the JS-side summary statistics give equivalent behaviour at zero cost.
//
// Integration:
//   - main.js calls recordFrame(bestCar) once per phase-4 tick.
//   - main.js calls finalizeVector() inside nextBatch(); the returned
//     Float32Array(64) (or null if no frames were captured) is forwarded
//     to ruvectorBridge.archiveBrain().
//   - main.js also calls queryVector() at begin() time to pass the
//     *currently-running* rolling trajectory into recommendSeeds() when the
//     dynamics toggle is on.

const CHANNELS = 8;
const DIMS_PER_CHANNEL = 8; // 8 stats (see STATS below) → 64-dim total
export const DYNAMICS_DIM = CHANNELS * DIMS_PER_CHANNEL;

// Ring buffer size. 60fps × 30s = 1800 frames max; we clip here so long runs
// don't blow memory. A full lap on the default track is ~400–700 frames so
// 1800 is plenty of headroom for the best-car's-fastest-lap use case.
const MAX_FRAMES = 1800;

// Channel state — flat Float32Array for cache locality. Each channel takes
// a contiguous MAX_FRAMES slice, so we can compute per-channel stats with
// simple linear scans and no interleaving.
let _buffer = null;        // Float32Array(CHANNELS * MAX_FRAMES)
let _frameCount = 0;
let _owningCar = null;     // identity guard — resets when bestCar changes

function ensureBuffer() {
  if (_buffer) return;
  _buffer = new Float32Array(CHANNELS * MAX_FRAMES);
}

// Public: reset everything. Called from main.js on nextBatch() after the
// vector is finalised, and via _debugReset for test harnesses.
export function reset() {
  _frameCount = 0;
  _owningCar = null;
  // Don't reallocate the buffer — zeroing the active slice is enough and keeps
  // GC pressure off the phase-4 frame path. If _frameCount is left low, the
  // stale tail won't be read.
}

// Public: record one frame for the current best car. No-ops when the car has
// no sensor yet (e.g. a DUMMY car in the physics-preview phase) or the car is
// damaged (damaged cars stop updating; the frames they'd produce are all
// zeros, which would bias toward "stationary against a wall").
export function recordFrame(car) {
  if (!car || !car.sensor || !Array.isArray(car.sensor.readings)) return;
  if (car.damaged) return;
  ensureBuffer();

  // bestCar identity check — when main.js swaps bestCar to a new leader, we
  // discard the old trajectory. The dynamics of an old leader don't describe
  // "how this brain drove this track"; we want the trajectory of the brain
  // we're about to archive.
  if (_owningCar !== car) {
    _owningCar = car;
    _frameCount = 0;
  }

  if (_frameCount >= MAX_FRAMES) return; // silently clip

  const f = _frameCount;
  const readings = car.sensor.readings;
  const rayCount = car.sensor.rayCount | 0;

  // Rays: stored as {offset: 0..1, ...} or null. null → 1.0 ("nothing in front").
  // We emit exactly 5 channels — if rayCount ever changes, shorter input
  // pads with 1.0 and longer input is silently truncated. Keeps the embedding
  // shape stable even if the sensor config shifts.
  for (let i = 0; i < 5; i++) {
    let v = 0.0;
    if (i < rayCount) {
      const r = readings[i];
      if (r && typeof r.offset === 'number') {
        v = 1 - r.offset; // wall-close = 1.0, wall-far = 0.0 — matches car.js's NN-input convention
      }
    }
    _buffer[i * MAX_FRAMES + f] = v;
  }

  // Speed: signed, normalised. maxSpeed is on the car so different preset
  // speeds don't pollute the embedding.
  const maxSpeed = (typeof car.maxSpeed === 'number' && car.maxSpeed > 0) ? car.maxSpeed : 8;
  const speedNorm = Math.max(-1, Math.min(1, (car.speed || 0) / maxSpeed));
  _buffer[5 * MAX_FRAMES + f] = speedNorm;

  // Steering signal derived from controls. Controls are booleans; we fold
  // them into a signed scalar so mean/std carry interpretable signal ("does
  // this brain swerve a lot?" is the std, "does it favour one side?" is the mean).
  const c = car.controls || {};
  const steer = (c.left ? -1 : 0) + (c.right ? 1 : 0);
  const throttle = (c.forward ? 1 : 0) + (c.reverse ? -1 : 0);
  _buffer[6 * MAX_FRAMES + f] = steer;
  _buffer[7 * MAX_FRAMES + f] = throttle;

  _frameCount = f + 1;
}

// Compute per-channel statistics. `out` is a length-DYNAMICS_DIM Float32Array
// that we write into directly (avoids allocation on the hot path when the
// panel ticks). Returns out.
function computeFeatures(out) {
  const n = _frameCount;
  if (n === 0) { out.fill(0); return out; }

  for (let ch = 0; ch < CHANNELS; ch++) {
    const base = ch * MAX_FRAMES;

    // Running stats: mean, min, max.
    let sum = 0;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = _buffer[base + i];
      sum += v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const mean = sum / n;

    // Std, mean|Δ|, max|Δ|. Δ is frame-to-frame difference — this is where
    // "smooth driver vs wobbly driver" shows up.
    let varSum = 0;
    let diffSum = 0;
    let diffMax = 0;
    let diffs = 0;
    let prev = _buffer[base];
    for (let i = 0; i < n; i++) {
      const v = _buffer[base + i];
      const d = v - mean;
      varSum += d * d;
      if (i > 0) {
        const dd = Math.abs(v - prev);
        diffSum += dd;
        if (dd > diffMax) diffMax = dd;
        diffs += 1;
      }
      prev = v;
    }
    const std = Math.sqrt(varSum / n);
    const meanDiff = diffs > 0 ? (diffSum / diffs) : 0;

    // Quantiles via sort. 1800-frame worst case is cheap (micros). We
    // allocate a throwaway copy so we don't mutate the ring buffer.
    const scratch = new Float32Array(n);
    for (let i = 0; i < n; i++) scratch[i] = _buffer[base + i];
    scratch.sort();
    const p25 = scratch[Math.min(n - 1, Math.floor(n * 0.25))];
    const p75 = scratch[Math.min(n - 1, Math.floor(n * 0.75))];

    // Order matches DIMS_PER_CHANNEL = 8. Changing the order is a silent
    // persistence break — old dynamics vectors in IndexedDB would be
    // compared against a differently-ordered query vector.
    const o = ch * DIMS_PER_CHANNEL;
    out[o + 0] = mean;
    out[o + 1] = std;
    out[o + 2] = mn;
    out[o + 3] = mx;
    out[o + 4] = meanDiff;
    out[o + 5] = diffMax;
    out[o + 6] = p25;
    out[o + 7] = p75;
  }
  return out;
}

function l2Normalise(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  const norm = Math.sqrt(n);
  if (norm > 1e-9) {
    const inv = 1 / norm;
    for (let i = 0; i < vec.length; i++) vec[i] *= inv;
  }
  return vec;
}

// Public: drop the recorded trajectory to a 64-dim vector. Returns null when
// no frames were captured (e.g. a failed batch where the best car never
// updated a sensor), so callers can skip the archive-side insert entirely.
// Does NOT reset() — keep that explicit so callers control the lifecycle.
export function finalizeVector() {
  if (_frameCount === 0) return null;
  const out = new Float32Array(DYNAMICS_DIM);
  computeFeatures(out);
  return l2Normalise(out);
}

// Public: same as finalizeVector but safe to call at any time for the
// *currently running* trajectory. Distinct entry point so "query from
// mid-training" and "finalise this run" are visibly different operations
// even though the math is the same today.
export function queryVector() {
  if (_frameCount === 0) return null;
  const out = new Float32Array(DYNAMICS_DIM);
  computeFeatures(out);
  return l2Normalise(out);
}

// Public introspection for the UI panel.
export function info() {
  return {
    frameCount: _frameCount,
    channels: CHANNELS,
    dim: DYNAMICS_DIM,
  };
}

// Test-only: forcibly clear state (incl. the owner guard) for deterministic
// test harnesses. The game never calls this.
export function _debugReset() { reset(); }
