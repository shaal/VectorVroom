const canvas=document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 3200;
canvas.height = 1800;

// Fallback matches the Rectangle preset — Road/roadEditor take startInfo by
// reference, so computeStartInfoInPlace() below mutates it to the actual
// first-checkpoint midpoint once track geometry is known.
const startInfo = {x: canvas.width - canvas.width/10, y: canvas.height/2, startWidth: canvas.width/40, heading: 0};
const road=new Road(startInfo);

// Track-relative spawn: midpoint of checkpoint[0], heading toward
// checkpoint[1]'s midpoint. Falls back to the original world-coord anchor
// when no checkpoints are loaded yet (shouldn't happen past getTrack() but
// the guard keeps first-render robust).
function computeStartInfoInPlace(cpList){
    if (!cpList || !cpList.length || !cpList[0] || cpList[0].length < 2) return startInfo;
    const g0 = cpList[0];
    const mx = (g0[0].x + g0[1].x) / 2;
    const my = (g0[0].y + g0[1].y) / 2;
    let hx, hy;
    if (cpList.length >= 2 && cpList[1] && cpList[1].length >= 2){
        const g1 = cpList[1];
        hx = (g1[0].x + g1[1].x) / 2 - mx;
        hy = (g1[0].y + g1[1].y) / 2 - my;
    } else {
        // Single-checkpoint fallback: perpendicular to the gate, rotated 90° CCW.
        hx = -(g0[1].y - g0[0].y);
        hy =  (g0[1].x - g0[0].x);
    }
    // Car uses sin=dx, cos=dy convention (car.js:177-178), so heading = atan2(dx, dy).
    const heading = Math.atan2(hx, hy);
    // Offset the spawn forward along the heading by a safe distance. The first
    // checkpoint gate often runs wall-to-wall (e.g. the Triangle preset's left
    // apex), so sitting exactly on the gate leaves no lateral margin for a
    // 30×50 car body under heading jitter. One car-length of forward offset
    // puts the spawn deeper into the corridor while preserving "starts at the
    // first checkpoint" semantics (the car still has to pass cp0 on its way
    // back around on lap 2+).
    const len = Math.sqrt(hx*hx + hy*hy);
    const offset = Math.min(80, len * 0.15);   // ≤15% toward cp1, capped at 80px
    startInfo.x = mx + (len > 0 ? hx / len * offset : 0);
    startInfo.y = my + (len > 0 ? hy / len * offset : 0);
    startInfo.heading = heading;
    return startInfo;
}

// Pick checkpoints from whichever snapshot is available: road.checkPointList
// after getTrack() has run, otherwise the roadEditor's live editor array
// (populated from localStorage at page load).
function currentCheckpointList(){
    if (road.checkPointList && road.checkPointList.length) return road.checkPointList;
    const ed = road.roadEditor && road.roadEditor.checkPointListEditor;
    return (ed && ed.length) ? ed : null;
}

computeStartInfoInPlace(currentCheckpointList());

// Pose jitter config — OFF by default. Empirically, uniform-disk jitter
// around the canonical spawn regresses narrow-apex tracks (Triangle loses
// ~40% survival at radius=40) while helping wider corridors. The code path
// stays in place as an opt-in for users whose tracks have room for it:
//   window.__poseJitter = { radiusPx: 40, angleDeg: 15, maxAttempts: 8 }
// Applied to AI cars only (not elite at i=0, not player cars).
window.__poseJitter = window.__poseJitter || { radiusPx: 0, angleDeg: 0, maxAttempts: 8 };

var batchSize = 10;
var nextSeconds = 15;
var seconds;
var mutateValue = .3;
var playerCar;
var playerCar2;
// AI population lives entirely inside sim-worker.js. bestCar on main is a
// proxy object updated from snapshot messages — it mirrors just enough of the
// worker's real bestCar (position, angle, sensor state, controls, lap data)
// for rendering, perf HUD, and the save()/archive paths in buttonResponse.js.
var bestCar = null;
var bestBrainFlat = null;          // Float32Array(92) — updated on genEnd
var _cachedBestBrainObj = null;    // inflated lazily via __rvUnflatten
var _cachedBestBrainSeq = 0;       // bumped whenever bestBrainFlat replaced
var latestSnapshot = null;
var invincible=false;
var traction=0.5;

var frameCount = 0;                // mirrors worker's frameCount via snapshots
var fastLap = '--';

// Sim-speed multiplier. Worker owns the AI-car accumulator; main owns a
// parallel accumulator for the 2 player cars only. They drift slightly under
// load, but the UX impact is nil — AI training is what the user watches at
// 100×; player cars are only driven during phase-3 physics tuning at 1×.
var simSpeed = 1;
var _simStepAccum = 0;             // retained name so setSimSpeed stays stable
var _lastTickWall = performance.now();

var wallStart = performance.now();

var acceleration = .05;
var breakAccel = .05;
let pause=true;
var phase = 0; //0 welcome, 1 track, 2 checkpoints, 3 physics, 4 training
var maxSpeed = 15;
// Default entry flow: land straight on phase 4 (training) with a preloaded
// rectangle track so visitors see cars racing immediately behind a prominent
// Start button. The old draw-a-track-from-scratch flow is still one click
// away via "Customize Track" (see customizeTrack() in buttonResponse.js) and
// can also be forced with `?edit=1` on the URL for dev use.
window.__firstStart = !localStorage.getItem('trainCount');
if (new URLSearchParams(location.search).get('edit') === '1') {
    nextPhase(); // → phase 1 (track draw)
} else {
    // Replicate the state transitions that phases 1-3 produce when the user
    // walks through them: lock the editor, persist defaults, populate road
    // borders + checkpoints from the editor points, embed the track vector.
    road.roadEditor.checkPointModeChange(false);
    road.roadEditor.editModeChange(false);
    saveTrack();
    submitTrack();
    try { embedCurrentTrack(); } catch (_) {}
    // Open the SONA trajectory for the auto-boot path too — mirrors the
    // explicit-start path in buttonResponse.js:176. Without this, addPhase4Step
    // no-ops because sona/engine.js gates on `_traj` being set, and trajectory
    // recording never happens for visitors who land directly in phase 4.
    try {
        if (!window.rvDisabled && window.__rvBridge && window.__rvBridge.beginPhase4Trajectory){
            window.__rvBridge.beginPhase4Trajectory(window.currentTrackVec || null);
        }
    } catch (e) { console.warn('[sona] beginTrajectory on auto-boot failed', e); }
    phase = 3;
    nextPhase(); // → phase 4 (training)
}
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

