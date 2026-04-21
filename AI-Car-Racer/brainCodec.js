export const TOPOLOGY = [6, 8, 4];
export const FLAT_LENGTH = 92;

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
    for (let j = 0; j < level.biases.length; j++) {
      out[k++] = level.biases[j];
    }
    for (let i = 0; i < level.weights.length; i++) {
      for (let j = 0; j < level.weights[i].length; j++) {
        out[k++] = level.weights[i][j];
      }
    }
  }
  return out;
}

export function unflatten(float32, topology = TOPOLOGY) {
  const expected = flatLengthFor(topology);
  if (float32.length !== expected) {
    throw new Error(`brainCodec.unflatten: expected ${expected} dims, got ${float32.length}`);
  }
  const net = new globalThis.NeuralNetwork(topology);
  let k = 0;
  for (let L = 0; L < net.levels.length; L++) {
    const level = net.levels[L];
    const inC = topology[L];
    const outC = topology[L + 1];
    const biases = new Array(outC);
    for (let j = 0; j < outC; j++) biases[j] = float32[k++];
    level.biases = biases;
    const weights = new Array(inC);
    for (let i = 0; i < inC; i++) {
      const row = new Array(outC);
      for (let j = 0; j < outC; j++) row[j] = float32[k++];
      weights[i] = row;
    }
    level.weights = weights;
    level.inputs = new Array(inC);
    level.outputs = new Array(outC);
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
  const testInput = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const o1 = globalThis.NeuralNetwork.feedForward(testInput, b);
  const o2 = globalThis.NeuralNetwork.feedForward(testInput.slice(), b2);
  const eq = o1.length === o2.length && o1.every((v, i) => v === o2[i]);
  if (!eq) {
    console.error('[brainCodec] round-trip mismatch', { o1, o2 });
    throw new Error('brainCodec: round-trip produced different feedForward outputs');
  }
  console.log('[brainCodec] self-check passed — 92-dim round-trip ok');
})();
