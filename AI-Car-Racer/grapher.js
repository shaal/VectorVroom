function showGraphCanvas(){
    document.getElementById("rightPanel").innerHTML += "<canvas id='graphCanvas'></canvas>";
    graphCanvas.height=300;
    graphCanvas.width=400;
}
function graphProgress(){
    const graphCanvas=document.getElementById("graphCanvas");
    if (!graphCanvas) return;
    const graphCtx = graphCanvas.getContext("2d");
    graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

    let progressArray = [];
    try {
        const raw = localStorage.getItem("progress");
        if (raw) progressArray = JSON.parse(raw) || [];
    } catch (e) { progressArray = []; }
    if (!progressArray.length) return;
    // Filter to numeric points for the min/max math — `fastLap` defaults to
    // the string "--" until a lap completes, and a single non-numeric entry
    // would NaN-poison every y coordinate (silent blank chart).
    const numericProgress = progressArray.filter(v => typeof v === 'number' && isFinite(v));
    if (!numericProgress.length) return;
    const minVal = Math.min(...numericProgress);
    const maxVal = Math.max(...numericProgress);
    const yRange = (maxVal - minVal) || 1; // avoid div-by-zero on flatlines
    const multiplier = graphCanvas.height / yRange;
    const xIncrement = .9*graphCanvas.width / progressArray.length;

    // Helper that mirrors the existing y-position formula so annotation
    // markers land exactly on the line.
    function yFor(prog){
        return graphCanvas.height*.05 + .9*(graphCanvas.height-multiplier*(prog-minVal));
    }
    function xFor(i){ return xIncrement * (i + 1); }

    // Main fitness line. Lift the pen across non-numeric entries (e.g. the
    // pre-first-lap "--") so a single dirty point doesn't drop the whole
    // line from the chart.
    graphCtx.beginPath();
    graphCtx.strokeStyle = "rgb(227, 138, 15)";
    graphCtx.lineWidth = 8;
    let penDown = false;
    for (let i = 0; i < progressArray.length; i++){
        const prog = progressArray[i];
        if (typeof prog !== 'number' || !isFinite(prog)){ penDown = false; continue; }
        const px = xFor(i);
        const py = yFor(prog);
        if (!penDown){ graphCtx.moveTo(px, py); penDown = true; }
        else { graphCtx.lineTo(px, py); }
    }
    graphCtx.stroke();

    // P5.D: overlay per-generation annotations from the parallel
    // localStorage.rvAnnotations array. Two glyphs:
    //   - cyan filled dot at gens where recommendSeeds returned non-empty
    //     (this batch was initialised from the vector archive)
    //   - amber upward tick above the line at gens where the EMA reranker
    //     shifted the top-K seed ordering vs the previous batch; tick
    //     length scales with shift magnitude (capped so a single big
    //     reshuffle doesn't blow past the chart top).
    let annotations = [];
    try {
        const raw = localStorage.getItem("rvAnnotations");
        if (raw) annotations = JSON.parse(raw) || [];
    } catch (e) { annotations = []; }

    if (annotations.length){
        const tickMax = 18;     // px — visual cap on the shift tick
        const shiftScale = 2;   // px per unit shift before clamping
        for (let k = 0; k < progressArray.length; k++){
            const ann = annotations[k];
            if (!ann) continue;
            const px = xFor(k);
            const py = yFor(progressArray[k]);
            if (!isFinite(py)) continue;

            if (ann.shift && ann.shift > 0){
                const tickLen = Math.min(tickMax, ann.shift * shiftScale);
                graphCtx.beginPath();
                graphCtx.strokeStyle = "rgb(255, 196, 64)";
                graphCtx.lineWidth = 2;
                graphCtx.moveTo(px, py);
                graphCtx.lineTo(px, py - tickLen);
                graphCtx.stroke();
                // Small triangle cap so the tick reads as an annotation
                // glyph rather than a line-graph artifact.
                graphCtx.beginPath();
                graphCtx.fillStyle = "rgb(255, 196, 64)";
                graphCtx.moveTo(px, py - tickLen - 4);
                graphCtx.lineTo(px - 3, py - tickLen);
                graphCtx.lineTo(px + 3, py - tickLen);
                graphCtx.closePath();
                graphCtx.fill();
            }

            if (ann.seeded){
                graphCtx.beginPath();
                graphCtx.fillStyle = "rgb(120, 220, 255)";
                graphCtx.strokeStyle = "rgb(20, 40, 60)";
                graphCtx.lineWidth = 1;
                graphCtx.arc(px, py, 4, 0, Math.PI * 2);
                graphCtx.fill();
                graphCtx.stroke();
            }
        }

        // Tiny legend in the top-left so users can decode the glyphs without
        // hunting for documentation. Drawn last so it sits over the line, with
        // a translucent backdrop so legend text stays readable when the
        // fitness curve crosses through the upper-left of the chart.
        graphCtx.font = "11px sans-serif";
        graphCtx.textBaseline = "middle";
        const lx = 8, ly1 = 12, ly2 = 28;
        graphCtx.fillStyle = "rgba(20, 24, 32, 0.78)";
        graphCtx.fillRect(lx - 4, 2, 142, 36);
        graphCtx.beginPath();
        graphCtx.fillStyle = "rgb(120, 220, 255)";
        graphCtx.strokeStyle = "rgb(20, 40, 60)";
        graphCtx.lineWidth = 1;
        graphCtx.arc(lx + 5, ly1, 4, 0, Math.PI * 2);
        graphCtx.fill();
        graphCtx.stroke();
        graphCtx.fillStyle = "rgb(220, 220, 220)";
        graphCtx.fillText("seeded from archive", lx + 14, ly1);
        graphCtx.beginPath();
        graphCtx.fillStyle = "rgb(255, 196, 64)";
        graphCtx.moveTo(lx + 5, ly2 - 5);
        graphCtx.lineTo(lx + 2, ly2 + 1);
        graphCtx.lineTo(lx + 8, ly2 + 1);
        graphCtx.closePath();
        graphCtx.fill();
        graphCtx.fillStyle = "rgb(220, 220, 220)";
        graphCtx.fillText("reranker shift", lx + 14, ly2);
    }
}
