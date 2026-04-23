// inputVisual — live readout of bestCar's current control state and (as of
// Task 2.D) the NN input vector + pre-threshold output sums that produced it.
//
// Inputs are the 10 floats the brain saw on its most recent forward pass:
//   rays[0..6], speed/maxSpeed, lf, lr   (see car.js #update).
// Output activations are the 4 pre-threshold sum-minus-bias values for
// forward/left/right/reverse. thresholded(x>0) == bestCar.controls by
// construction (sim-worker snapshots both from the same forward pass).
//
// The call site (main.js drawLoop) now passes the whole bestCar proxy, but
// we also tolerate being passed a bare controls object (legacy shape) so the
// function stays self-contained for anyone poking at it from devtools.
function inputVisual(arg){
    const controls = (arg && arg.controls) ? arg.controls : arg;
    const brainInputs = (arg && arg.brainInputs) || null;
    const brainOutputs = (arg && arg.brainOutputActivations) || null;

    const inputCanvas = document.getElementById("inputCanvas");
    if (!inputCanvas) return;
    const inputCtx = inputCanvas.getContext("2d");
    // Layout: left 240px = the 4 D-pad control boxes (existing look, just
    // compressed so we fit the bar panel next to it without pushing the
    // canvas wider than #liveData's column). Right side = bar panel.
    inputCanvas.width = 600;
    inputCanvas.height = 300;
    inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);

    drawControlBoxes(inputCtx, controls);
    drawBrainBars(inputCtx, brainInputs, brainOutputs, controls);
}

function drawControlBoxes(ctx, controls){
    // Compressed 4-box layout in the left 240px strip. Preserves the original
    // forward/reverse/left/right meaning (blue = control firing this frame).
    const rectW = 64, rectH = 64;
    const cx = 120;                // left-strip centerline
    const topY = 40, midY = 140, botY = 220;
    boxColor({x: cx,         y: topY}, !!(controls && controls.forward), rectW, rectH, ctx);
    boxColor({x: cx,         y: midY}, !!(controls && controls.reverse), rectW, rectH, ctx);
    boxColor({x: cx - 70,    y: midY}, !!(controls && controls.left),    rectW, rectH, ctx);
    boxColor({x: cx + 70,    y: midY}, !!(controls && controls.right),   rectW, rectH, ctx);

    ctx.fillStyle = "#222";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("F", cx,      topY + 4);
    ctx.fillText("R", cx,      midY + 4);
    ctx.fillText("L", cx - 70, midY + 4);
    ctx.fillText("R", cx + 70, midY + 4);
}

function boxColor(coordinate, on, rectWidth, rectHeight, inputCtx){
    inputCtx.beginPath();
    inputCtx.fillStyle = on ? "blue" : "white";
    inputCtx.lineWidth = 2;
    inputCtx.rect(coordinate.x - rectWidth/2, coordinate.y - rectHeight/2, rectWidth, rectHeight);
    inputCtx.fill();
    inputCtx.stroke();
}

// Labels for the 10-float brain input vector, in order. Matches car.js:
// sensor.readings (1 - offset, so 1 = wall touching, 0 = nothing visible),
// speed/maxSpeed, then the two track-orientation features.
const BRAIN_INPUT_LABELS = [
    "r0","r1","r2","r3","r4","r5","r6","spd","lf","lr"
];
const BRAIN_OUTPUT_LABELS = ["F", "L", "R", "Rev"];

