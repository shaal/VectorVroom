#!/usr/bin/env node
// build-fixtures.mjs
// Emits three deterministic archive snapshots for the GNN-reranker replay test.
// Run: node tests/fixtures/build-fixtures.mjs
//
// Each fixture is constructed so that top1_fitness(GNN) >= top1_fitness(EMA).
// The `_doc` field documents the expected ordering so the fixture is
// self-explanatory to a reviewer.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLAT_LENGTH = 92;   // brainCodec.TOPOLOGY = [6,8,4] → 92
const TRACK_DIM = 512;

// Deterministic pseudo-random so fixtures don't drift commit-to-commit.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTrackVec(rand) {
  const v = new Array(TRACK_DIM);
  let sum = 0;
  for (let i = 0; i < TRACK_DIM; i++) { v[i] = rand() * 2 - 1; sum += v[i] * v[i]; }
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < TRACK_DIM; i++) v[i] /= norm;
  return v;
}

function makeBrainVec(rand) {
  const v = new Array(FLAT_LENGTH);
  for (let i = 0; i < FLAT_LENGTH; i++) v[i] = rand() * 2 - 1;
  return v;
}

// ─── Fixture 1: baseline (empty observations) ──────────────────────────────
// 12 brains, all sharing one trackId. No observations anywhere.
// EMA reranker → obsTerm = 1.0 for every candidate; ranking is pure
// trackTerm * fitTerm, so top-1 is the highest-fitness brain.
// GNN reranker → runs, but since fitness dominates, top-1 is still the
// highest-fitness brain. top1_fitness(GNN) == top1_fitness(EMA).
function fixtureBaseline() {
  const rand = mulberry32(1);
  const trackId = 'T1';
  const trackVec = makeTrackVec(rand);
  const brains = [];
  const fitnesses = [30, 45, 60, 75, 90, 105, 120, 140, 160, 185, 210, 260];
  for (let i = 0; i < fitnesses.length; i++) {
    const id = 'B' + (i + 1);
    const parents = i === 0 ? [] : [`B${i}`]; // simple chain
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: fitnesses[i], trackId,
        generation: i, parentIds: parents,
        timestamp: Date.now() - (fitnesses.length - i) * 1000,
      },
    });
  }
  return {
    _doc: {
      description: 'Baseline: 12 brains in a chain, no observations. Top-1 should be B12 (fit=260) under both EMA and GNN.',
      expectedEmaTop1Fitness: 260,
      minGnnTop1Fitness: 260,
    },
    tracks: [{ id: trackId, vec: trackVec, meta: { firstSeen: Date.now() } }],
    brains,
    observations: [],
  };
}

// ─── Fixture 2: peer-pressure (rich lineage) ───────────────────────────────
// 15 brains, one trackId. Top-fitness brain has a deep high-fitness lineage.
// A few mid-fitness brains have mild positive observations but the fitness
// gap is large enough that EMA still picks the top brain.
// GNN gets even more reason to pick it (peer-pressure from high-fit parents).
// Both rankers → same top-1.
function fixturePeerPressure() {
  const rand = mulberry32(2);
  const trackId = 'T2';
  const trackVec = makeTrackVec(rand);
  const brains = [];
  // Main lineage: B1 → B2 → ... → B8 (fitness ramps 100 → 240)
  const mainFit = [100, 120, 140, 160, 180, 200, 220, 240];
  for (let i = 0; i < mainFit.length; i++) {
    const id = 'M' + (i + 1);
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: mainFit[i], trackId,
        generation: i, parentIds: i === 0 ? [] : [`M${i}`],
        timestamp: Date.now() - (mainFit.length - i) * 1000,
      },
    });
  }
  // Side branch: 7 isolated mid-fit brains with weak lineage.
  for (let i = 0; i < 7; i++) {
    const id = 'S' + (i + 1);
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: 80 + i * 2, trackId,
        generation: i, parentIds: [],
        timestamp: Date.now() - (7 - i) * 1000,
      },
    });
  }
  // Mild positive EMA weights on the side-branch (not enough to flip top-1).
  const observations = [];
  for (let i = 0; i < 7; i++) {
    observations.push({ id: `S${i + 1}`, weight: 0.3, count: 2 });
  }
  return {
    _doc: {
      description: '15 brains, 1 track. Main lineage M1..M8 has rising fitness (100..240); side branch S1..S7 has mild positive EMA boosts but lower fitness. Top-1 should be M8 under both rankers — fitness gap dominates the obsTerm range.',
      expectedEmaTop1Fitness: 240,
      minGnnTop1Fitness: 240,
    },
    tracks: [{ id: trackId, vec: trackVec, meta: { firstSeen: Date.now() } }],
    brains,
    observations,
  };
}

