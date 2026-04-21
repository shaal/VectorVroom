function pauseGame(){
    pause=!pause;
    document.getElementById("pause").textContent = pause?"Play":"Pause";
}
function save(){
    const progressVal = bestCar.checkPointsCount+bestCar.laps*road.checkPointList.length/seconds;
    if(localStorage.getItem("progress")){
        var progressArray = JSON.parse(localStorage.getItem("progress"));
        progressArray.push(fastLap);
        localStorage.setItem("progress",JSON.stringify(progressArray));
    }
    else{
        localStorage.setItem("progress",JSON.stringify([fastLap]));
    }
    // P5.D: record per-batch graph annotations parallel to progress[]. Two
    // signals per generation: (1) was this batch initialised from the vector
    // archive (currentSeedIds non-empty); (2) how much did the top-K seed
    // ordering shift vs the previous batch (captures EMA-reranker effect of
    // the prior observe() call plus any archive-update reshuffle).
    var seeded = (typeof currentSeedIds !== 'undefined' && currentSeedIds && currentSeedIds.length > 0);
    var prev = (typeof window.__rvLastSeedIdsForGraph !== 'undefined' && window.__rvLastSeedIdsForGraph) || null;
    var curr = seeded ? currentSeedIds : [];
    var shift = prev ? rankShiftForGraph(prev, curr) : 0;
    window.__rvLastSeedIdsForGraph = curr.slice();
    var annArr = localStorage.getItem("rvAnnotations") ? JSON.parse(localStorage.getItem("rvAnnotations")) : [];
    annArr.push({ seeded: seeded, shift: shift });
    localStorage.setItem("rvAnnotations", JSON.stringify(annArr));

    localStorage.setItem("oldBestBrain",(localStorage.getItem("bestBrain")));
    localStorage.setItem("bestBrain",JSON.stringify(bestCar.brain));
}

// Spearman's-footrule shift over the union of top-K ids (mirrors the
// computeRankShift in uiPanels.js used by the P5.C reranker indicator).
// Ids present in only one list count as rank K, so a drop-out from
// position i and a fresh promotion into position i both contribute K-i.
function rankShiftForGraph(prev, curr){
    if (!prev.length && !curr.length) return 0;
    var K = Math.max(prev.length, curr.length);
    var prevIdx = new Map(); for (var i=0;i<prev.length;i++) prevIdx.set(prev[i], i);
    var currIdx = new Map(); for (var j=0;j<curr.length;j++) currIdx.set(curr[j], j);
    var union = new Set(); prev.forEach(function(id){union.add(id);}); curr.forEach(function(id){union.add(id);});
    var sum = 0;
    union.forEach(function(id){
        var pi = prevIdx.has(id) ? prevIdx.get(id) : K;
        var ci = currIdx.has(id) ? currIdx.get(id) : K;
        sum += Math.abs(pi - ci);
    });
    return sum;
}
function restoreOldBrain(){
    localStorage.setItem("bestBrain", localStorage.getItem("oldBestBrain"));
    restartBatch();
}
function resetFastLap(){
    fastLap = '--';
}
function destroyBrain(){
    localStorage.removeItem("bestBrain");
    localStorage.removeItem("fastLap");
    fastLap="--";
}
function submitTrack(){
    road.getTrack();
    road.roadEditor.checkPointModeChange(false);
    road.roadEditor.editModeChange(false);
}
function deleteTrack(){
    if(localStorage.getItem("trackInner")){
        localStorage.removeItem("trackInner");
    }
    if(localStorage.getItem("trackOuter")){
        localStorage.removeItem("trackOuter");
    }
    if(localStorage.getItem("checkPointList")){
        localStorage.removeItem("checkPointList");
    }
    location.reload();
}
function saveTrack(){
    localStorage.setItem("trackInner",JSON.stringify(road.roadEditor.points));
    localStorage.setItem("trackOuter",JSON.stringify(road.roadEditor.points2))
    localStorage.setItem("checkPointList",JSON.stringify(road.roadEditor.checkPointListEditor))
}
function savePhysics(){
    localStorage.setItem("maxSpeed", JSON.stringify(maxSpeed));
    localStorage.setItem("traction", traction);
}
function checkPoint(onOff){
    road.roadEditor.checkPointModeChange(onOff);
}
function deleteLastPoint(){
    road.roadEditor.deleteLast();
}
function resetTrainCount(){
    localStorage.setItem("trainCount", JSON.stringify(0));
    localStorage.setItem("progress", JSON.stringify([]));
    localStorage.setItem("rvAnnotations", JSON.stringify([]));
    window.__rvLastSeedIdsForGraph = null;
}
function nextPhase(){
    phase+=1;
    switch(phase){
        case 1:
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(true);
            phaseToLayout(phase);
            break;
        case 2:
            road.roadEditor.editModeChange(true);
            road.roadEditor.checkPointModeChange(true);
            phaseToLayout(phase);
            break;
        case 3:
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(false);
            phaseToLayout(phase);
            saveTrack();
            submitTrack();
            embedCurrentTrack();

            break;
        case 4:
            begin();
            road.roadEditor.checkPointModeChange(false);
            road.roadEditor.editModeChange(false);
            phaseToLayout(phase);
            submitTrack();
            // pauseGame();
            break;
    }
}
function backPhase(){
    phase-=2;
    nextPhase();
}
function setN(value){
    batchSize=value;
}
function setSeconds(value){
    nextSeconds=value;
}
function setMutateValue(value){
    mutateValue=value;
}
function restartBatch(){
    begin();
}
function setMaxSpeed(value){
    maxSpeed = value;
    begin();
}
function makeInvincible(){
    playerCar.invincible = !playerCar.invincible;
    playerCar2.invincible = !playerCar2.invincible;
    invincible = playerCar.invincible;
    document.getElementById('hide').innerText = playerCar.invincible?"Invincible Off":"Invincible On";
}
function setTraction(value){
    traction = value;
    begin();
}