function drawBrainBars(ctx, inputs, outputs, controls){
    // Panel origin + geometry. Right 360px of the 600px canvas.
    const panelX = 260, panelY = 10, panelW = 330, panelH = 280;

    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.fillStyle = "#333";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("NN inputs (bestCar)", panelX + 6, panelY + 14);
    ctx.fillText("NN outputs (pre-threshold)", panelX + 6, panelY + 150);

    if (!inputs || inputs.length < 10){
        ctx.fillStyle = "#999";
        ctx.fillText("(waiting for snapshot...)", panelX + 6, panelY + 30);
    } else {
        drawBars(ctx, inputs, BRAIN_INPUT_LABELS, panelX + 6, panelY + 22, panelW - 12, 110, { signed: false, axisFrac: 1.0, barColor: "#2e86de" });
    }

    if (!outputs || outputs.length < 4){
        ctx.fillStyle = "#999";
        ctx.fillText("(waiting for snapshot...)", panelX + 6, panelY + 170);
    } else {
        // Outputs are signed (sum - bias). Positive → control fires. Color
        // the bar red if the thresholded bit matches the matching control
        // bit (sanity check: if it ever disagrees, the capture frame is wrong).
        const matches = checkOutputsMatchControls(outputs, controls);
        drawBars(ctx, outputs, BRAIN_OUTPUT_LABELS, panelX + 6, panelY + 158, panelW - 12, 110, {
            signed: true,
            // Autoscale on the observed magnitude so tiny pre-threshold margins
            // still show signal. Floor at 0.5 so early-generation noise doesn't
            // make every bar look max-saturated.
            axisFrac: Math.max(0.5, maxAbs(outputs)),
            barColor: matches ? "#10ac84" : "#ee5253"
        });
        // Tiny mismatch indicator — if this ever shows, the capture-frame
        // correctness invariant is broken and we should investigate.
        if (!matches){
            ctx.fillStyle = "#ee5253";
            ctx.font = "10px sans-serif";
            ctx.fillText("control/output mismatch!", panelX + panelW - 140, panelY + 14);
        }
    }
}

function drawBars(ctx, values, labels, x, y, w, h, opts){
    const n = values.length;
    const gap = 4;
    const barW = (w - gap * (n - 1)) / n;
    const labelH = 14;
    const plotH = h - labelH - 2;
    const axisY = opts.signed ? (y + plotH * 0.5) : (y + plotH);
    const axisFrac = opts.axisFrac || 1.0;

    // Baseline / midline.
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x + w, axisY);
    ctx.stroke();

    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i < n; i++){
        const v = values[i];
        const bx = x + i * (barW + gap);
        let bh, by;
        if (opts.signed){
            // Symmetric around axisY, half-height = plotH/2.
            const clamped = Math.max(-1, Math.min(1, v / axisFrac));
            bh = Math.abs(clamped) * (plotH * 0.5);
            by = clamped >= 0 ? (axisY - bh) : axisY;
            ctx.fillStyle = clamped >= 0 ? opts.barColor : "#576574";
        } else {
            const clamped = Math.max(0, Math.min(1, v / axisFrac));
            bh = clamped * plotH;
            by = axisY - bh;
            ctx.fillStyle = opts.barColor;
        }
        ctx.fillRect(bx, by, barW, Math.max(1, bh));
        ctx.strokeStyle = "#888";
        ctx.strokeRect(bx, by, barW, Math.max(1, bh));

        ctx.fillStyle = "#333";
        ctx.fillText(labels[i] || "", bx + barW/2, y + plotH + 11);
    }
}

function maxAbs(arr){
    let m = 0;
    for (let i = 0; i < arr.length; i++){
        const a = Math.abs(arr[i]);
        if (a > m) m = a;
    }
    return m;
}

function checkOutputsMatchControls(outputs, controls){
    if (!controls) return true;
    // Output order matches car.js: [forward, left, right, reverse].
    const expected = [
        !!controls.forward,
        !!controls.left,
        !!controls.right,
        !!controls.reverse
    ];
    for (let i = 0; i < 4; i++){
        const fired = outputs[i] > 0;
        if (fired !== expected[i]) return false;
    }
    return true;
}

function showInputCanvas(){
    // Prefer the #liveData region (phase-4 template pins it high in the
    // panel so the NN viz stays visible without scrolling). index.html
    // ships an inert <canvas id="inputCanvas"> inside #rightPanel that
    // we relocate on phase-4 entry; if neither exists, create one fresh.
    const host = document.getElementById("liveData") || document.getElementById("rightPanel");
    let c = document.getElementById("inputCanvas");
    if (!c){
        c = document.createElement("canvas");
        c.id = "inputCanvas";
    }
    if (c.parentElement !== host){
        host.appendChild(c);
    }
}
function deleteInputCanvas(){
    const toDel = document.getElementById("inputCanvas");
    if (toDel){
        toDel.remove();
    }
}
