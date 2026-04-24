#!/usr/bin/env node
// verify.mjs — byte-identity check against the committed baseline.
// Exits 0 on match, 1 on drift. Run: node tests/hnsw-wasm-baseline/verify.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateBaseline, stableStringify } from './generate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../../docs/plan/ruvector-proof/hnsw-wasm-baseline.json');

const committed = readFileSync(FIXTURE_PATH, 'utf8');
const generated = stableStringify(await generateBaseline());

if (committed === generated) {
  console.log('ok — baseline byte-identical to committed fixture');
  process.exit(0);
}

// Helpful diff when they drift — finds the first differing byte and shows
// a small window of context so the reviewer can tell recall drift (new
// top-K) from score-rounding drift (same ids, ULP-level score delta).
let i = 0;
while (i < committed.length && i < generated.length && committed[i] === generated[i]) i++;
const start = Math.max(0, i - 80);
const end = Math.min(Math.max(committed.length, generated.length), i + 80);
console.error('FAIL — baseline drift');
console.error(`first differing char offset: ${i}`);
console.error('--- committed (window) ---');
console.error(committed.slice(start, end));
console.error('--- generated (window) ---');
console.error(generated.slice(start, end));
process.exit(1);
