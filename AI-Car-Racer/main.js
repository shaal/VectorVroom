const canvas=document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
// canvas.width=window.innerWidth*.8;
// canvas.height=window.innerHeight;
canvas.width = 3200;
canvas.height = 1800;
// canvas.style.width="100px";
// canvas.style.height="100px";

const startInfo = {x: canvas.width - canvas.width/10, y: canvas.height/2, startWidth: canvas.width/40};
const road=new Road(startInfo);
var batchSize = 10;
var nextSeconds = 15;
var seconds;
var mutateValue = .3;
var cars;
var playerCar;
var playerCar2;
let bestCar;
var invincible=false;
var traction=0.5;

var frameCount = 0;
var fastLap = '--';

// Sim-speed multiplier. The physics loop targets `simSpeed × dt × 60` steps
// per rAF via a fractional accumulator. Tying stepping to wall-dt instead of
// rAF count means 1× matches real time regardless of monitor refresh rate
// (the game was designed assuming 60Hz, so on 120Hz displays the old frame-
// locked loop ran everything at 2×). Render still fires once per rAF — no
// point drawing intermediate sim states at 20× or 100×.
var simSpeed = 1;
var _simStepAccum = 0;
var _lastTickWall = performance.now();

// Wall-clock anchor reset every begin(); used purely for the `Sim Time`
// display so users can see sim-sec vs wall-sec diverge under the multiplier.
var wallStart = performance.now();

var acceleration = .05;
var breakAccel = .05;
// cars[0].update(road.borders, road.checkPointList);//create polygon
let pause=true;
var phase = 0; //0 welcome, 1 track, 2 checkpoints, 3 physics, 4 training
var maxSpeed = 15;
nextPhase();
if (localStorage.getItem("traction")){
    traction=JSON.parse(localStorage.getItem("traction"));
}
if (localStorage.getItem("maxSpeed")){
    maxSpeed=JSON.parse(localStorage.getItem("maxSpeed"));
}
if (localStorage.getItem("fastLap")){
    fastLap = JSON.parse(localStorage.getItem("fastLap"));
}
// Vector-memory integration (P4.C). `?rv=0` disables the bridge entirely;
// `currentSeedIds` carries the retrieval set across begin()→nextBatch() so
// archiveBrain can record parent lineage and observe() can credit the seeds.
var rvDisabled = new URLSearchParams(location.search).get('rv') === '0';
var currentSeedIds = [];
var generation = 0;

function bridgeReady(){
    if (rvDisabled) return false;
    var b = window.__rvBridge;
    return !!(b && b.info && b.info().ready && window.__rvUnflatten);
}