// Perf overlay — always on, disable with `?perf=0`. Reported ~6 Hz so the
// DOM write doesn't contaminate the draw bucket it's trying to measure.
// Buckets:
//   frameDelta — time BETWEEN successive rAF fires. This is the *real* FPS
//     source: the browser caps rAF at the monitor refresh, so callback
//     duration alone would report fake FPS > 60.
//   sim        — worker's reported per-step sim time (AI cars only).
//   draw       — road + cars render on main.
//   rAF        — total main-thread callback duration; with the worker
//                refactor this should stay tiny regardless of N.
//   steps      — physics steps the worker ran since the last snapshot.
var perfEnabled = new URLSearchParams(location.search).get('perf') !== '0';
var perfBuf = { frameDelta: [], sim: [], draw: [], rAF: [], steps: [] };
var _lastRafWall = 0;
var perfBufCap = 60;
var perfTick = 0;
var perfHud = null;

// Hitch detector. Fires when the wall-time gap between expected events
// (snapshot arrival, rAF fire) exceeds HITCH_MS. This is the primary tool
// for diagnosing the periodic "freeze every few seconds" — averages in the
// perf buffer smooth over spikes and hide them. Hitches are kept in a
// small ring and rendered in the HUD + logged to console. Disable with
// `?hitch=0`.
var hitchEnabled = new URLSearchParams(location.search).get('hitch') !== '0';
var HITCH_MS = 80;
var hitches = [];
var HITCH_MAX = 6;
var _lastSnapWall = 0;
function recordHitch(kind, ms, extra){
    if (!hitchEnabled) return;
    var entry = { t: performance.now(), kind: kind, ms: ms, extra: extra || '' };
    hitches.push(entry);
    if (hitches.length > HITCH_MAX) hitches.shift();
    try { console.warn('[hitch]', kind, ms.toFixed(1) + 'ms', extra || ''); } catch(_){}
}
function perfPush(key, v){
    var arr = perfBuf[key];
    arr.push(v);
    if (arr.length > perfBufCap) arr.shift();
}
function perfAvg(arr){
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}
function perfEnsureHud(){
    if (perfHud) return perfHud;
    perfHud = document.createElement('div');
    perfHud.id = 'perf-hud';
    perfHud.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99998;' +
        'background:rgba(12,14,18,.88);color:#a8e6a0;padding:8px 10px;' +
        'border-radius:4px;font:11px/1.35 ui-monospace,Menlo,monospace;' +
        'pointer-events:none;min-width:170px;';
    perfHud.addEventListener('click', function(){ perfHud.classList.toggle('expanded'); });
    document.body.appendChild(perfHud);
    return perfHud;
}
var RENDER_TOP_K = (function(){
    var p = new URLSearchParams(location.search).get('topK');
    var n = p ? parseInt(p, 10) : 32;
    return (isFinite(n) && n >= 0) ? n : 32;
})();
var FULL_RENDER = new URLSearchParams(location.search).get('fullRender') === '1';

// Step cap mirrors worker's MAX_STEPS — applied here only to the main-thread
// player-car accumulator so a frozen tab coming back doesn't stampede 2
// player cars through a thousand backlogged physics steps.
var MAX_STEPS_PER_RAF = 60;

// Player-car sensor stride. AI-car stride lives inside the worker.
var SENSOR_STRIDE = 1;
function computeSensorStride(){
    if (simSpeed <= 2) return 1;
    if (simSpeed <= 5) return 2;
    if (simSpeed <= 20) return 3;
    return 4;
}

function perfRender(){
    if (!perfEnabled) return;
    var hud = perfEnsureHud();
    var frameDelta = perfAvg(perfBuf.frameDelta);
    var sim = perfAvg(perfBuf.sim);
    var draw = perfAvg(perfBuf.draw);
    var work = perfAvg(perfBuf.rAF);
    var steps = perfAvg(perfBuf.steps);
    var fps = frameDelta > 0 ? (1000 / frameDelta).toFixed(1) : '--';
    var nCars = latestSnapshot ? latestSnapshot.N : 0;
    var fpsColor = '#a8e6a0';
    if (frameDelta > 0){
        var fpsNum = 1000 / frameDelta;
        if (fpsNum < 30) fpsColor = '#f07070';
        else if (fpsNum < 55) fpsColor = '#f0c060';
    }
    // Hitches block is wrapped in .perf-hitches — collapsed by default via
    // CSS, click anywhere on #perf-hud to toggle the .expanded class.
    var hitchHtml = '';
    if (hitchEnabled){
        var nowT = performance.now();
        var hitchLines = '';
        for (var i = hitches.length - 1; i >= 0; i--){
            var h = hitches[i];
            var ago = ((nowT - h.t) / 1000).toFixed(1);
            var col = h.ms > 300 ? '#f07070' : '#f0c060';
            hitchLines += '<div style="color:' + col + ';opacity:.9;">' +
                h.ms.toFixed(0) + 'ms ' + h.kind +
                (h.extra ? ' <span style="opacity:.7;">' + h.extra + '</span>' : '') +
                ' <span style="opacity:.55;">-' + ago + 's</span></div>';
        }
        var count = hitches.length;
        hitchHtml =
            '<div class="perf-hitches-header" style="margin-top:6px;border-top:1px solid #334;padding-top:4px;color:#f0c060;font-size:.95em;">' +
                'hitches (' + count + ') <span style="opacity:.6;font-size:.85em;">click to toggle</span>' +
            '</div>' +
            '<div class="perf-hitches">' + hitchLines + '</div>';
    }
    hud.innerHTML =
        '<div style="color:#fff;margin-bottom:3px;"><b>perf</b></div>' +
        '<div style="font-size:1.4em;line-height:1.1;color:' + fpsColor + ';">' + fps + ' <span style="font-size:.6em;opacity:.7;">fps</span></div>' +
        '<div style="margin-top:4px;opacity:.85;">N=' + nCars + '</div>' +
        '<div style="margin-top:3px;">sim   ' + sim.toFixed(2) + ' ms <span style="opacity:.55;font-size:.85em">(worker)</span></div>' +
        '<div>draw  ' + draw.toFixed(2) + ' ms</div>' +
        '<div>main  ' + work.toFixed(2) + ' ms</div>' +
        '<div>steps ' + steps.toFixed(1) + '/snap</div>' +
        hitchHtml;
}

function bridgeReady(){
    if (rvDisabled) return false;
    var b = window.__rvBridge;
    return !!(b && b.info && b.info().ready && window.__rvUnflatten);
}

