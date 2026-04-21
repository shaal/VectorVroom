class NeuralNetwork{
    constructor(neuronCounts){
        this.levels=[];
        for(let i=0;i<neuronCounts.length-1;i++){
            //adding a new level 
            this.levels.push(new Level(
                neuronCounts[i],neuronCounts[i+1]
            ));
        }
    }
    
    // feedForward: putting in the outputs of the previous level into the new level as the input
    // final outputs will tell if the car should go forward, backward, left ot right
    static feedForward(givenInputs,network){
        //get the output by calling feedForward from Level class with giveninputs and network of the first level
        //first level to produce the output
        let outputs=Level.feedForward(givenInputs,network.levels[0]);
            
        // Looping through the remaining levels
        for(let i=1;i<network.levels.length;i++){
            outputs=Level.feedForward(
                outputs,network.levels[i]);
        }
        return outputs;
    }

    static mutate(network,amount=1){
        network.levels.forEach(level => {
            for(let i=0;i<level.biases.length;i++){
                level.biases[i]=lerp(biases[i],Math.random()*2-1,amount);
            }
            for(let i=0;i<level.weights.length;i++){
                for(let j=0; j<level.weights[i]; j++){
                    level.weights[i][j]=lerp(level.weights[i][j],Math.random()*2-1,amount);
                }
            }
        })
    }

    // mutate is like the randomize method, but it's random all network
    static mutate(network,amount=1){
        network.levels.forEach(level=>{
            for(let i=0;i<level.biases.length;i++){
                level.biases[i]=lerp(
                    level.biases[i],
                    Math.random()*2-1,
                    amount
                )
            }
            for(let i=0;i<level.weights.length;i++){
                for(let j=0;j<level.weights[i].length;j++){
                    level.weights[i][j]=lerp(
                        level.weights[i][j],
                        Math.random()*2-1,
                        amount
                    )
                }
            }
    });
    }
}

// Create 1 level
class Level{
    constructor(inputCount,outputCount){
        // inputs are getting from the sensor of the car
        // but the outputs will be computed by "Weights & Biases" that we defined that is randomize (In smart brain, they're not random, it has structure)
        this.inputs = new Array(inputCount);
        this.outputs = new Array(outputCount);
        this.biases=new Array(outputCount);

        this.weights=[];
        for(let i=0;i<inputCount;i++){
            this.weights[i]=new Array(outputCount);
            // the weight of each input is the size of the output count 
        }

        Level.#randomize(this);
    }
    //use "static" to serialize this "Object" afterwards 
    //                  and the "Method" don't serialize.
    static #randomize(level){
        // for each i/o pair
        for(let i=0;i<level.inputs.length;i++){
            for(let j=0;j<level.outputs.length;j++){
                // give them a random weight between [-1,1]                                   
                level.weights[i][j]=Math.random()*2-1;   
                    //  Math.random() gives a number between 0 though 1 
                    //  Math.random()*2 = [0,2] (close bracelet, number never reaches 0 or 2)  
            }
        }

        for(let i=0;i<level.biases.length;i++){
            level.biases[i]=Math.random()*2-1;
        }
    }

    static feedForward(givenInputs,level){
        // 1. Go through all level inputs 
        // 2. Set them givenInputs
        for(let i=0;i<level.inputs.length;i++){
            level.inputs[i] = givenInputs[i];
        }

        for(let i=0;i<level.outputs.length;i++){
            let sum=0
            for(let j=0;j<level.inputs.length;j++){
                sum+=level.inputs[j]*level.weights[j][i];
            }
            if(sum>level.biases[i]){
                //if sum grater than the bias of this output neuron,
                //turn output neuron off
                level.outputs[i]=1;
            }else{
                //turn output neuron on
                level.outputs[i]=0;
            } 
        }
        // return those outputs
        return level.outputs;
    }
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