function begin(){
    seconds = nextSeconds;
    pause=false;
    playerCar = new Car(startInfo.x,startInfo.y,30,50,"KEYS",maxSpeed);
    playerCar2 = new Car(startInfo.x,startInfo.y,30,50,"WASD",maxSpeed);
    cars=generateCars(batchSize);
    // cars[0].update(road.borders, road.checkPointList);//create polygon
    frameCount=0;
    wallStart = performance.now();
    // Prime the accumulator to 1 so the first rAF after begin() is guaranteed
    // to run at least one physics step. Without this, dt≈0 on the opening
    // rAF yields stepsThisFrame=0, and the car-draw path then reads empty
    // sensor.rays (rays are populated in update()) → TypeError kills the
    // rAF chain and the whole training loop freezes silently.
    _simStepAccum = 1;
    _lastTickWall = performance.now();
    currentSeedIds = [];

    var seededFromBridge = false;
    if (bridgeReady()){
        try {
            var bridge = window.__rvBridge;
            var trackVec = window.currentTrackVec || null;
            // Stage the mid-training dynamics query vector. On begin() it's
            // from the *previous* generation's trajectory (captured up to
            // nextBatch). First-ever call: nothing staged → setQueryDynamicsVec
            // null → the bridge silently skips the dynamics term. This is
            // the P1.C "currently running generation's mid-training
            // dynamics" signal, frozen at the moment we reseed.
            if (window.__rvDynamics && typeof bridge.setQueryDynamicsVec === 'function'){
                try {
                    var qDyn = window.__rvDynamics.queryVector();
                    bridge.setQueryDynamicsVec(qDyn);
                } catch (_) { /* embedder is best-effort */ }
            }
            var seeds = bridge.recommendSeeds(trackVec, 10);
            if (seeds && seeds.length > 0){
                currentSeedIds = seeds.map(function(s){ return s.id; });
                // PRD seeding: elitism + light mutation + heavy mutation + novelty.
                // Generalised from N=10 to the user's configurable batchSize:
                //   - 1 elite (unmutated top retrieval)
                //   - ~half of the remainder: light mutation, cycling through seeds
                //   - ~half of the remainder: heavy mutation, cycling through seeds
                //   - at least 1 novelty slot: random init (leave Car's default brain)
                var N = cars.length;
                var nElite = Math.min(1, N);
                var nNovel = Math.max(1, Math.floor(N * 0.1));
                var remaining = N - nElite - nNovel;
                var nLight = Math.max(0, Math.floor(remaining / 2));
                var nHeavy = Math.max(0, remaining - nLight);
                var lightAmt = mutateValue * 0.5;
                var heavyAmt = Math.min(1, mutateValue * 1.8);
                for (var i = 0; i < N; i++){
                    if (i < nElite){
                        cars[i].brain = window.__rvUnflatten(seeds[0].vector);
                    } else if (i < nElite + nLight){
                        var s1 = seeds[(i - nElite) % seeds.length];
                        cars[i].brain = window.__rvUnflatten(s1.vector);
                        NeuralNetwork.mutate(cars[i].brain, lightAmt);
                    } else if (i < nElite + nLight + nHeavy){
                        var s2 = seeds[(i - nElite - nLight) % seeds.length];
                        cars[i].brain = window.__rvUnflatten(s2.vector);
                        NeuralNetwork.mutate(cars[i].brain, heavyAmt);
                    }
                    // else: novelty slot — keep the random brain from `new Car(...)`
                }
                console.log('[ruvector] seeded ' + N + ' cars from ' + seeds.length +
                    ' retrievals (elite=' + nElite + ', light=' + nLight +
                    ', heavy=' + nHeavy + ', novel=' + nNovel + ')');
                seededFromBridge = true;
            }
        } catch (e) {
            console.warn('[ruvector] seeding failed — falling back to stock', e);
        }
    }

    // Stock path: used for ?rv=0, for "bridge not ready yet" (e.g. phase-1 boot),
    // and as graceful fallback when the vector archive is empty but the user
    // already has a localStorage.bestBrain from a prior run.
    if (!seededFromBridge && localStorage.getItem("bestBrain")){
        for(let i = 0; i<cars.length;i++){
            cars[i].brain=JSON.parse(localStorage.getItem("bestBrain"));
            if(i!=0){
                NeuralNetwork.mutate(cars[i].brain,mutateValue);
            }
        }
    }
    bestCar = cars[0];
}

// if(localStorage.getItem("bestBrain")){
//     for(let i = 0; i<cars.length;i++){
//         cars[i].brain=JSON.parse(localStorage.getItem("bestBrain"));
//         if(i!=1){
//             NeuralNetwork.mutate(cars[i].brain,.2);
//         }
//     }
//     // bestCar.brain=JSON.parse(localStorage.getItem("bestBrain"));
// }

// graphProgress();
begin();
animate();
function generateCars(N){
    const cars = [];
    for(let i=0; i<N; i++){
        cars.push(new Car(startInfo.x,startInfo.y,30,50,"AI",maxSpeed));
    }
    return cars;
}


