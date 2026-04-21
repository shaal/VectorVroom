function lerp(A,B,t){
    return A+(B-A)*t;
}

function getIntersection(A,B,C,D){ 
    const tTop=(D.x-C.x)*(A.y-C.y)-(D.y-C.y)*(A.x-C.x);
    const uTop=(C.y-A.y)*(A.x-B.x)-(C.x-A.x)*(A.y-B.y);
    const bottom=(D.y-C.y)*(B.x-A.x)-(D.x-C.x)*(B.y-A.y);
    
    if(bottom!=0){
        const t=tTop/bottom;
        const u=uTop/bottom;
        if(t>=0 && t<=1 && u>=0 && u<=1){
            return {
                x:lerp(A.x,B.x,t),
                y:lerp(A.y,B.y,t),
                offset:t
            }
        }
    }

    return null;
}

function polysIntersect(poly1, poly2){
    for(let i=0; i<poly1.length;i++){
        for(let j=0; j<poly2.length;j++){
            const touch =getIntersection(
                poly1[i],
                poly1[(i+1)%poly1.length],
                poly2[j],
                poly2[(j+1)%poly2.length]
                );
            if(touch){
                return true;
            }
        }
    }
    return false;
}

function phaseToLayout(phase){
    let rightPanel = document.getElementById("verticalButtons");
    let bottomText = document.getElementById("bottomText");
    switch(phase){
        case 1:
            // rightPanel.innerHTML = "<button onclick='saveTrack()'>Save Track</button><button onclick='deleteTrack()'>Delete Track</button><button onclick='deleteLastPoint()'>Delete Point</button><button onclick='nextPhase()'>Next</button>";
            rightPanel.innerHTML = `
                <button class='backNext next' onclick='nextPhase()'>Next</button>
                <button class='controlButton' onclick='saveTrack()'>Save Track</button>
                <button class='controlButton' onclick='deleteTrack()'>Delete Track</button>
                <button class='controlButton' onclick='deleteLastPoint()'>Delete Point</button>
            `;
            bottomText.innerHTML = `
                <h1><span class="red">Left click</span> to add <span class="red">red</span> points</h1>
                <h1><span class="blue">Right click</span> to add <span class="blue">blue</span> points</h1>
            `;
            break;
        case 2:
            rightPanel.innerHTML = `
            <button class='backNext back' onclick='backPhase()'>Prev</button>
            <button class='backNext next' onclick='nextPhase()'>Next</button>
            <button class='controlButton' onclick='saveTrack()'>Save Track</button>
            <button class='controlButton' onclick='deleteLastPoint()'>Delete</button>
            `;
            bottomText.innerHTML = `
                <h1>Click to add checkpoints</h1>
            `;
            break;
        case 3:
            deleteInputCanvas();
            rightPanel.innerHTML = `   
            <button class='backNext back' onclick='backPhase()'>Prev</button>
            <button class='backNext next' onclick='nextPhase()'>Next</button>
            <button class='controlButton' onclick='savePhysics()'>Save Physics</button>
            <button class='controlButton' id='hide' onclick='makeInvincible();'>Invincible On</button>
            <br>
            <div id="inputsContainer">
                <input min="5" max="15" id="maxSpeedInput" step=".5" onkeydown="return false;" type="range" onchange='setMaxSpeed(this.value)' oninput="document.getElementById('maxSpeedOutput').value = 'Max Speed: ' + this.value" >
                <output id="maxSpeedOutput" name="Max Speed"></output>
                <input min="0" max="1" id="tractionInput" step=".01" onkeydown="return false;" type="range" onchange='setTraction(this.value)' oninput="document.getElementById('tractionOutput').value = 'Traction: ' + this.value" >
                <output id="tractionOutput" name="Traction"></output>
            </div>
            `;
            bottomText.innerHTML = `
                <h1>Tune your physics</h1>
                <h1>WASD or arrow keys to drive</h1>
            `;
            const idArray1 = ["maxSpeed", "traction"];
            for (let i = 0; i<idArray1.length; i++){
                document.getElementById(idArray1[i]+"Input").value = window[idArray1[i]];
                document.getElementById(idArray1[i]+"Output").value = document.getElementById(idArray1[i]+"Output").name + ": " +  window[idArray1[i]];
                document.getElementById(idArray1[i]+"Input").setAttribute("value", window[idArray1[i]]);
            }
            break;
        case 4:
            rightPanel.innerHTML = `
            <button class='backNext back' onclick='backPhase()'>Prev</button>
            <button class='controlButton' id='pause' onclick='pauseGame()'>Pause</button>
            <button class='controlButton' onclick='destroyBrain(); nextBatch();'>Reset Brain</button>
            <button class='controlButton' onclick='resetFastLap();'>Reset Fast Lap</button>
            <button class='controlButton' onclick='restartBatch();'>Restart Batch</button>
            <button class='controlButton' onclick='save(); restartBatch();'>Save Best and Restart</button>
            <button class='controlButton' onclick='restoreOldBrain();'>Restore Old Brain</button>

            <div id="inputsContainer">
                <input min="0" max="2000" id="batchSizeInput" step="10" onkeydown="return false;" type="range" onchange='setN(this.value)' oninput="document.getElementById('batchSizeOutput').value = 'Batch Size: ' + this.value" >
                <output  id="batchSizeOutput" name="Batch Size"></output>
                <input min="5" max="100" id="secondsInput" step="5" onkeydown="return false;" type="range" onchange='setSeconds(this.value)' oninput="document.getElementById('secondsOutput').value = 'Round Length: ' + this.value" >
                <output id="secondsOutput" name="Round Length"></output>
                <input min=".001" max=".3" id="mutateValueInput" onkeydown="return false;" step=".001" type="range" onchange='setMutateValue(this.value)' oninput="document.getElementById('mutateValueOutput').value = 'Variance: ' + this.value" >
                <output id="mutateValueOutput" name="Variance"></output>
            </div>
            <div id="timer"></div>
            `;
            bottomText.innerHTML = `
                <h1>Train your model!</h1>
            `;
            const idArray = ["batchSize", "seconds", "mutateValue"];
            for (let i = 0; i<idArray.length; i++){
                document.getElementById(idArray[i]+"Input").value = window[idArray[i]];
                document.getElementById(idArray[i]+"Output").value = document.getElementById(idArray[i]+"Output").name + ": " +  window[idArray[i]];
                document.getElementById(idArray[i]+"Input").setAttribute("value", window[idArray[i]]);
            }
            
            showInputCanvas();
            showGraphCanvas();
            graphProgress();
            // <label>Batch Size</label>
            // <input type='range' min="0" max="1000" step="100" value=100 onchange='setN(this.value)'>Batch Size</input>
            // <label>Round Length</label>
            // <input type='range' min="0" max="100" step="5" value=10 onchange='setSeconds(this.value)'></input>
            // <label>Mutation</label>
            // <input type='range' min="0" max="1" step=".05" value=.3 onchange='setMutateValue(this.value)'></input>
            // savePhysics();
            begin();
            break;

    }
}