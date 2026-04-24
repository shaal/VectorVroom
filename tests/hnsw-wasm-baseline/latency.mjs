#!/usr/bin/env node
// latency.mjs — P6 search-latency A/B.
//
// Measures .search(query, 5) latency on the same wasm build under two
// backends, selected per-DB via the constructor's third arg:
//   new VectorDB(dim, 'cosine')        → hnsw_config = Some(default)
//                                        → HnswWasmIndex (feature hnsw-wasm)
//   new VectorDB(dim, 'cosine', false) → hnsw_config = None
//                                        → FlatIndex
//
// Data is the same deterministic 300-vec corpus + 20 queries per DB as
// generate.mjs (identical mulberry32 seeds). Each measured timing loop
// cycles the 20 queries 50× for 1000 samples per combination. 200
// warmup queries per DB×backend are discarded before timing.
//
// Node, not browser: same wasm bytecode; Node has less UI-thread jitter
// and sharper performance.now() resolution. The latency figure reflects
// wasm-internal search time plus the wasm-bindgen boundary crossing,
// which is what the bridge pays too.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import initWasm, { VectorDB } from '../../vendor/ruvector/ruvector_wasm/ruvector_wasm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dirname, '../../vendor/ruvector/ruvector_wasm/ruvector_wasm_bg.wasm');

const BRAIN_DIM = 244;
const TRACK_DIM = 512;
const DYNAMICS_DIM = 64;
const N_PER_DB = 300;
const N_UNIQUE_QUERIES = 20;
const REPS = 50;                 // 20 × 50 = 1000 measured queries per combo
const WARMUP = 200;
const K = 5;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeUnitVec(rand, dim) {
  const v = new Float32Array(dim);
  let sum = 0;
  for (let i = 0; i < dim; i++) { v[i] = rand() * 2 - 1; sum += v[i] * v[i]; }
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

function makeRawVec(rand, dim) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rand() * 2 - 1;
  return v;
}

function padId(prefix, i) { return prefix + String(i).padStart(4, '0'); }

function buildCorpus(seed, dim, prefix, normalise) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 1; i <= N_PER_DB; i++) {
    out.push({ id: padId(prefix, i), vec: normalise ? makeUnitVec(rand, dim) : makeRawVec(rand, dim) });
  }
  return out;
}

function buildQueries(seed, dim, normalise) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < N_UNIQUE_QUERIES; i++) {
    out.push(normalise ? makeUnitVec(rand, dim) : makeRawVec(rand, dim));
  }
  return out;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function summarise(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean = samplesMs.reduce((s, x) => s + x, 0) / samplesMs.length;
  return {
    n: samplesMs.length,
    mean_us: mean * 1000,
    p50_us: quantile(sorted, 0.5) * 1000,
    p95_us: quantile(sorted, 0.95) * 1000,
    p99_us: quantile(sorted, 0.99) * 1000,
    max_us: sorted[sorted.length - 1] * 1000,
  };
}

function populate(db, corpus) {
  for (const { id, vec } of corpus) db.insert(vec, id, null);
}

function measure(db, queries) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    db.search(queries[i % queries.length], K, null);
  }
  // Timed
  const samples = [];
  for (let rep = 0; rep < REPS; rep++) {
    for (let qi = 0; qi < queries.length; qi++) {
      const t0 = performance.now();
      db.search(queries[qi], K, null);
      samples.push(performance.now() - t0);
    }
  }
  return summarise(samples);
}

// ─── main ────────────────────────────────────────────────────────────
const wasmBytes = readFileSync(WASM_PATH);
await initWasm({ module_or_path: wasmBytes });

const sections = [
  { name: 'brain',    dim: BRAIN_DIM,    cseed: 11, qseed: 1011, normalise: false },
  { name: 'track',    dim: TRACK_DIM,    cseed: 22, qseed: 1022, normalise: true  },
  { name: 'dynamics', dim: DYNAMICS_DIM, cseed: 33, qseed: 1033, normalise: true  },
];

const results = [];
for (const s of sections) {
  const corpus = buildCorpus(s.cseed, s.dim, s.name[0].toUpperCase(), s.normalise);
  const queries = buildQueries(s.qseed, s.dim, s.normalise);

  const hnswDb = new VectorDB(s.dim, 'cosine');            // use_hnsw defaults true
  const flatDb = new VectorDB(s.dim, 'cosine', false);     // explicit flat
  populate(hnswDb, corpus);
  populate(flatDb, corpus);

  const hnsw = measure(hnswDb, queries);
  const flat = measure(flatDb, queries);
  results.push({ section: s.name, dim: s.dim, hnsw, flat });
}

