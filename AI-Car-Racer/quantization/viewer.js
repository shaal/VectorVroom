// quantization/viewer.js
// Phase 1B (F1) — ELI15-facing viewer for the 1-bit quantizer. Pure DOM +
// canvas, no framework. Mount via:
//   import { mountViewer } from './quantization/viewer.js';
//   mountViewer(document.getElementById('q-viewer'), samples);
// where `samples` is an array of Float32Array (e.g. a cross-section of
// the brain archive). The viewer renders three panels:
//   1. Side-by-side heatmap: first sample's float components vs its 1-bit
//      packed code (shown as a checkerboard of 0/1 cells).
//   2. Scatter plot: for each pair in a subset of samples, plot (true
//      cosine, estimated cosine) — the diagonal is the ideal recovery.
//   3. Memory meter: float baseline bytes vs. 1-bit + residual bytes.
//
// Not wired into any tour slot yet — Phase 3B will register it. The file
// exists so the quantization chapter has a live demo element to point at.

import { quantize, estimatedCosine, memoryFootprint } from './index.js';

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// Render the float vector + 1-bit code side by side on a single canvas.
function drawHeatmap(canvas, flat, packed, rotatedDim) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Float half (left 50%): min-max normalize, map to blue↔red.
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] < min) min = flat[i];
    if (flat[i] > max) max = flat[i];
  }
  const span = max - min || 1;
  const cols = 16;
  const rows = Math.ceil(flat.length / cols);
  const floatW = Math.floor(w * 0.45);
  const cellW = floatW / cols;
  const cellH = h / rows;
  for (let i = 0; i < flat.length; i++) {
    const t = (flat[i] - min) / span;
    const r = Math.round(255 * t);
    const b = Math.round(255 * (1 - t));
    ctx.fillStyle = `rgb(${r}, 60, ${b})`;
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);
  }

  // Divider + labels
  ctx.fillStyle = '#888';
  ctx.font = '10px sans-serif';
  ctx.fillText('float (244 × 32-bit)', 4, h - 4);

  // Bit half (right 45%, 16 cols × 16 rows = 256 bits).
  const bitCols = 16;
  const bitRows = Math.ceil(rotatedDim / bitCols);
  const bitW = Math.floor(w * 0.45);
  const bitX0 = Math.floor(w * 0.52);
  const bcW = bitW / bitCols;
  const bcH = h / bitRows;
  for (let i = 0; i < rotatedDim; i++) {
    const bit = (packed[i >>> 5] >>> (i & 31)) & 1;
    ctx.fillStyle = bit ? '#e8b739' : '#2a2a2a';
    const col = i % bitCols;
    const row = Math.floor(i / bitCols);
    ctx.fillRect(bitX0 + col * bcW, row * bcH, bcW - 0.5, bcH - 0.5);
  }
  ctx.fillStyle = '#888';
  ctx.fillText('1-bit (256 × 1-bit)', bitX0 + 4, h - 4);
}

// Scatter of (true cosine, estimated cosine) over all pairs from samples.
function drawScatter(canvas, samples, codes, rotatedDim) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Axes: x=true cosine [-1, 1], y=estimated cosine [-1, 1].
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Ideal diagonal y=x.
  ctx.strokeStyle = '#7a7';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(w, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(232, 183, 57, 0.55)';
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const tc = cosine(samples[i], samples[j]);
      const ec = estimatedCosine(codes[i], codes[j], rotatedDim);
      const x = (tc + 1) * 0.5 * w;
      const y = h - (ec + 1) * 0.5 * h;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  ctx.fillStyle = '#aaa';
  ctx.font = '10px sans-serif';
  ctx.fillText('x: true cosine · y: estimated · dashed = perfect', 6, h - 6);
}

// Plain-DOM memory meter.
function renderMeter(container, footprint) {
  const {
    packedBytes, residualBytes, totalBytes,
    floatBaselineBytes, compressionRatio, bitOnlyRatio,
  } = footprint;

  const frag = document.createElement('div');
  frag.style.cssText = 'font: 12px sans-serif; color: #ccc; margin: 8px 0;';

  const barMax = 320;
  const floatW = barMax;
  const totalW = Math.max(4, Math.round((totalBytes / floatBaselineBytes) * barMax));
  const packedW = Math.max(2, Math.round((packedBytes / floatBaselineBytes) * barMax));

  frag.innerHTML = `
    <div style="margin-bottom:6px;"><strong>Memory per vector</strong></div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <span style="display:inline-block; width:60px;">float</span>
      <span style="display:inline-block; height:12px; width:${floatW}px; background:#c33;"></span>
      <span>${floatBaselineBytes} B</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <span style="display:inline-block; width:60px;">1-bit</span>
      <span style="display:inline-block; height:12px; width:${packedW}px; background:#e8b739;"></span>
      <span>${packedBytes} B (${bitOnlyRatio.toFixed(1)}× smaller)</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:60px;">+residual</span>
      <span style="display:inline-block; height:12px; width:${totalW}px; background:#6a9;"></span>
      <span>${totalBytes} B (${compressionRatio.toFixed(1)}× smaller)</span>
    </div>
  `;
  container.appendChild(frag);
}

// Public entry point. `samples` is an array of Float32Array. The viewer
// tolerates an empty or undersized sample list by rendering placeholder
// text instead of crashing.
export function mountViewer(container, samples) {
  if (!container) throw new Error('mountViewer: container required');
  container.innerHTML = '';
  container.style.cssText = 'display:flex; flex-direction:column; gap:10px; padding:8px; background:#181818; color:#ddd; border-radius:6px;';

  const title = document.createElement('div');
  title.textContent = '1-bit archive — float vs. quantized';
  title.style.cssText = 'font: 600 13px sans-serif; color:#eee;';
  container.appendChild(title);

  if (!samples || samples.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font: 12px sans-serif; color:#888;';
    empty.textContent = 'No samples provided. Train through at least one track and reopen.';
    container.appendChild(empty);
    return;
  }

  const codes = [];
  let rotatedDim = 0;
  for (let i = 0; i < samples.length; i++) {
    const q = quantize(samples[i]);
    codes.push(q.packed);
    rotatedDim = q.rotatedDim;
  }

  // Heatmap
  const hmCanvas = document.createElement('canvas');
  hmCanvas.width = 480; hmCanvas.height = 140;
  hmCanvas.style.cssText = 'width:100%; max-width:480px; background:#000; border-radius:4px;';
  container.appendChild(hmCanvas);
  drawHeatmap(hmCanvas, samples[0], codes[0], rotatedDim);

  // Scatter (use first ~40 samples to keep pair count manageable)
  const scCanvas = document.createElement('canvas');
  scCanvas.width = 300; scCanvas.height = 300;
  scCanvas.style.cssText = 'width:100%; max-width:300px; background:#000; border-radius:4px;';
  container.appendChild(scCanvas);
  const scatterN = Math.min(samples.length, 40);
  drawScatter(scCanvas, samples.slice(0, scatterN), codes.slice(0, scatterN), rotatedDim);

  // Memory meter
  renderMeter(container, memoryFootprint(samples[0].length));
}