// -----------------------------------------------------------------------------
// Metrics HUD — per-generation survival %, median / p90 checkpoints, wall-bumps.
// Also serves as the on-screen data source for __runBenchmark / __abTest CSVs.
// -----------------------------------------------------------------------------
var metricsHud = null;
var metricsEnabled = true;
var __metricsLog = [];          // every genEnd appends one row (HUD ring + CSV source)
var __metricsLiveAlive = 0;     // updated per-tick from handleSnapshot
var __benchmarkCtx = null;      // set while __runBenchmark is active

function metricsEnsureHud(){
    if (metricsHud) return metricsHud;
    metricsHud = document.createElement('div');
    metricsHud.id = 'metrics-hud';
    metricsHud.style.cssText = 'position:fixed;top:8px;right:196px;z-index:99998;' +
        'background:rgba(12,14,18,.88);color:#a8c8ff;padding:8px 10px;' +
        'border-radius:4px;font:11px/1.35 ui-monospace,Menlo,monospace;' +
        'pointer-events:none;min-width:180px;';
    document.body.appendChild(metricsHud);
    return metricsHud;
}

function __percentileI16(sortedArr, q){
    if (!sortedArr.length) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * q));
    return sortedArr[idx];
}

function metricsComputeRow(m){
    const FPS = 60;
    const N = m.popN | 0;
    if (!N || !m.popCheckpoints) return null;
    const cpSorted = Int16Array.from(m.popCheckpoints).sort();
    const df = m.popDeathFrames;
    const survivedAt = (frameBudget) => {
        let alive = 0;
        for (let i = 0; i < N; i++){ if (df[i] === -1 || df[i] > frameBudget) alive++; }
        return alive / N;
    };
    return {
        gen: generation,
        popN: N,
        medCheckpoints: __percentileI16(cpSorted, 0.5),
        p90Checkpoints: __percentileI16(cpSorted, 0.9),
        maxCheckpoints: cpSorted[N - 1],
        wallBumps: m.popWallBumps | 0,
        stillAlive: m.popStillAlive | 0,
        survival5s:  +survivedAt(5  * FPS).toFixed(4),
        survival10s: +survivedAt(10 * FPS).toFixed(4),
        survivalEnd: +(m.popStillAlive / N).toFixed(4),
        bestFitness: m.fitness,
        bestLaps: m.laps,
        bestLapMin: (m.lapTimes && m.lapTimes.length) ? Math.min.apply(null, m.lapTimes) : null,
        genSeconds: m.genSeconds
    };
}

function metricsRender(){
    if (!metricsEnabled) return;
    const hud = metricsEnsureHud();
    const last = __metricsLog[__metricsLog.length - 1];
    const liveN = latestSnapshot ? latestSnapshot.N : 0;
    const pct = (v) => (v * 100).toFixed(0) + '%';
    let body = '<div style="color:#fff;margin-bottom:3px;"><b>metrics</b></div>';
    body += '<div>alive ' + __metricsLiveAlive + ' / ' + liveN + '</div>';
    if (last){
        body += '<div style="margin-top:4px;opacity:.75;font-size:.9em;">gen ' + last.gen + ' · N=' + last.popN + '</div>';
        body += '<div>med cp  <b>' + last.medCheckpoints + '</b> · p90 <b>' + last.p90Checkpoints + '</b> · max <b>' + last.maxCheckpoints + '</b></div>';
        body += '<div>wall-bumps <b>' + last.wallBumps + '</b></div>';
        body += '<div>surv 5s <b>' + pct(last.survival5s) + '</b> · 10s <b>' + pct(last.survival10s) + '</b> · end <b>' + pct(last.survivalEnd) + '</b></div>';
    } else {
        body += '<div style="opacity:.6;">(awaiting first genEnd)</div>';
    }
    if (__benchmarkCtx){
        body += '<div style="margin-top:4px;color:#f0c060;">bench: ' + __benchmarkCtx.label +
                ' (' + __benchmarkCtx.done + '/' + __benchmarkCtx.target + ')</div>';
    }
    hud.innerHTML = body;
}

// -----------------------------------------------------------------------------
// Worker bootstrap + message plumbing
// -----------------------------------------------------------------------------
const simWorker = new Worker('sim-worker.js');
var workerReady = false;
var workerInited = false;
var pendingBegin = null;

simWorker.onmessage = (ev) => {
    const m = ev.data;
    switch (m.type){
        case 'ready':
            workerReady = true;
            if (pendingBegin){ const pb = pendingBegin; pendingBegin = null; performBegin(pb.N); }
            break;
        case 'snapshot':
            handleSnapshot(m);
            break;
        case 'genEnd':
            handleGenEnd(m);
            break;
        case 'debug':
            if (hitchEnabled && m.event === 'beginBuilt' && m.ms > 30){
                recordHitch('workerBegin', m.ms, 'N=' + m.N);
            }
            if (hitchEnabled && m.event === 'slowTick'){
                // Classify the slow tick so we can see at a glance which
                // bucket is the culprit: GC pause, one huge step, or post.
                const parts = [];
                if (m.gap  > 20) parts.push('gap=' + m.gap.toFixed(0));
                if (m.tick > 30) parts.push('tick=' + m.tick.toFixed(0));
                if (m.maxStep > 25) parts.push('maxStep=' + m.maxStep.toFixed(0));
                if (m.post > 5)   parts.push('post=' + m.post.toFixed(0));
                const totalMs = m.gap + m.tick;
                recordHitch('wkTick', totalMs, parts.join(' ') + ' st=' + m.steps);
            }
            break;
    }
};
simWorker.onerror = (err) => {
    console.error('[sim-worker] error', err.message || err, err.filename, err.lineno);
};

// bestCar identity epoch: the worker increments bestEpoch each time a new
// car is promoted. Main creates a fresh proxy object on every change so the
// dynamics embedder's identity-based reset (_owningCar !== car) fires
// correctly at generation boundaries.
var _bestProxyEpoch = -1;
function handleSnapshot(m){
    if (hitchEnabled){
        const now = performance.now();
        if (_lastSnapWall > 0){
            const gap = now - _lastSnapWall;
            if (gap > HITCH_MS) recordHitch('snapGap', gap);
        }
        _lastSnapWall = now;
    }
    latestSnapshot = m;
    frameCount = m.frameCount;
    // Live alive-count: position stride is 5 per car, field 3 is damaged 0|1.
    if (m.positions && m.N){
        let alive = 0;
        const N = m.N, pos = m.positions;
        for (let i = 0; i < N; i++){ if (!pos[i*5 + 3]) alive++; }
        __metricsLiveAlive = alive;
    }
    if (m.bestIdx >= 0){
        if (m.bestEpoch !== _bestProxyEpoch || !bestCar){
            bestCar = makeBestCarProxy();
            _bestProxyEpoch = m.bestEpoch;
        }
        updateBestCarProxy(bestCar, m);
        // Sample rate: ~60Hz regardless of simSpeed. Old code ran recordFrame
        // inside the per-step loop (so at simSpeed=100 × N=big, thousands of
        // calls/sec); now it's one per snapshot. The temporal embedder summary
        // stats don't need the extra resolution — spacing is uniform.
        if (window.__rvDynamics){
            try { window.__rvDynamics.recordFrame(bestCar); } catch (_) {}
        }
    }
}

