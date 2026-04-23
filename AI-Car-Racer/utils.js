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
                <button class='backNext back' disabled aria-disabled='true' title='You are on the first step'>Prev</button>
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
            // ELI15 badges (P0.B): each "?" badge sits next to the UI element
            // whose concept it explains. Clicking opens the matching chapter.
            //   - Variance slider       → genetic-algorithm
            //   - Round Length slider   → fitness-function (scoring window)
            //   - timer (#timer)        → fitness-function + sensors (rays
            //                             appear on the canvas during phase 4)
            //   - inputCanvas (NN out)  → neural-network (see uiPanels/indexed
            //                             via the inputCanvas badge wrapper below)
            rightPanel.innerHTML = `
            <button class='controlButton' id='pause' onclick='pauseGame()'>Pause</button>
            <button class='controlButton secondary' id='customizeTrackBtn' onclick='customizeTrack()' title='Draw your own track shape, reset checkpoints, retune physics'>✏️ Customize Track</button>

            <!-- Live-data region: inputCanvas + graphCanvas get appended here by
                 showInputCanvas/showGraphCanvas so they stay at the top of the
                 panel (visible without scrolling) while the secondary sliders
                 sit below. -->
            <div id="liveData" class="live-data"></div>
            <div id="timer"></div>
            <div id="timer-eli15" class="timer-eli15">
                <span data-eli15="fitness-function" role="button" tabindex="0" aria-label="Learn: fitness function"></span>
                <span data-eli15="sensors" role="button" tabindex="0" aria-label="Learn: ray-cast sensors"></span>
                <span data-eli15="neural-network" role="button" tabindex="0" aria-label="Learn: neural network"></span>
            </div>

            <div id="trainingPresets" style="display:flex; gap:.35em; margin:.35em 0; flex-wrap:wrap;">
                <button class='controlButton' style='flex:1;min-width:0;' onclick="applyTrainingPreset('fresh')" title="Random brains: N=500, 2×, 10s, variance 0.30">🌱 Fresh</button>
                <button class='controlButton' style='flex:1;min-width:0;' onclick="applyTrainingPreset('grind')" title="Elite drives laps: N=500, 20×, 15s, variance 0.20">🏎️ Grind</button>
                <button class='controlButton' style='flex:1;min-width:0;' onclick="applyTrainingPreset('polish')" title="Refine competent brain: N=1000, 2×, 25s, variance 0.05">✨ Polish</button>
            </div>
            <details id="trainingTuning" class="more-actions" open>
                <summary>Training tuning (sliders)</summary>
                <div id="inputsContainer">
                    <input min="0" max="2000" id="batchSizeInput" step="50" onkeydown="return false;" type="range" onchange='setN(this.value)' oninput="document.getElementById('batchSizeOutput').value = 'Batch Size: ' + this.value" >
                    <output  id="batchSizeOutput" name="Batch Size"></output>
                    <input min="5" max="100" id="secondsInput" step="5" onkeydown="return false;" type="range" onchange='setSeconds(this.value)' oninput="document.getElementById('secondsOutput').value = 'Round Length: ' + this.value" >
                    <output id="secondsOutput" name="Round Length"></output>
                    <input min=".001" max=".3" id="mutateValueInput" onkeydown="return false;" step=".001" type="range" onchange='setMutateValue(this.value)' oninput="document.getElementById('mutateValueOutput').value = 'Variance: ' + this.value" >
                    <output id="mutateValueOutput" name="Variance"></output>
                    <span data-eli15="genetic-algorithm" role="button" tabindex="0" aria-label="Learn: genetic algorithm + variance"></span>
                    <label id="simSpeedLabel" style="display:flex; align-items:center; gap:.4em; margin-top:.35em; font-size:.82em;">
                        <span>Sim Speed:</span>
                        <select id="simSpeedInput" onchange="setSimSpeed(this.value)" style="flex:1;">
                            <option value="0.5">0.5&times; (slow)</option>
                            <option value="1" selected>1&times; (real)</option>
                            <option value="2">2&times;</option>
                            <option value="5">5&times;</option>
                            <option value="20">20&times;</option>
                            <option value="100">100&times; (max)</option>
                        </select>
                    </label>
                </div>
            </details>
            <details id='moreActions' class='more-actions' open>
                <summary>More actions</summary>
                <div class='more-actions-body'>
                    <button class='controlButton' onclick='destroyBrain(); nextBatch();'>Reset Brain</button>
                    <button class='controlButton' onclick='resetFastLap();'>Reset Fast Lap</button>
                    <button class='controlButton' onclick='restartBatch();'>Restart Batch</button>
                    <button class='controlButton' onclick='save(); restartBatch();'>Save Best + Restart</button>
                    <button class='controlButton' onclick='restoreOldBrain();'>Restore Old Brain</button>
                    <div id="brainShare" class='brain-share'>
                        <button class='controlButton' onclick='exportBrainJson()' title='Download current best brain as a ~1 KB JSON file'>⬇️ Export Brain</button>
                        <button class='controlButton' onclick='importBrainJson()' title='Load a brain JSON file and use it as the seed'>⬆️ Import Brain</button>
                        ${window.__rvfEnabled ? `
                        <button class='controlButton' onclick='exportBrainPackRvf()' title='Export full brain pack as .rvf (experimental)'>⬇️ .rvf</button>
                        <button class='controlButton' onclick='importBrainPackRvf()' title='Import a .rvf brain pack (experimental)'>⬆️ .rvf</button>
                        ` : ''}
                    </div>
                </div>
            </details>
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
            // Move "More actions" panel to sit below #rv-panel (Vector Memory)
            // so it lives at the bottom of the right column instead of above
            // it. The details element was rendered inside #verticalButtons by
            // the innerHTML above; we relocate it after the DOM is committed.
            try {
                const moreActionsEl = document.getElementById('moreActions');
                const rvPanelEl = document.getElementById('rv-panel');
                if (moreActionsEl && rvPanelEl && rvPanelEl.parentNode) {
                    rvPanelEl.parentNode.insertBefore(moreActionsEl, rvPanelEl.nextSibling);
                }
            } catch (_) {}
            showInputCanvas();
            showGraphCanvas();
            graphProgress();
            begin();
            // First-visit UX: begin() sets pause=false, but on a brand-new
            // visitor we keep the sim paused so the user presses an explicit
            // "▶ Start Training" CTA. After the first click, the button
            // reverts to the normal Pause/Play cycle.
            if (window.__firstStart){
                pause = true;
                // Worker setPause deferred to pauseGame() / workerReady — at
                // phase-4 first entry from main.js init the `const simWorker`
                // binding is still in TDZ (declared later in main.js), so
                // `typeof simWorker` would throw. Just flip the UI; begin()
                // posts pause state with its own message when it actually
                // engages the worker.
                const pb = document.getElementById('pause');
                if (pb){
                    pb.textContent = '▶ Start Training';
                    pb.classList.add('start-cta');
                }
            }
            break;

    }
}