// ─── print table ─────────────────────────────────────────────────────
const hdr = ['DB', 'dim', 'backend', 'p50 µs', 'p95 µs', 'p99 µs', 'mean µs'];
const rows = [hdr];
for (const r of results) {
  rows.push([r.section, String(r.dim), 'HNSW',
    r.hnsw.p50_us.toFixed(1), r.hnsw.p95_us.toFixed(1),
    r.hnsw.p99_us.toFixed(1), r.hnsw.mean_us.toFixed(1)]);
  rows.push([r.section, String(r.dim), 'FlatIndex',
    r.flat.p50_us.toFixed(1), r.flat.p95_us.toFixed(1),
    r.flat.p99_us.toFixed(1), r.flat.mean_us.toFixed(1)]);
  const ratio = (r.hnsw.p50_us / r.flat.p50_us).toFixed(2);
  rows.push([r.section, '',    'HNSW/Flat p50',
    `${ratio}×`, '', '', '']);
}
const widths = hdr.map((_, i) => Math.max(...rows.map(row => row[i].length)));
for (const row of rows) {
  console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
}

// ─── write markdown ─────────────────────────────────────────────────
const OUT = join(__dirname, '../../docs/plan/ruvector-proof/hnsw-wasm-latency.md');
const ts = new Date().toISOString().slice(0, 10);
const md = [
  `# P6 — HNSW-wasm search-latency A/B`,
  ``,
  `Captured ${ts}. Node ${process.version}. wasm from`,
  `\`vendor/ruvector/ruvector_wasm/ruvector_wasm_bg.wasm\`.`,
  ``,
  `## Methodology`,
  ``,
  `Same wasm build, two DB instances per section: one with`,
  `\`new VectorDB(dim, 'cosine')\` (HNSW-backed via \`hnsw-wasm\` feature)`,
  `and one with \`new VectorDB(dim, 'cosine', false)\` (FlatIndex, the`,
  `\`else\` branch in \`vector_db.rs\` when \`hnsw_config = None\`).`,
  `Both DBs populated with the same deterministic 300-vec corpus.`,
  `${REPS} × ${N_UNIQUE_QUERIES} = 1000 timed \`.search(q, ${K})\` calls per`,
  `combination, preceded by ${WARMUP} warmup queries discarded.`,
  ``,
  `Ran in Node, not the browser. Same wasm bytecode, but Node has less`,
  `UI-thread jitter and sharper \`performance.now()\` resolution —`,
  `cleaner numbers for the wasm-internal search path which is what the`,
  `bridge pays to call either way.`,
  ``,
  `## Results (microseconds per \`.search()\`)`,
  ``,
  `| DB | dim | backend | p50 | p95 | p99 | mean |`,
  `|----|----:|---------|----:|----:|----:|-----:|`,
];
for (const r of results) {
  md.push(`| ${r.section} | ${r.dim} | HNSW | ${r.hnsw.p50_us.toFixed(1)} | ${r.hnsw.p95_us.toFixed(1)} | ${r.hnsw.p99_us.toFixed(1)} | ${r.hnsw.mean_us.toFixed(1)} |`);
  md.push(`| ${r.section} | ${r.dim} | FlatIndex | ${r.flat.p50_us.toFixed(1)} | ${r.flat.p95_us.toFixed(1)} | ${r.flat.p99_us.toFixed(1)} | ${r.flat.mean_us.toFixed(1)} |`);
}
md.push('');
md.push('### HNSW / Flat ratio (p50)');
md.push('');
md.push('| DB | dim | ratio |');
md.push('|----|----:|------:|');
for (const r of results) {
  md.push(`| ${r.section} | ${r.dim} | ${(r.hnsw.p50_us / r.flat.p50_us).toFixed(2)}× |`);
}
md.push('');
md.push('## Interpretation');
md.push('');
md.push('HNSW has O(log N) asymptotic search complexity with large');
md.push('constants; FlatIndex is O(N) with very small constants and');
md.push('cache-friendly linear access. The crossover where HNSW wins is');
md.push('typically N ≈ 10⁴ – 10⁵. At N = 300, FlatIndex is expected to');
md.push('win on absolute latency — capability (not performance) was the');
md.push('goal of this migration, and recall@5 = 1.0000 (P5) confirms the');
md.push('HNSW backend is behaviorally equivalent to FlatIndex at this');
md.push('scale. Keep this file as evidence so nobody proposes "switching');
md.push('back to FlatIndex for speed" without recognising the capability');
md.push('tradeoff.');
md.push('');
md.push('Re-run with `node tests/hnsw-wasm-baseline/latency.mjs`. Numbers');
md.push('jitter session-to-session; what matters is the ratio shape, not');
md.push('absolute µs.');
md.push('');
writeFileSync(OUT, md.join('\n'));
console.log(`\nwrote ${OUT}`);