function makeBestCarProxy(){
    const proxy = {
        x: 0, y: 0, angle: 0, damaged: false,
        speed: 0, maxSpeed: 0,
        checkPointsCount: 0, laps: 0, lapTimes: '--',
        controls: { forward: false, left: false, right: false, reverse: false },
        sensor: { rayCount: 5, rays: [], readings: [] }
    };
    // Lazy-inflated brain — save() and archiveBrain() both read bestCar.brain.
    // We key the cache on _cachedBestBrainSeq so a stale inflate survives only
    // until the next genEnd overwrites bestBrainFlat. Uses the inline
    // inflater rather than window.__rvUnflatten so save() keeps working even
    // when the ruvector sidecar failed to load (wasm 404, etc).
    Object.defineProperty(proxy, 'brain', {
        get(){
            if (!bestBrainFlat) return null;
            if (_cachedBestBrainObj && proxy.__brainSeq === _cachedBestBrainSeq){
                return _cachedBestBrainObj;
            }
            _cachedBestBrainObj = inflateBrainInline(bestBrainFlat);
            proxy.__brainSeq = _cachedBestBrainSeq;
            return _cachedBestBrainObj;
        },
        configurable: true
    });
    return proxy;
}

function updateBestCarProxy(p, m){
    const i = m.bestIdx;
    const pos = m.positions;
    p.x = pos[i*5];
    p.y = pos[i*5 + 1];
    p.angle = pos[i*5 + 2];
    p.damaged = !!m.bestDamaged;
    p.speed = m.bestSpeed;
    p.maxSpeed = m.bestMaxSpeed;
    p.checkPointsCount = m.bestCheckpoints;
    p.laps = m.bestLaps;
    p.lapTimes = (m.bestLapTimes && m.bestLapTimes.length) ? m.bestLapTimes : '--';
    p.controls.forward = !!(m.bestControls && m.bestControls[0]);
    p.controls.left    = !!(m.bestControls && m.bestControls[1]);
    p.controls.right   = !!(m.bestControls && m.bestControls[2]);
    p.controls.reverse = !!(m.bestControls && m.bestControls[3]);

    // Rebuild rays/readings in the shape sensor.draw() and dynamicsEmbedder
    // expect: rays = Array<[{x,y},{x,y}]>, readings = Array<null|{x,y,offset}>.
    const rays = [], readings = [];
    if (m.bestRays){
        const R = m.bestRays;
        const nRays = R.length / 4;
        for (let i = 0; i < nRays; i++){
            rays.push([
                {x: R[i*4],     y: R[i*4 + 1]},
                {x: R[i*4 + 2], y: R[i*4 + 3]}
            ]);
        }
    }
    if (m.bestReadings){
        const R = m.bestReadings;
        const nR = R.length / 3;
        for (let i = 0; i < nR; i++){
            const offset = R[i*3 + 2];
            if (offset < 0){
                readings.push(null);
            } else {
                readings.push({x: R[i*3], y: R[i*3 + 1], offset});
            }
        }
    }
    p.sensor.rays = rays;
    p.sensor.readings = readings;
}

function handleGenEnd(m){
    bestBrainFlat = m.bestBrain;
    _cachedBestBrainSeq++;
    if (bestCar){
        bestCar.laps = m.laps;
        bestCar.lapTimes = m.lapTimes && m.lapTimes.length ? m.lapTimes : '--';
        bestCar.checkPointsCount = m.checkPointsCount;
    }
    // Feed one SONA trajectory step per generation — elite's last-tick hidden
    // activations as the embedding, generation fitness as the reward scalar.
    // Lazy-open the trajectory on the first genEnd after SONA becomes ready,
    // because the bridge loads async and the auto-boot call in the phase init
    // block above sometimes fires before sonaReady() returns true.
    try {
        const b = window.__rvBridge;
        if (!window.rvDisabled && b && b.info){
            const i = b.info();
            if (i.sona && i.sona.ready && !i.sona.trajectoryOpen && b.beginPhase4Trajectory){
                // Lazy-embed: currentTrackVec may be null if the module-load
                // call to embedCurrentTrack ran before the bridge's async init
                // finished. Retry here; beginTrajectory refuses null vecs.
                if (!window.currentTrackVec && typeof embedCurrentTrack === 'function'){
                    try { embedCurrentTrack(); } catch (_) {}
                }
                b.beginPhase4Trajectory(window.currentTrackVec || null);
            }
            if (b.addPhase4Step && m.bestHiddenActivations){
                b.addPhase4Step(m.bestHiddenActivations, null, m.fitness || 0);
            }
        }
    } catch (e) { console.warn('[sona] genEnd hook failed', e); }
    try {
        const row = metricsComputeRow(m);
        if (row){
            __metricsLog.push(row);
            if (__metricsLog.length > 5000) __metricsLog.shift();
            metricsRender();
            if (__benchmarkCtx && !__benchmarkCtx.done_flag){
                __benchmarkCtx.done += 1;
                const liveRv = __rvToggleSnapshot();
                liveRv.trackLabel = __benchmarkCtx.config.trackLabel;
                liveRv.cold = __benchmarkCtx.config.cold;
                __benchmarkCtx.rows.push(Object.assign({label: __benchmarkCtx.label}, liveRv, row));
                if (__benchmarkCtx.done >= __benchmarkCtx.target){
                    __benchmarkCtx.done_flag = true;
                    __benchmarkCtx.resolve(__benchmarkCtx.rows.slice());
                }
            }
        }
    } catch (e){ console.warn('[metrics] genEnd handler failed', e); }
    performNextBatch(m);
}

// -----------------------------------------------------------------------------
// Brain buffer builder — produces the N×92 Float32Array shipped to the worker.
// Applies ruvector seeding / localStorage fallback + mutation directly on flat
// weights (no intermediate NeuralNetwork objects for the bulk of the population).
// -----------------------------------------------------------------------------
const FLAT_LENGTH = 92;