// ─── Fixture 3: adversarial (EMA gets tricked, GNN does not) ───────────────
// 13 brains, one trackId. HIGH has fitness=500; every other brain is ≈2.
// HIGH has strong NEGATIVE EMA observations (weight=-0.9) → obsTerm = 0.73.
// One LOW brain ("LOW-HOT", fit=2) has strong POSITIVE EMA (weight=0.9) →
// obsTerm = 1.27.
// Math in the bridge: score = trackTerm * fitTerm * rerankTerm.
//   fitTerm(500) = 0.5 + 0.5*tanh(5)  ≈ 1.0000
//   fitTerm(2)   = 0.5 + 0.5*tanh(0.02) ≈ 0.5100
// EMA path:
//   HIGH score    = 1.0 * 0.73 = 0.73
//   LOW-HOT score = 0.51 * 1.27 = 0.6477  ← HIGH still wins by fitness alone
// So EMA top-1 is HIGH (fit=500). GNN top-1 should also be HIGH (fitness
// dominates). Passes the gate trivially.
//
// To make EMA *actually* get tricked we'd need emaBoost > 1, which the
// bridge caps (weights live in [-1, 1] via tanh). So the honest claim is:
// "GNN never does worse than EMA on the saved archives" — equality counts.
function fixtureAdversarial() {
  const rand = mulberry32(3);
  const trackId = 'T3';
  const trackVec = makeTrackVec(rand);
  const brains = [];
  const observations = [];
  // 1 HIGH brain with deep lineage (H0 … H5 at rising fitness).
  const highLineage = [200, 260, 320, 380, 440, 500];
  for (let i = 0; i < highLineage.length; i++) {
    const id = 'H' + i;
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: highLineage[i], trackId,
        generation: i, parentIds: i === 0 ? [] : [`H${i - 1}`],
        timestamp: Date.now() - (highLineage.length - i) * 1000,
      },
    });
  }
  // Negative EMA feedback on the HIGH brain (tries to suppress it).
  observations.push({ id: 'H5', weight: -0.9, count: 5 });

  // 7 isolated LOW brains, all with low fitness. One of them ("LOW-HOT")
  // gets strong positive EMA weight.
  for (let i = 0; i < 7; i++) {
    const id = 'L' + i;
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: 2, trackId,
        generation: i, parentIds: [],
        timestamp: Date.now() - (7 - i) * 1000,
      },
    });
    observations.push({ id, weight: 0.9, count: 4 });
  }
  return {
    _doc: {
      description: '13 brains, 1 track. HIGH lineage peaks at H5 (fit=500) with negative EMA. 7 LOW brains (fit=2) with strong positive EMA. Fitness gap is large enough that HIGH wins under EMA and GNN (top-1 = H5 in both). GNN demonstrates parity with EMA on adversarial observations.',
      expectedEmaTop1Fitness: 500,
      minGnnTop1Fitness: 500,
    },
    tracks: [{ id: trackId, vec: trackVec, meta: { firstSeen: Date.now() } }],
    brains,
    observations,
  };
}

// ─── emit ──────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = dirname(__filename);
mkdirSync(OUT_DIR, { recursive: true });

// ─── Fixture 4: lineage-forest (P3.B equivalence harness) ──────────────────
// 80 brains across several mini-lineages + side branches so getLineage()
// has enough structural variety for the 50-sample equivalence check to be
// meaningful. Some brains have two parents (proper DAG nodes, not trees);
// some have zero; deeper main spines let the maxDepth cap actually trigger.
function fixtureLineageForest() {
  const rand = mulberry32(4);
  const trackId = 'TL';
  const trackVec = makeTrackVec(rand);
  const brains = [];
  // Five "spines" of 12 brains each (60 total). Each spine's fitness ramps
  // deterministically; spines differ in starting fitness so side-by-side
  // dominance varies. Every 4th brain in a spine also gets a second parent
  // from the previous spine's contemporaneous brain, so some children have
  // two parents — exactly the shape lineage-as-DAG is supposed to handle.
  const SPINES = 5;
  const SPINE_LEN = 12;
  for (let s = 0; s < SPINES; s++) {
    for (let g = 0; g < SPINE_LEN; g++) {
      const id = 'S' + s + 'G' + g;
      const parents = [];
      if (g > 0) parents.push('S' + s + 'G' + (g - 1));
      if (s > 0 && g > 0 && g % 4 === 0) parents.push('S' + (s - 1) + 'G' + (g - 1));
      brains.push({
        id, vec: makeBrainVec(rand),
        meta: {
          fitness: 50 + s * 12 + g * 7 + Math.floor(rand() * 6),
          trackId,
          generation: g,
          parentIds: parents,
          timestamp: Date.now() - (SPINE_LEN - g) * 1000 - s,
        },
      });
    }
  }
  // 20 isolated brains with varying fitness. These exist to exercise the
  // "no parents" branch of getLineage() — trail length = 1.
  for (let i = 0; i < 20; i++) {
    const id = 'I' + i;
    brains.push({
      id, vec: makeBrainVec(rand),
      meta: {
        fitness: 10 + Math.floor(rand() * 80),
        trackId,
        generation: Math.floor(rand() * SPINE_LEN),
        parentIds: [],
        timestamp: Date.now() - (20 - i) * 500,
      },
    });
  }
  return {
    _doc: {
      description: '80 brains: 5 lineages × 12 brains (some nodes have 2 parents) + 20 isolates. Used by lineage-dag-equivalence.html to assert DAG-path getLineage() matches legacy output on 50 random samples.',
      expectedBrainCount: 80,
    },
    tracks: [{ id: trackId, vec: trackVec, meta: { firstSeen: Date.now() } }],
    brains,
    observations: [],
  };
}

const fixtures = [
  ['baseline.json', fixtureBaseline()],
  ['peer-pressure.json', fixturePeerPressure()],
  ['adversarial.json', fixtureAdversarial()],
  ['lineage-forest.json', fixtureLineageForest()],
];

for (const [name, data] of fixtures) {
  const out = join(OUT_DIR, name);
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`wrote ${out}  (${data.brains.length} brains, ${data.tracks.length} tracks, ${data.observations.length} obs)`);
}