function nextBatch(){
    if(localStorage.getItem("trainCount")){
        localStorage.setItem("trainCount", JSON.stringify(JSON.parse(localStorage.getItem("trainCount"))+1));
    }
    else{
        localStorage.setItem("trainCount", JSON.stringify(1));
    }
    if(bestCar){
        save();
    }
    if(bestCar.laps>0 && (Math.min(...bestCar.lapTimes) < fastLap || fastLap=='--')){
        fastLap = Math.min(...bestCar.lapTimes);
        localStorage.setItem('fastLap', JSON.stringify(fastLap));
    }

    // Vector-memory archive + GNN-fallback feedback. Fitness matches the
    // `testBestCar` tiebreaker used in animate(): total checkpoints passed
    // across completed laps + progress on the current lap.
    if (bridgeReady() && bestCar){
        try {
            var fitness = bestCar.checkPointsCount +
                (bestCar.laps || 0) * (road.checkPointList ? road.checkPointList.length : 0);
            var trackVec = window.currentTrackVec || null;
            // Per-batch best lap for the archived brain — only meaningful if the
            // car actually completed a lap this generation. Not to be confused
            // with the global `fastLap` (all-time best across all training).
            var batchFastest = (bestCar.laps > 0 && bestCar.lapTimes && bestCar.lapTimes.length)
                ? Math.min.apply(null, bestCar.lapTimes) : undefined;
            // Finalise the trajectory the best car just drove. finalizeVector
            // returns null when no frames were captured (very short runs or
            // the bestCar never had a sensor update); archiveBrain tolerates
            // that by skipping the dynamicsId write. We reset the embedder
            // *after* finalising so the next generation starts with a clean
            // ring buffer regardless of which car turns out to be best.
            var dynamicsVec = null;
            if (window.__rvDynamics){
                try { dynamicsVec = window.__rvDynamics.finalizeVector(); } catch (_) { dynamicsVec = null; }
            }
            window.__rvBridge.archiveBrain(
                bestCar.brain, fitness, trackVec, generation, currentSeedIds.slice(), batchFastest, dynamicsVec
            );
            // P2.A — track the running session-best so backPhase() can close
            // the SONA trajectory with a meaningful final fitness. Per-gen
            // fitness resets when the session restarts (nextPhase case 4).
            if (!window.__rvSessionBestFitness || fitness > window.__rvSessionBestFitness) {
                window.__rvSessionBestFitness = fitness;
            }
            if (window.__rvDynamics){
                try { window.__rvDynamics.reset(); } catch (_) { /* best-effort */ }
            }
            if (currentSeedIds.length){
                window.__rvBridge.observe(currentSeedIds, fitness);
            }
            console.log('[ruvector] gen=' + generation + ' archived best fitness=' + fitness +
                (currentSeedIds.length ? ' (observed ' + currentSeedIds.length + ' seeds)' : ''));
        } catch (e){
            console.warn('[ruvector] archive/observe failed', e);
        }
    }
    generation += 1;

    // P5.D: refresh the fitness-over-generations graph in-place so the
    // newly-appended progress point + annotation render immediately,
    // rather than waiting for a phase re-entry. graphProgress() is a
    // no-op if the graph canvas isn't mounted yet (phase < 4).
    if (typeof graphProgress === 'function'){
        try { graphProgress(); } catch (e) { /* canvas not ready */ }
    }

    begin();
    // location.reload();
}
function animate(){
    road.draw(ctx);
    // canvas.style.width = String(Math.min(window.innerWidth*.8, 16/9*window.innerHeight)) + "px";
    // canvas.style.height = String(Math.min(9/16*window.innerWidth*.8, window.innerHeight)) + "px";
    // road.draw(ctx);
    if(phase==3){
        playerCar.update(road.borders, road.checkPointList);
        playerCar.draw(ctx,"red",true);
        playerCar2.update(road.borders, road.checkPointList);
        playerCar2.draw(ctx,"blue",true);
    }
    if(phase==4){
        const timer = document.getElementById("timer");
        const simSecs = (frameCount/60).toFixed(2);
        const wallSecs = ((performance.now() - wallStart)/1000).toFixed(2);
        timer.innerHTML = "<p>Sim Time: " + simSecs + "s " +
            "<span style='opacity:.65;font-size:.85em'>(wall " + wallSecs + "s &middot; " + simSpeed + "&times;)</span></p>";
        // fastLap defaults to '--' until a lap completes (main.js:24).
        // Call toFixed only when it's numeric — otherwise the TypeError
        // throws out of animate(), kills the rAF chain, and the training
        // loop silently freezes with no visible movement on phase 4.
        timer.innerHTML += "<p>Fast Lap: " + (typeof fastLap === 'number' ? fastLap.toFixed(2) : fastLap) + "</p>";
        ctx.save();

        if(!pause){
            // Wall-time-based stepping: target `simSpeed × dt × 60` physics
            // steps per rAF (60 steps = 1 sim-second by convention). The
            // accumulator handles fractional output so 0.5× cleanly runs
            // one step every ~2 rAFs and 100× bursts 100+ steps per rAF.
            // dt is clamped to 250ms so a backgrounded tab resuming doesn't
            // try to catch up with a huge burst of physics at once.
            const now = performance.now();
            let dt = (now - _lastTickWall) / 1000;
            _lastTickWall = now;
            if (dt > 0.25) dt = 0.25;
            _simStepAccum += simSpeed * dt * 60;
            let stepsThisFrame = Math.floor(_simStepAccum);
            _simStepAccum -= stepsThisFrame;

            let genEnded = false;
            for (let s = 0; s < stepsThisFrame; s++){
                // Generation-end check inside the loop + `>=` (not `==`) so a
                // multi-step frame can't sail past the trigger. nextBatch()
                // resets frameCount via begin(), so the next iteration starts
                // fresh from 0 — but we break anyway to let the next rAF paint.
                if (frameCount >= 60*seconds){
                    nextBatch();
                    genEnded = true;
                    break;
                }
                frameCount+=1;
                for(let i=0;i<cars.length;i++){
                    cars[i].update(road.borders, road.checkPointList);
                }
                playerCar.update(road.borders, road.checkPointList);
                playerCar2.update(road.borders, road.checkPointList);

                testBestCar=cars.find(
                    c=>(c.checkPointsCount+c.laps*road.checkPointList.length)==Math.max(
                        ...cars.map(c=>c.checkPointsCount+c.laps*road.checkPointList.length)
                ));
                if (testBestCar.checkPointsCount+testBestCar.laps*road.checkPointList.length > bestCar.checkPointsCount+bestCar.laps*road.checkPointList.length){
                    bestCar = testBestCar;
                }
                // P1.C — record the current best car's sensor/control state into
                // the dynamics trajectory. The embedder detects bestCar identity
                // changes internally and resets its ring buffer, so a late swap
                // doesn't pollute the trajectory of the brain we ultimately archive.
                // Recording is per sim-step (not per rAF) so trajectories stay
                // dense at high simSpeed.
                if (window.__rvDynamics && bestCar){
                    try { window.__rvDynamics.recordFrame(bestCar); } catch (_) { /* best-effort */ }
                }
            }

            // Render once per rAF regardless of how many sim steps ran.
            if (!genEnded){
                ctx.globalAlpha=.2;
                for(let i=0;i<cars.length;i++){
                    cars[i].draw(ctx,"rgb(227, 138, 15)");
                }
                ctx.globalAlpha=1;
                if(bestCar){
                    inputVisual(bestCar.controls);
                    bestCar.draw(ctx,"rgb(227, 138, 15)",true);
                }
                playerCar.draw(ctx,"red",true);
                playerCar2.draw(ctx,"blue",true);
            }
        }
        ctx.restore();
    }
    requestAnimationFrame(animate);
}

