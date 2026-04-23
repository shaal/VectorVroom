// Phase P5 — hidden width bumped 8→16 to test whether apex policy
// (slow-near-walls + steer + commit-through-narrowing) needs more
// representational capacity than 8 units provide. Flat layout:
// 10*16+16 (hidden) + 16*4+4 (output) = 176 + 68 = 244.
export const TOPOLOGY = [10, 16, 4];
export const FLAT_LENGTH = 244;
// Bump whenever the network's *inference semantics* or wire shape change in a
// way that makes stored brains behave differently at runtime. Inference-only
// changes (A0: hidden-layer tanh swap) count — the weights load fine but
// produce different outputs for the same inputs, so old archive hits would
// mislead rather than seed. Versions:
//   2 — A0 tanh on hidden
//   3 — A1 unit-vector direction (reverted; see arch-a1/PROOF.md)
//   4 — A1' scaled-distance direction
//   5 — P1 rayCount 5→7 (input width 8→10)
//   6 — P5 hidden width 8→16 (capacity bump for Triangle apex)
// v3 is skipped so any testers whose localStorage holds '3' from A1 get wiped.
export const BRAIN_SCHEMA_VERSION = 6;

function flatLengthFor(topology) {
  let n = 0;
  for (let L = 0; L < topology.length - 1; L++) {
    const inC = topology[L];
    const outC = topology[L + 1];
    n += outC + inC * outC;
  }
  return n;
}

export function flatten(brain) {
  const out = new Float32Array(FLAT_LENGTH);
  let k = 0;
  for (let L = 0; L < brain.levels.length; L++) {
    const level = brain.levels[L];
    // level.biases + level.weights are Float32Arrays in the typed-array
    // network; legacy nested-array brains would have reached here only via
    // reviveBrain which also normalises to flat Float32Array.
    for (let j = 0; j < level.biases.length; j++) {
      out[k++] = level.biases[j];
    }
    for (let w = 0; w < level.weights.length; w++) {
      out[k++] = level.weights[w];
    }
  }
  return out;
}

export function unflatten(float32, topology = TOPOLOGY) {
  const expected = flatLengthFor(topology);
  if (float32.length !== expected) {
    throw new Error(`brainCodec.unflatten: expected ${expected} dims, got ${float32.length}`);
  }
  // index.html must bridge the classic-script class: `window.NeuralNetwork = NeuralNetwork;`
  // right after network.js loads, otherwise this throws in module scope.
  const net = new globalThis.NeuralNetwork(topology);
  let k = 0;
  for (let L = 0; L < net.levels.length; L++) {
    const level = net.levels[L];
    const inC = topology[L];
    const outC = topology[L + 1];
    for (let j = 0; j < outC; j++) level.biases[j] = float32[k++];
    const weightCount = inC * outC;
    for (let w = 0; w < weightCount; w++) level.weights[w] = float32[k++];
  }
  return net;
}

(function selfCheck() {
  if (typeof globalThis.NeuralNetwork === 'undefined') {
    window.addEventListener('DOMContentLoaded', selfCheck, { once: true });
    return;
  }
  const b = new globalThis.NeuralNetwork(TOPOLOGY);
  const vec = flatten(b);
  if (vec.length !== FLAT_LENGTH) throw new Error(`brainCodec: expected ${FLAT_LENGTH} dims, got ${vec.length}`);
  const b2 = unflatten(vec);
  const testInput = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const o1 = globalThis.NeuralNetwork.feedForward(testInput, b);
  const o2 = globalThis.NeuralNetwork.feedForward(testInput.slice(), b2);
  const eq = o1.length === o2.length && o1.every((v, i) => v === o2[i]);
  if (!eq) {
    console.error('[brainCodec] round-trip mismatch', { o1, o2 });
    throw new Error('brainCodec: round-trip produced different feedForward outputs');
  }
  console.log(`[brainCodec] self-check passed — ${FLAT_LENGTH}-dim round-trip ok`);
})();
