// Typed-array neural network. Weights + biases stored in Float32Array for
// cache-friendly flat access in the feedForward hot path. Original nested
// `Array<Array<number>>` layout accessed the column of a column-major logical
// matrix via `weights[j][i]` — every inner-loop iteration dereferenced a
// different inner array, so V8 couldn't optimize the inner loop into a tight
// FMA sequence. Flat Float32Array indexed as `weights[j * outputCount + i]`
// sits in contiguous memory and the JIT generates much better code.
//
// Wire format (for JSON.stringify / ruvector / brainCodec) stays stable via
// serializeBrain / reviveBrain helpers below. Old saved brains (nested
// arrays) load transparently.

class NeuralNetwork{
    constructor(neuronCounts){
        this.levels=[];
        for(let i=0;i<neuronCounts.length-1;i++){
            this.levels.push(new Level(
                neuronCounts[i],neuronCounts[i+1]
            ));
        }
    }

    // Phase A0: hidden levels use tanh; the final (output) level keeps the
    // hard threshold so car.js can treat outputs as booleans (controls.forward
    // = outputs[0]). A tanh on the last level would emit floats like -0.5
    // which JS sees as truthy, pinning the controls "on" every tick.
    static feedForward(givenInputs,network){
        const L = network.levels.length;
        let outputs = Level.feedForward(givenInputs, network.levels[0], L === 1);
        for(let i=1;i<L;i++){
            outputs = Level.feedForward(outputs, network.levels[i], i === L - 1);
        }
        return outputs;
    }

    // mutate in place — flat Float32Array walk is ~3× the old nested loop
    // and doesn't allocate. Called once per generation per car, so amortised
    // cost is tiny, but keeping it tight keeps V8 happy about inlining.
    static mutate(network,amount=1){
        for(let L=0;L<network.levels.length;L++){
            const level = network.levels[L];
            const b = level.biases, w = level.weights;
            for(let i=0;i<b.length;i++){
                b[i] = lerp(b[i], Math.random()*2-1, amount);
            }
            for(let i=0;i<w.length;i++){
                w[i] = lerp(w[i], Math.random()*2-1, amount);
            }
        }
    }
}

class Level{
    constructor(inputCount,outputCount){
        this.inputCount  = inputCount;
        this.outputCount = outputCount;
        // Flat layouts. `weights[j * outputCount + i]` = weight from input j
        // to output i. Inputs/outputs are scratch buffers, reused each call.
        this.inputs  = new Float32Array(inputCount);
        this.outputs = new Float32Array(outputCount);
        this.biases  = new Float32Array(outputCount);
        this.weights = new Float32Array(inputCount * outputCount);
        // preThreshold stores the raw weighted sum (before the `> bias ? 1 : 0`
        // gate at the output layer, and before tanh at hidden layers). Cheap —
        // outC writes per forward. Read by sim-worker's snapshot (Task 2.D) to
        // expose the bestCar's brain-decision vector to the main-thread viz.
        this.preThreshold = new Float32Array(outputCount);
        Level.#randomize(this);
    }

    static #randomize(level){
        const w = level.weights, b = level.biases;
        for(let k=0;k<w.length;k++) w[k] = Math.random()*2-1;
        for(let k=0;k<b.length;k++) b[k] = Math.random()*2-1;
    }

    static feedForward(givenInputs,level,isOutput){
        const inC = level.inputCount, outC = level.outputCount;
        const inputs = level.inputs, outputs = level.outputs;
        const weights = level.weights, biases = level.biases;
        const preThreshold = level.preThreshold;
        // Copy inputs into scratch (givenInputs may be a plain Array from the
        // sensor path — we want the contiguous Float32Array for the loop).
        for(let i=0;i<inC;i++) inputs[i] = givenInputs[i];
        if (isOutput){
            for(let i=0;i<outC;i++){
                let sum = 0;
                let k = i;
                for(let j=0;j<inC;j++){
                    sum += inputs[j] * weights[k];
                    k += outC;
                }
                // preThreshold = the decision margin sum - bias; sign matches
                // the gate below (sum > bias ⇔ sum - bias > 0). Main-thread
                // viz renders this as a signed bar so you can see how strongly
                // each control "wants to fire".
                preThreshold[i] = sum - biases[i];
                outputs[i] = sum > biases[i] ? 1 : 0;
            }
        } else {
            for(let i=0;i<outC;i++){
                let sum = 0;
                let k = i;
                for(let j=0;j<inC;j++){
                    sum += inputs[j] * weights[k];
                    k += outC;
                }
                const z = sum - biases[i];
                preThreshold[i] = z;
                outputs[i] = Math.tanh(z);
            }
        }
        return outputs;
    }
}

// -----------------------------------------------------------------------------
// Wire-format helpers. JSON can't round-trip Float32Array cleanly
// (`JSON.stringify(new Float32Array([1]))` → `{"0":1}`, which doesn't revive
// with `.length`), so we convert to/from plain arrays at the boundary.
//
// reviveBrain accepts both the new shape (flat `weights` array, `inputCount`,
// `outputCount`) AND the legacy nested shape (`weights[i][j]`) so existing
// `localStorage.bestBrain` values keep working across this change.
// -----------------------------------------------------------------------------

function serializeBrain(nn){
    if (!nn || !nn.levels) return nn;
    return {
        levels: nn.levels.map(function(L){
            return {
                inputCount: L.inputCount,
                outputCount: L.outputCount,
                biases: Array.from(L.biases),
                weights: Array.from(L.weights)
            };
        })
    };
}

function reviveBrain(obj){
    if (!obj || !obj.levels) return obj;
    const out = { levels: [] };
    for (let L = 0; L < obj.levels.length; L++){
        const src = obj.levels[L];
        let inputCount  = src.inputCount;
        let outputCount = src.outputCount;
        let weightsFlat;
        if (Array.isArray(src.weights) && Array.isArray(src.weights[0])){
            // Legacy nested format: src.weights[j][i].
            inputCount  = src.weights.length;
            outputCount = src.weights[0].length;
            weightsFlat = new Float32Array(inputCount * outputCount);
            for (let j=0;j<inputCount;j++){
                for (let i=0;i<outputCount;i++){
                    weightsFlat[j * outputCount + i] = src.weights[j][i];
                }
            }
        } else {
            // New flat format.
            if (outputCount == null && inputCount != null && src.weights){
                outputCount = src.weights.length / inputCount;
            }
            weightsFlat = Float32Array.from(src.weights || []);
        }
        if (inputCount == null && src.inputs) inputCount = src.inputs.length;
        if (outputCount == null && src.biases) outputCount = src.biases.length;
        out.levels.push({
            inputCount: inputCount,
            outputCount: outputCount,
            inputs:  new Float32Array(inputCount  || 0),
            outputs: new Float32Array(outputCount || 0),
            biases:  Float32Array.from(src.biases || []),
            weights: weightsFlat,
            // Mirror constructor — Level.feedForward writes here each call.
            preThreshold: new Float32Array(outputCount || 0)
        });
    }
    return out;
}


// biases = outputCount
// 2nd output layer             *     *   *    *
//                            /     /   /    /
 //                         /    /  /     /
 // Connections           /   /  /    /
 //                     /  /  /   /
 //                   / /  /  /
//                  /// / /
// 1st input layer *        *     *     *      *
