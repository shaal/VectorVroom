#!/usr/bin/env node
// recall.mjs — measure recall@K of the current wasm HNSW backend
// against the pinned FlatIndex baseline.
//
// Usage: node tests/hnsw-wasm-baseline/recall.mjs
// Exits non-zero if any DB's recall is below THRESHOLD.
//
// Complement to verify.mjs:
//   - verify.mjs asserts byte-identity (was the pass gate before P3).
//   - recall.mjs asserts set-intersection top-K vs the pinned flat
//     baseline — tolerant to HNSW's approximate traversal and
//     floating-point reordering, intolerant to real recall loss.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateBaseline } from './generate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, '../../docs/plan/ruvector-proof/hnsw-wasm-baseline.json');
const THRESHOLD = 0.95;

function recallAtK(baselineQueries, generatedQueries) {
  // Returns { recall, medianScoreDrift, perQueryRecalls }
  const perQueryRecalls = [];
  const scoreDrifts = [];
  for (let qi = 0; qi < baselineQueries.length; qi++) {
    const base = new Set(baselineQueries[qi].topK.map(r => r.id));
    const gen = generatedQueries[qi].topK;
    const genIds = new Set(gen.map(r => r.id));
    const intersection = [...base].filter(id => genIds.has(id)).length;
    perQueryRecalls.push(intersection / base.size);
    // Top-1 score drift (same ID expected; if not, score delta is
    // less meaningful but still a rough signal)
    const bTop = baselineQueries[qi].topK[0];
    const gTop = gen[0];
    if (bTop && gTop) {
      scoreDrifts.push(Math.abs(bTop.score - gTop.score));
    }
  }
  const mean = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
  const median = arr => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  return {
    recall: mean(perQueryRecalls),
    medianScoreDrift: median(scoreDrifts),
    perQueryRecalls,
  };
}

const committed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const generated = await generateBaseline();

const sections = ['brain', 'track', 'dynamics'];
let failed = false;
const summary = {};
for (const s of sections) {
  const { recall, medianScoreDrift, perQueryRecalls } = recallAtK(committed[s], generated[s]);
  const minQ = Math.min(...perQueryRecalls);
  const below = perQueryRecalls.filter(r => r < 1).length;
  summary[s] = { recall, medianScoreDrift, minQueryRecall: minQ, queriesBelowPerfect: below };
  const pass = recall >= THRESHOLD;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${s.padEnd(9)} ` +
    `recall@${committed._doc.k}=${recall.toFixed(4)}  ` +
    `min-query=${minQ.toFixed(2)}  ` +
    `<perfect: ${below}/${perQueryRecalls.length} queries  ` +
    `top-1 score |Δ| median=${medianScoreDrift.toExponential(2)}`
  );
  if (!pass) failed = true;
}

console.log(`\nthreshold: recall@${committed._doc.k} >= ${THRESHOLD}`);
if (failed) {
  console.error('FAIL — at least one DB below threshold');
  process.exit(1);
}
console.log('ok — all DBs meet recall threshold');

// Write a compact machine-readable artifact for the plan doc to link.
export { summary };