function flattenBrainInline(brain){
    const out = new Float32Array(FLAT_LENGTH);
    let k = 0;
    for (let L = 0; L < brain.levels.length; L++){
        const level = brain.levels[L];
        for (let j = 0; j < level.biases.length;  j++) out[k++] = level.biases[j];
        for (let w = 0; w < level.weights.length; w++) out[k++] = level.weights[w];
    }
    return out;
}
// Mirror of brainCodec.unflatten — standalone so bestCar.brain keeps working
// when the ES-module sidecar fails to load.
function inflateBrainInline(flat){
    if (!flat) return null;
    const NN = globalThis.NeuralNetwork;
    if (!NN) return null;
    const net = new NN([6, 8, 4]);
    let k = 0;
    for (let L = 0; L < net.levels.length; L++){
        const level = net.levels[L];
        for (let j = 0; j < level.biases.length;  j++) level.biases[j]  = flat[k++];
        for (let w = 0; w < level.weights.length; w++) level.weights[w] = flat[k++];
    }
    return net;
}
function copyFlat(dst, dstOff, src){
    for (let i = 0; i < FLAT_LENGTH; i++) dst[dstOff + i] = src[i];
}
function fillMutated(dst, dstOff, src, amt){
    if (amt <= 0){ copyFlat(dst, dstOff, src); return; }
    for (let i = 0; i < FLAT_LENGTH; i++){
        dst[dstOff + i] = lerp(src[i], Math.random() * 2 - 1, amt);
    }
}
function fillRandom(dst, dstOff){
    for (let i = 0; i < FLAT_LENGTH; i++) dst[dstOff + i] = Math.random() * 2 - 1;
}

