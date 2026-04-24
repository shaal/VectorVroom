#!/usr/bin/env node
// build.mjs — (re)generate docs/plan/ruvector-proof/hnsw-wasm-baseline.json.
// Run: node tests/hnsw-wasm-baseline/build.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateBaseline, stableStringify } from './generate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../../docs/plan/ruvector-proof/hnsw-wasm-baseline.json');

const baseline = await generateBaseline();
writeFileSync(OUT_PATH, stableStringify(baseline));
console.log(`wrote ${OUT_PATH}`);