// Rasterize the finalized track at 224×224 and hand it to the CNN embedder,
// then publish the resulting 512-d vector on window.currentTrackVec. main.js
// reads this global on every begin()/nextBatch() to drive bridge seeding +
// archival (see P4.C wiring). Safe to call when the bridge isn't ready or
// the embed throws — we just fall through to the stock (rv-less) path.
//
// Note: we redraw the track paths directly at the target resolution rather
// than downscaling the 3200×1800 game canvas. A 14× downscale with default
// bilinear filtering collapses 2-px strokes into ~0.14-px intensity, making
// the input effectively all-black and the embedding invariant to track
// shape. Re-rasterising with thick strokes preserves the geometry that the
// CNN needs in order to produce meaningfully different vectors per track.
function embedCurrentTrack(){
    try {
        const bridge = window.__rvBridge;
        if (!bridge || typeof bridge.info !== 'function' || !bridge.info().ready){
            return;
        }
        if (typeof road === 'undefined' || !road || !road.roadEditor) return;
        const src = document.getElementById('myCanvas');
        if (!src || !src.width || !src.height) return;

        const W = 224, H = 224;
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tctx = tmp.getContext('2d');
        tctx.fillStyle = '#000';
        tctx.fillRect(0, 0, W, H);

        const sx = W / src.width;
        const sy = H / src.height;
        const re = road.roadEditor;

        // Inner + outer track boundaries as two closed white loops.
        tctx.strokeStyle = '#ffffff';
        tctx.lineWidth = 3;
        drawPolyline(tctx, re.points, sx, sy, true);
        drawPolyline(tctx, re.points2, sx, sy, true);

        // Checkpoints in green so the embedder can key on their distribution
        // (count, spacing, orientation) distinctly from the track outline.
        tctx.strokeStyle = '#00ff00';
        tctx.lineWidth = 2;
        if (re.checkPointListEditor){
            for (const cp of re.checkPointListEditor){
                if (!cp || !cp[0] || !cp[1]) continue;
                tctx.beginPath();
                tctx.moveTo(cp[0].x * sx, cp[0].y * sy);
                tctx.lineTo(cp[1].x * sx, cp[1].y * sy);
                tctx.stroke();
            }
        }

        const rgba = tctx.getImageData(0, 0, W, H).data;
        const rgb = new Uint8Array(W * H * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3){
            rgb[j]     = rgba[i];
            rgb[j + 1] = rgba[i + 1];
            rgb[j + 2] = rgba[i + 2];
        }
        const vec = bridge.embedTrack(rgb, W, H);
        window.currentTrackVec = vec;
        const head = Array.from(vec.slice(0, 4)).map(n => n.toFixed(3)).join(', ');
        console.log(`[ruvector] track embedded — dim=${vec.length}, head=[${head}, ...]`);
    } catch (e){
        console.warn('[ruvector] embedCurrentTrack failed', e);
        window.currentTrackVec = null;
    }
}

function drawPolyline(ctx, pts, sx, sy, close){
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
    for (let i = 1; i < pts.length; i++){
        ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
    }
    if (close) ctx.closePath();
    ctx.stroke();
}