function buildBrainsBuffer(N){
    const out = new Float32Array(N * FLAT_LENGTH);
    currentSeedIds = [];
    let seededFromBridge = false;

    if (bridgeReady()){
        try {
            const bridge = window.__rvBridge;
            const trackVec = window.currentTrackVec || null;
            if (window.__rvDynamics && typeof bridge.setQueryDynamicsVec === 'function'){
                try {
                    const qDyn = window.__rvDynamics.queryVector();
                    bridge.setQueryDynamicsVec(qDyn);
                } catch (_) {}
            }
            const seeds = bridge.recommendSeeds(trackVec, 10);
            if (seeds && seeds.length > 0){
                currentSeedIds = seeds.map(s => s.id);
                const nElite = Math.min(1, N);
                const nNovel = Math.max(1, Math.floor(N * 0.1));
                const remaining = N - nElite - nNovel;
                const nLight = Math.max(0, Math.floor(remaining / 2));
                const nHeavy = Math.max(0, remaining - nLight);
                const lightAmt = mutateValue * 0.5;
                const heavyAmt = Math.min(1, mutateValue * 1.8);
                for (let i = 0; i < N; i++){
                    const off = i * FLAT_LENGTH;
                    if (i < nElite){
                        copyFlat(out, off, seeds[0].vector);
                    } else if (i < nElite + nLight){
                        fillMutated(out, off, seeds[(i - nElite) % seeds.length].vector, lightAmt);
                    } else if (i < nElite + nLight + nHeavy){
                        fillMutated(out, off, seeds[(i - nElite - nLight) % seeds.length].vector, heavyAmt);
                    } else {
                        fillRandom(out, off);
                    }
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

    if (!seededFromBridge){
        if (localStorage.getItem("bestBrain")){
            const savedBrain = JSON.parse(localStorage.getItem("bestBrain"));
            const savedNN = reviveBrain(savedBrain);
            const savedFlat = flattenBrainInline(savedNN);
            for (let i = 0; i < N; i++){
                const off = i * FLAT_LENGTH;
                if (i === 0) copyFlat(out, off, savedFlat);
                else fillMutated(out, off, savedFlat, mutateValue);
            }
        } else {
            fillRandom(out, 0);
            for (let i = 1; i < N; i++){
                const off = i * FLAT_LENGTH;
                fillRandom(out, off);
            }
        }
    }
    return out;
}

// -----------------------------------------------------------------------------
// begin() / nextBatch() — lifecycle
// -----------------------------------------------------------------------------
function begin(){
    seconds = nextSeconds;
    pause = false;
    computeStartInfoInPlace(currentCheckpointList());
    playerCar = new Car(startInfo.x, startInfo.y, 30, 50, "KEYS", maxSpeed, startInfo.heading);
    playerCar2 = new Car(startInfo.x, startInfo.y, 30, 50, "WASD", maxSpeed, startInfo.heading);
    frameCount = 0;
    wallStart = performance.now();
    _simStepAccum = 1;
    _lastTickWall = performance.now();
    bestCar = null;
    _bestProxyEpoch = -1;
    latestSnapshot = null;

    if (phase !== 4) return;  // worker only engages during phase-4 training

    if (!workerReady){
        pendingBegin = { N: batchSize };
        return;
    }
    performBegin(batchSize);
}

function performBegin(N){
    if (!workerInited){
        // Copy borders + checkpoints to plain {x,y} objects so postMessage can
        // structured-clone them. The live Road objects contain references to
        // the road editor's mutable point array — transferring raw refs would
        // break structured clone if those ever grow non-plain properties.
        const borders = road.borders.map(b => [{x:b[0].x,y:b[0].y},{x:b[1].x,y:b[1].y}]);
        const checkPointList = (road.checkPointList || []).map(c => [{x:c[0].x,y:c[0].y},{x:c[1].x,y:c[1].y}]);
        simWorker.postMessage({
            type: 'init',
            canvasW: canvas.width,
            canvasH: canvas.height,
            borders, checkPointList
        });
        workerInited = true;
    }
    const brains = buildBrainsBuffer(N);
    simWorker.postMessage({
        type: 'begin',
        N, seconds, maxSpeed, traction,
        startInfo: { x: startInfo.x, y: startInfo.y, heading: startInfo.heading || 0 },
        poseJitter: Object.assign({ radiusPx: 0, angleDeg: 0, maxAttempts: 8 }, window.__poseJitter || {}),
        brains
    }, [brains.buffer]);
}

// Invalidate cached worker state when the track changes (phase 1→4 cycle
// reuses road.borders but with different geometry).
function invalidateWorkerInit(){ workerInited = false; }

// In-memory track switch for benchmarking — preserves SONA patterns and other
// window-level state that page reload would wipe. Caller is responsible for
// ensuring the preset exists in window.TRACK_PRESETS.
window.__switchTrackInMemory = function(name){
    if (typeof loadTrackPreset !== 'function') return false;
    if (!loadTrackPreset(name)) return false;
    // road.getTrack() appends to road.borders, so reset to the canvas-edge
    // quad before rebuilding (mirrors the initial state in road.js:18-22).
    road.innerList = [];
    road.outerList = [];
    road.checkPointList = [];
    const w = canvas.width, h = canvas.height;
    road.borders = [
        [{x:0,y:0},{x:0,y:h}],
        [{x:w,y:0},{x:w,y:h}],
        [{x:0,y:0},{x:w,y:0}],
        [{x:0,y:h},{x:w,y:h}]
    ];
    try { road.getTrack(); } catch (_) {}
    computeStartInfoInPlace(currentCheckpointList());
    invalidateWorkerInit();
    // Re-embed track vector for the new track so SONA patterns key correctly.
    try { if (typeof embedCurrentTrack === 'function') embedCurrentTrack(); } catch (_) {}
    return true;
};

// Called from the Reset Brain button — user-initiated restart, no archive.
function nextBatch(){ begin(); }

// Called from the worker's genEnd message — full archive + observe + begin.
function performNextBatch(genData){
    const _genT0 = performance.now();
    const _times = {};
    if (localStorage.getItem("trainCount")){
        localStorage.setItem("trainCount", JSON.stringify(JSON.parse(localStorage.getItem("trainCount"))+1));
    } else {
        localStorage.setItem("trainCount", JSON.stringify(1));
    }
    const _tSave = performance.now();
    if (bestBrainFlat){
        try { save(); } catch (e) { console.warn('save failed', e); }
    }
    _times.save = performance.now() - _tSave;
    if (genData.laps > 0 && genData.lapTimes && genData.lapTimes.length){
        const minLap = Math.min.apply(null, genData.lapTimes);
        if (fastLap === '--' || minLap < fastLap){
            fastLap = minLap;
            localStorage.setItem('fastLap', JSON.stringify(fastLap));
        }
    }

    const _tArchive = performance.now();
    if (bridgeReady() && bestBrainFlat){
        try {
            const fitness = genData.fitness;
            const trackVec = window.currentTrackVec || null;
            const batchFastest = (genData.laps > 0 && genData.lapTimes && genData.lapTimes.length)
                ? Math.min.apply(null, genData.lapTimes) : undefined;
            let dynamicsVec = null;
            if (window.__rvDynamics){
                try { dynamicsVec = window.__rvDynamics.finalizeVector(); } catch (_) {}
            }
            const brainObj = window.__rvUnflatten(bestBrainFlat);
            window.__rvBridge.archiveBrain(
                brainObj, fitness, trackVec, generation, currentSeedIds.slice(), batchFastest, dynamicsVec
            );
            if (!window.__rvSessionBestFitness || fitness > window.__rvSessionBestFitness){
                window.__rvSessionBestFitness = fitness;
            }
            if (window.__rvDynamics){
                try { window.__rvDynamics.reset(); } catch (_) {}
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
    _times.archive = performance.now() - _tArchive;
    generation += 1;

    const _tGraph = performance.now();
    if (typeof graphProgress === 'function'){
        try { graphProgress(); } catch (e) {}
    }
    _times.graph = performance.now() - _tGraph;

    const _tBegin = performance.now();
    begin();
    _times.begin = performance.now() - _tBegin;

    const totalMs = performance.now() - _genT0;
    if (hitchEnabled && totalMs > 30){
        const extra = 'save=' + _times.save.toFixed(0) +
            ' arch=' + _times.archive.toFixed(0) +
            ' graph=' + _times.graph.toFixed(0) +
            ' begin=' + _times.begin.toFixed(0);
        recordHitch('genEnd', totalMs, extra);
    }
}

begin();
// First-visit: keep the sim paused so the user clicks the "▶ Start Training"
// CTA. begin() flips pause=false, so we re-pause here AFTER it runs. Phase-4
// layout already relabels the pause button; this just makes sure the sim
// doesn't start stepping before the user opts in.
if (window.__firstStart){
    pause = true;
}
animate();

// -----------------------------------------------------------------------------
// Main-thread rAF — renders road, snapshot-driven AI cars, and local player cars.
// -----------------------------------------------------------------------------
function animate(){
    var _perfFrameStart = perfEnabled ? performance.now() : 0;
    if (perfEnabled){
        if (_lastRafWall > 0){
            var _delta = _perfFrameStart - _lastRafWall;
            if (_delta > 0 && _delta < 1000) perfPush('frameDelta', _delta);
            if (hitchEnabled && _delta > HITCH_MS && _delta < 1500 && phase === 4 && !pause){
                recordHitch('rafGap', _delta);
            }
        }
        _lastRafWall = _perfFrameStart;
    }
    var _perfDraw = 0;
    var _perfT0 = perfEnabled ? performance.now() : 0;
    road.draw(ctx);
    if (perfEnabled) _perfDraw += performance.now() - _perfT0;

    if(phase==3){
        playerCar.update(road.borders, road.checkPointList);
        // Player car 1: crimson instead of pure "red" so (a) it is not the
        // same pigment as the start-flag triangle and (b) it separates from
        // the amber AI cars under deuteranopia/protanopia. Contrast ~5.6:1.
        playerCar.draw(ctx,"#E6194B",true);
        playerCar2.update(road.borders, road.checkPointList);
        // Player car 2: sky blue instead of CSS-named "blue" (#0000FF is
        // 2.5:1 — unreadable). #4FC3F7 sits around 7:1 and is CVD-safe
        // against the amber AI population.
        playerCar2.draw(ctx,"#4FC3F7",true);
    }
    if(phase==4){
        const timer = document.getElementById("timer");
        const simSecs = (frameCount/60).toFixed(2);
        const wallSecs = ((performance.now() - wallStart)/1000).toFixed(2);
        timer.innerHTML = "<p>Sim Time: " + simSecs + "s " +
            "<span style='opacity:.65;font-size:.85em'>(wall " + wallSecs + "s &middot; " + simSpeed + "&times;)</span></p>";
        timer.innerHTML += "<p>Fast Lap: " + (typeof fastLap === 'number' ? fastLap.toFixed(2) : fastLap) + "</p>";
        ctx.save();

        if(!pause){
            // Local player-car accumulator. Runs in parallel with the worker's;
            // exact lockstep isn't needed because player cars only matter when
            // the user is actually driving (usually simSpeed=1).
            const now = performance.now();
            let dt = (now - _lastTickWall) / 1000;
            _lastTickWall = now;
            if (dt > 0.25) dt = 0.25;
            _simStepAccum += simSpeed * dt * 60;
            let playerSteps = Math.floor(_simStepAccum);
            _simStepAccum -= playerSteps;
            if (playerSteps > MAX_STEPS_PER_RAF){ playerSteps = MAX_STEPS_PER_RAF; _simStepAccum = 0; }
            SENSOR_STRIDE = computeSensorStride();
            for (let s = 0; s < playerSteps; s++){
                playerCar.update(road.borders, road.checkPointList);
                playerCar2.update(road.borders, road.checkPointList);
            }

            const _perfDrawT0 = perfEnabled ? performance.now() : 0;
            if (latestSnapshot){
                drawFromSnapshot(latestSnapshot);
            }
            if (bestCar){
                inputVisual(bestCar.controls);
                drawBestCar(bestCar);
            }
            playerCar.draw(ctx,"#E6194B",true);
            playerCar2.draw(ctx,"#4FC3F7",true);
            if (perfEnabled) _perfDraw += performance.now() - _perfDrawT0;
        }
        ctx.restore();
    }
    if (perfEnabled){
        try {
            var simMs = latestSnapshot ? latestSnapshot.simMs : 0;
            var steps = latestSnapshot ? latestSnapshot.steps : 0;
            perfPush('sim', simMs);
            perfPush('draw', _perfDraw);
            perfPush('rAF', performance.now() - _perfFrameStart);
            perfPush('steps', steps);
            if ((++perfTick % 10) === 0) { perfRender(); metricsRender(); }
        } catch (e){
            console.error('[perf] HUD error — disabling instrumentation', e);
            perfEnabled = false;
        }
    }
    requestAnimationFrame(animate);
}

// -----------------------------------------------------------------------------
// Snapshot rendering — reads Float32Array positions and issues minimal canvas
// calls. Top-K path sorts live cars by fitness (field 4 of the 5-wide stride)
// and draws the rest as a single batched dot fill.
// -----------------------------------------------------------------------------
function drawFromSnapshot(snap){
    const N = snap.N;
    const pos = snap.positions;

    if (FULL_RENDER){
        ctx.globalAlpha = 0.2;
        for (let i = 0; i < N; i++){
            const base = i * 5;
            ctx.fillStyle = pos[base + 3] !== 0 ? "gray" : "rgb(227, 138, 15)";
            drawCarQuad(pos[base], pos[base + 1], pos[base + 2]);
        }
        ctx.globalAlpha = 1;
        return;
    }

    const liveIdx = [];
    for (let i = 0; i < N; i++){
        if (pos[i * 5 + 3] === 0) liveIdx.push(i);
    }
    liveIdx.sort((a, b) => pos[b * 5 + 4] - pos[a * 5 + 4]);
    const kDraw = Math.min(RENDER_TOP_K, liveIdx.length);

    if (liveIdx.length > kDraw){
        ctx.fillStyle = "rgba(227, 138, 15, 0.55)";
        ctx.beginPath();
        for (let i = kDraw; i < liveIdx.length; i++){
            const idx = liveIdx[i];
            ctx.rect(pos[idx * 5] - 2, pos[idx * 5 + 1] - 2, 4, 4);
        }
        ctx.fill();
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgb(227, 138, 15)";
    for (let i = 0; i < kDraw; i++){
        const idx = liveIdx[i];
        drawCarQuad(pos[idx * 5], pos[idx * 5 + 1], pos[idx * 5 + 2]);
    }
    ctx.globalAlpha = 1;
}

// Pre-computed quad geometry — cars are 30×50 so rad/alpha are constants.
const _CAR_RAD = Math.hypot(30, 50) / 2;
const _CAR_ALPHA = Math.atan2(30, 50);
function drawCarQuad(x, y, angle){
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(angle - _CAR_ALPHA) * _CAR_RAD, y - Math.cos(angle - _CAR_ALPHA) * _CAR_RAD);
    ctx.lineTo(x - Math.sin(angle + _CAR_ALPHA) * _CAR_RAD, y - Math.cos(angle + _CAR_ALPHA) * _CAR_RAD);
    ctx.lineTo(x - Math.sin(Math.PI + angle + _CAR_ALPHA) * _CAR_RAD, y - Math.cos(Math.PI + angle + _CAR_ALPHA) * _CAR_RAD);
    ctx.lineTo(x - Math.sin(Math.PI + angle - _CAR_ALPHA) * _CAR_RAD, y - Math.cos(Math.PI + angle - _CAR_ALPHA) * _CAR_RAD);
    ctx.fill();
}

function drawBestCar(bc){
    ctx.fillStyle = bc.damaged ? "gray" : "rgb(227, 138, 15)";
    drawCarQuad(bc.x, bc.y, bc.angle);
    if (bc.sensor && bc.sensor.rays && bc.sensor.rays.length){
        for (let i = 0; i < bc.sensor.rays.length; i++){
            const ray = bc.sensor.rays[i];
            const reading = bc.sensor.readings[i];
            const end = reading ? reading : ray[1];
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "yellow";
            ctx.moveTo(ray[0].x, ray[0].y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = "black";
            ctx.moveTo(ray[1].x, ray[1].y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
    }
}

// -----------------------------------------------------------------------------
// Benchmark console helpers — __runBenchmark, __abTest, __clearArchive,
// __downloadCSV. Used to produce CSVs for the Phase 0 baseline captures and
// the ruvector A/B proof charts in docs/plan/generalization-fix.md.
// -----------------------------------------------------------------------------
function __rvToggleSnapshot(){
    const info = (window.__rvBridge && window.__rvBridge.info) ? window.__rvBridge.info() : null;
    const policy = info && info.policy ? info.policy : {};
    return {
        vectorMemory: !window.rvDisabled,
        reranker: policy.reranker || '',
        adapter: policy.adapter || '',
        index: policy.index || '',
        dynamics: !!policy.dynamics,
        archiveBrains: info ? (info.brains | 0) : 0,
        archiveTracks: info ? (info.tracks | 0) : 0,
        archiveObservations: info ? (info.observations | 0) : 0
    };
}

function __applyRvConfig(cfg){
    if (!cfg) return;
    if (typeof cfg.vectorMemory === 'boolean') window.rvDisabled = !cfg.vectorMemory;
    const b = window.__rvBridge;
    if (!b) return;
    if (cfg.reranker && b.setRerankerMode) b.setRerankerMode(cfg.reranker);
    if (cfg.adapter  && b.setAdapterMode)  b.setAdapterMode(cfg.adapter);
    if (cfg.index    && b.setIndexKind)    b.setIndexKind(cfg.index);
    if (typeof cfg.dynamics === 'boolean' && b.setUseDynamics) b.setUseDynamics(cfg.dynamics);
}

window.__clearArchive = async function(){
    if (!window.__rvBridge || !window.__rvBridge._debugReset){
        console.warn('[bench] __rvBridge._debugReset unavailable'); return;
    }
    await window.__rvBridge._debugReset();
    try { localStorage.removeItem('bestBrain'); localStorage.removeItem('progress'); } catch (_) {}
    console.log('[bench] archive cleared');
};

window.__runBenchmark = async function(gens, opts){
    opts = opts || {};
    const label = opts.label || 'run';
    if (phase !== 4) throw new Error('__runBenchmark requires phase 4 (training). Current phase=' + phase);
    if (__benchmarkCtx) throw new Error('__runBenchmark already active ("' + __benchmarkCtx.label + '"). Await it or cancel before starting another.');

    // Soft-warn on settings that produce thin or slow data.
    if (typeof batchSize !== 'undefined' && batchSize < 100){
        console.warn('[bench] batchSize=' + batchSize + ' is low — population-wide stats are noisy. Raise via the Training tuning slider (target: 500–1000).');
    }
    if (typeof simSpeed !== 'undefined' && simSpeed < 50){
        console.warn('[bench] simSpeed=' + simSpeed + ' is low — ' + gens + ' gens will take ' + Math.round(gens * (typeof nextSeconds !== 'undefined' ? nextSeconds : 15) / simSpeed) + 's wall time. Raise simSpeed to ~100 for fast benchmarks.');
    }

    if (opts.cold){
        await window.__clearArchive();
        generation = 0;
    }
    if (opts.config) __applyRvConfig(opts.config);

    const configSnapshot = { trackLabel: opts.track || '', cold: !!opts.cold };

    const ctx = { label, target: gens, done: 0, rows: [], config: configSnapshot };
    const promise = new Promise((resolve, reject) => { ctx.resolve = resolve; ctx.reject = reject; });
    __benchmarkCtx = ctx;

    // Watchdog: if no progress for (nextSeconds * 4) wall seconds per expected
    // gen, abort — the sim is probably paused or the tab was backgrounded.
    const secs = typeof nextSeconds !== 'undefined' ? nextSeconds : 15;
    const watchMs = Math.max(30000, (secs * 4) * gens * 1000);
    const watchdog = setTimeout(() => {
        if (__benchmarkCtx !== ctx || ctx.done_flag) return;
        ctx.done_flag = true;
        __benchmarkCtx = null;
        ctx.reject(new Error('[bench] watchdog fired after ' + (watchMs/1000) + 's — completed ' + ctx.done + '/' + gens + ' gens'));
    }, watchMs);

    if (opts.restart !== false){
        try { if (typeof nextBatch === 'function') nextBatch(); }
        catch (e){ console.warn('[bench] restart failed', e); }
    }

    console.log('[bench] "' + label + '" running ' + gens + ' gens (cold=' + !!opts.cold + ', batchSize=' + (typeof batchSize !== 'undefined' ? batchSize : '?') + ', simSpeed=' + (typeof simSpeed !== 'undefined' ? simSpeed : '?') + ')');
    try {
        const rows = await promise;
        clearTimeout(watchdog);
        __benchmarkCtx = null;
        // Close the SONA trajectory so patterns crystallize (endTrajectory calls
        // agent.forceLearn, which bumps patterns_stored). Re-open immediately so
        // subsequent benchmarks still record. endPhase4Trajectory no-ops cleanly
        // if no trajectory is open or if SONA isn't ready.
        try {
            const b = window.__rvBridge;
            if (!window.rvDisabled && b && b.info){
                const info = b.info();
                const trajOpen = info.sona && info.sona.trajectoryOpen;
                if (trajOpen && b.endPhase4Trajectory){
                    const finalFitness = rows.length ? (rows[rows.length - 1].bestFitness || 0) : 0;
                    b.endPhase4Trajectory(finalFitness);
                }
                if (b.beginPhase4Trajectory){
                    if (!window.currentTrackVec && typeof embedCurrentTrack === 'function'){
                        try { embedCurrentTrack(); } catch (_) {}
                    }
                    b.beginPhase4Trajectory(window.currentTrackVec || null);
                }
            }
        } catch (sonaErr){ console.warn('[sona] end/restart at bench boundary failed', sonaErr); }
        console.log('[bench] "' + label + '" complete, ' + rows.length + ' rows');
        if (opts.download !== false){
            try { window.__downloadCSV(label, rows); } catch (e){ console.warn('[bench] download failed', e); }
        }
        return rows;
    } catch (e){
        clearTimeout(watchdog);
        __benchmarkCtx = null;
        throw e;
    }
};

window.__abTest = async function(gens, configA, configB, opts){
    opts = opts || {};
    const labelA = (opts.label || 'ab') + '-A';
    const labelB = (opts.label || 'ab') + '-B';
    console.log('[abTest] running A then B, ' + gens + ' gens each');
    const rowsA = await window.__runBenchmark(gens, {
        label: labelA, config: configA, cold: opts.coldA !== false,
        track: opts.track, download: false
    });
    const rowsB = await window.__runBenchmark(gens, {
        label: labelB, config: configB, cold: opts.coldB !== false,
        track: opts.track, download: false
    });
    const diff = { A: _summariseRows(rowsA), B: _summariseRows(rowsB) };
    console.table(diff);
    window.__downloadCSV((opts.label || 'ab') + '-combined', rowsA.concat(rowsB));
    return { A: rowsA, B: rowsB, diff };
};

function _summariseRows(rows){
    if (!rows.length) return {};
    const last = rows[rows.length - 1];
    const first = rows[0];
    const avg = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / rows.length;
    return {
        gens: rows.length,
        gen1_medCp: first.medCheckpoints,
        genN_medCp: last.medCheckpoints,
        gen1_survival5s: first.survival5s,
        genN_survival5s: last.survival5s,
        avg_wallBumps: +avg('wallBumps').toFixed(1),
        avg_maxCp: +avg('maxCheckpoints').toFixed(1),
        vectorMemory: first.vectorMemory,
        reranker: first.reranker,
        adapter: first.adapter
    };
}

window.__downloadCSV = function(label, rows){
    rows = rows || __metricsLog;
    if (!rows.length){ console.warn('[bench] no rows to export'); return; }
    const keys = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
    const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => esc(r[k])).join(','))).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = label + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    console.log('[bench] downloaded CSV "' + a.download + '" (' + rows.length + ' rows)');
};