//'{"levels":[{"inputs":[0.495606189201673,0.15726215616367423,0,0.6062034072393743,0.7496399637888809],"outputs":[1,0,1,0,0,1],"biases":[-0.013740731634192205,0.6951143976529082,-0.5697816444261132,0.1256929635933952,0.49673130416849576,0.6373846513146026],"weights":[[0.9240140833302606,0.25091394484609575,-0.4077179156441786,0.21592532139427467,-0.6862378192394485,0.697398523618745],[0.3211162914201262,0.2615854303788545,0.4746093050272915,0.8033437683176308,-0.7341054748796783,-0.916951464044971],[-0.18507903730366992,0.42927022661166125,0.306261891088051,-0.3837882586456778,0.952567592490035,0.8542800790925975],[0.22172773706975413,-0.5215198285643297,-0.4920542534845125,-0.9291969638628683,-0.8856946763484408,0.3938602710681609],[-0.8410642961250265,0.7579906650045083,0.32516678866065174,-0.30754302421501567,0.8750073921299881,0.4999127605665361]]},{"inputs":[1,0,1,0,0,1],"outputs":[1,0,0,0],"biases":[-0.8566061993749825,0.4250344074205392,0.4059436542760504,0.9283323169289042],"weights":[[-0.03284571525471147,-0.07174304448134672,0.9705226282848525,0.4786108058481413],[-0.5219072138022529,0.6678782301476365,0.4635492145127511,-0.776407850244115],[-0.04195812585225989,0.3497316343546939,-0.1768704063971387,-0.32871733563395233],[0.23344650987322257,0.09045178035212231,0.4046143644666751,0.09849445965256542],[-0.6279687724901417,0.8853891662508939,0.3327718864420204,-0.17241258720460628],[0.35115347757846305,0.0889499918491552,-0.9644183785501652,-0.6884814126502978]]}]}'
//'{"levels":[{"inputs":[0.6395045484555228,0.4359628418308088,0.07340465472849844,0,0.5535612099823177,0.990906584451451],"outputs":[1,0,0,1,1,1,1,1],"biases":[-0.014753822021949163,0.04896634890272357,0.17863768300993674,-0.049642725490895226,0.08749957520037199,-0.012076978772172313,-0.024113772931165768,-0.0824189041813355],"weights":[[0.004229355580572908,0.000057785402906351027,0.10202159780807353,0.09153950174283897,-0.07499968554856666,0.05564797190966312,0.1674938026016347,-0.058192893467054176],[-0.03776941179254002,0.02041705942976021,0.032273336905924085,0.11818418505990481,0.15377965457906564,-0.1596019978693655,0.10187209329255824,0.03959848238860798],[-0.2174667597309811,-0.07272935607093334,-0.06465008743518509,0.11144079503383379,0.17604593586544665,0.08052515820563311,-0.07377492573213228,-0.07299743852666632],[-0.08001452281427013,-0.05627433517866529,0.1323809223215508,0.06883154729866059,-0.1069947772202646,0.017189481890519113,0.06646921038871915,-0.10954474392674232],[0.10324057404054585,-0.033169402656589804,0.1243432482177765,0.2911866883255414,0.10710591144952915,-0.06791835003015999,-0.15711745229792942,-0.07939053369353453],[0.00713515703851305,0.04375518955271324,0.009546386053716866,0.12836467415280342,0.0004795055449842196,0.11041345561610985,0.07979696667846176,0.10848388629251672]]},{"inputs":[1,0,0,1,1,1,1,1],"outputs":[1,0,1,0],"biases":[-0.071187096884142,-0.11687737138672825,-0.06599828084390714,-0.014383456122405847],"weights":[[0.17954521532131484,-0.0008988777384373932,-0.01595166196304911,-0.008515858675526226],[-0.16087191702292633,-0.05851075061941579,0.0072468339910833224,0.02166515761043868],[-0.20319128977863793,0.10329997860690525,0.041146891092939536,0.12659916059847753],[0.15803835303689934,-0.018908640750950365,-0.044571817776129556,0.2662485368606925],[-0.029798744533117212,-0.0235886279849129,0.05718211675393633,-0.07455804284353565],[-0.040516174435908076,0.042343716704855816,-0.005914512722737507,-0.1577147593553106],[-0.010486600089340629,-0.11350580663223411,0.10351770538874087,-0.062077254056490914],[0.042770330368817125,-0.020104603820007422,0.13634648255306495,-0.0216467940618405]]}]}'