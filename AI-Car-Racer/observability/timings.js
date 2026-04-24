// observability/timings.js — Phase 3A (F7) per-stage timing histograms.
//
// A tiny in-memory ring-buffer per stage, plus a generation cursor. The
// bridge wraps its hot-path sub-stages (retrieve, federate, rerank,
// adapt, dynamics, misc) with startStage / endStage; panel.js polls
// snapshot() and renders a stacked bar + numeric table.
//
// Zero external deps; uses performance.now() if available, else
// Date.now() as a fallback (only meaningful on cold boot). The module is
// deliberately decoupled from ruvectorBridge so tests can exercise it
// without booting wasm.

const DEFAULT_WINDOW = 20;

const _stages = new Map(); // name -> { buf: Float64Array, head, count, starts }
let _window = DEFAULT_WINDOW;
let _lastGen = -1;

const _now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? () => performance.now()
  : () => Date.now();

function _ensureStage(name) {
  let st = _stages.get(name);
  if (!st) {
    st = {
      buf: new Float64Array(_window),
      head: 0,   // next write slot
      count: 0,  // number of valid samples (capped at _window)
      lastMs: 0,
      // Stack of start times so nested startStage/endStage on the same
      // label works (rare, but try/finally correctness demands it).
      starts: [],
    };
    _stages.set(name, st);
  }
  return st;
}

export function startStage(name) {
  const st = _ensureStage(name);
  st.starts.push(_now());
}

export function endStage(name) {
  const st = _stages.get(name);
  if (!st || st.starts.length === 0) return 0;
  const t0 = st.starts.pop();
  const dt = _now() - t0;
  _pushSample(st, dt);
  return dt;
}

export function record(name, ms) {
  const st = _ensureStage(name);
  _pushSample(st, Number(ms) || 0);
}

function _pushSample(st, ms) {
  st.buf[st.head] = ms;
  st.head = (st.head + 1) % st.buf.length;
  if (st.count < st.buf.length) st.count += 1;
  st.lastMs = ms;
}

// Copy the valid samples out of the ring in chronological order. Only
// used by snapshot(); cheap because _window is small (default 20).
function _samples(st) {
  const out = new Array(st.count);
  const cap = st.buf.length;
  const start = (st.head - st.count + cap) % cap;
  for (let i = 0; i < st.count; i++) out[i] = st.buf[(start + i) % cap];
  return out;
}

function _p95(samples) {
  if (samples.length === 0) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  // Nearest-rank p95 — with small N the "proper" interpolated estimator
  // is noisier than this. Matches the smoke-test claim `p95Ms >= 20`.
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx];
}

export function snapshot() {
  const stages = {};
  for (const [name, st] of _stages) {
    const samples = _samples(st);
    let total = 0;
    for (let i = 0; i < samples.length; i++) total += samples[i];
    const avg = samples.length > 0 ? total / samples.length : 0;
    stages[name] = {
      count: samples.length,
      totalMs: total,
      avgMs: avg,
      lastMs: st.lastMs,
      p95Ms: _p95(samples),
    };
  }
  return {
    stages,
    window: _window,
    lastGen: _lastGen,
  };
}

export function setGeneration(gen) {
  // Generation cursor is a read-only counter the panel uses to show
  // "window is N gens" context. We do NOT reset histograms on gen
  // change — the ring buffer IS the moving window. Resetting would
  // kill the p95 the moment a new gen started.
  _lastGen = (gen | 0);
}

export function setWindow(n) {
  const w = Math.max(1, n | 0);
  if (w === _window) return;
  _window = w;
  // Rebuild every existing stage's buffer to the new window size,
  // preserving the most-recent samples. Simplest correctness-first
  // implementation; used by tests to force a specific window.
  for (const [, st] of _stages) {
    const samples = _samples(st);
    const keep = samples.slice(-w);
    st.buf = new Float64Array(w);
    for (let i = 0; i < keep.length; i++) st.buf[i] = keep[i];
    st.head = keep.length % w;
    st.count = keep.length;
  }
}

export function _debugReset() {
  _stages.clear();
  _window = DEFAULT_WINDOW;
  _lastGen = -1;
}
