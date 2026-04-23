// Brain export/import — lets users download the currently-best brain as a
// JSON file and upload one from someone else. Keeps the wire format identical
// to what `save()` writes to localStorage.bestBrain so imported files act as a
// drop-in seed on the next restartBatch().
//
// Tier 1 (JSON)   — implemented here. ~1 KB per brain, human-readable, zero
//                   new dependencies. Good enough for "paste a friend's brain".
// Tier 2 (.rvf)   — STUB. Guarded by window.__rvfEnabled. The real RVF wasm
//                   (vendor/ruvector/rvf_wasm/*, published as @ruvector/rvf-
//                   wasm) is not yet vendored in this app. See block comment
//                   on exportBrainPackRvf() below for the concrete wiring.

// ---------- Tier 1: JSON brain export/import --------------------------------

function _currentBestBrainSerialized(){
    // Prefer the live-best (what the user just watched win this gen). Fall
    // back to localStorage.bestBrain (the last user-clicked "Save Best") when
    // we're outside phase 4 or between batches and bestCar isn't set.
    if (typeof bestCar !== 'undefined' && bestCar && bestCar.brain){
        return serializeBrain(bestCar.brain);
    }
    const saved = localStorage.getItem('bestBrain');
    if (saved){
        try { return JSON.parse(saved); } catch (_) { return null; }
    }
    return null;
}

function _timestampForFilename(){
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() +
        pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function exportBrainJson(){
    const brain = _currentBestBrainSerialized();
    if (!brain){
        alert('No brain to export yet — train a generation first, or import one.');
        return;
    }
    const payload = {
        format: 'ai-car-racer/brain',
        version: 1,
        exportedAt: new Date().toISOString(),
        fastLap: (typeof fastLap !== 'undefined') ? fastLap : null,
        brain: brain
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brain-' + _timestampForFilename() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke async so the browser has a tick to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBrainJson(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                _applyImportedBrainText(reader.result);
            } catch (e){
                console.error('[brainExport] import failed', e);
                alert('Import failed: ' + (e.message || e));
            } finally {
                document.body.removeChild(input);
            }
        };
        reader.onerror = () => {
            alert('Could not read file.');
            document.body.removeChild(input);
        };
        reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
}

function _applyImportedBrainText(text){
    const parsed = JSON.parse(text);
    // Accept both the wrapped export format and a bare serialized brain (so
    // users can paste a raw localStorage.bestBrain value too).
    const brain = (parsed && parsed.brain && parsed.brain.levels) ? parsed.brain
                 : (parsed && parsed.levels) ? parsed
                 : null;
    if (!brain) throw new Error('File is not a recognised brain JSON.');

    // Topology sanity: the app's NN is [10,8,4] as of Phase P1. Revive
    // tolerates the legacy nested shape, but an imported brain with a
    // different input width would silently mismatch runtime inputs — reject
    // loudly instead.
    const topo = brain.levels.map(L => L.inputCount).concat(
        [brain.levels[brain.levels.length - 1].outputCount]
    );
    const expected = [10, 8, 4];
    if (topo.length !== expected.length || topo.some((n, i) => n !== expected[i])){
        throw new Error('Topology mismatch. Expected [10,8,4], got [' + topo.join(',') + '].');
    }

    // Stash the old best so "Restore Old Brain" can roll back, then install.
    localStorage.setItem('oldBestBrain', localStorage.getItem('bestBrain') || '');
    localStorage.setItem('bestBrain', JSON.stringify(brain));

    // If we're live-training, re-seed from the new brain immediately.
    if (typeof phase !== 'undefined' && phase === 4 && typeof restartBatch === 'function'){
        restartBatch();
    }
    console.log('[brainExport] imported brain — topology ok, restart seeded from new bestBrain');
}

// ---------- Tier 2: RVF brain-pack (stub) -----------------------------------
//
// Enabled only when `window.__rvfEnabled === true`. Flip it in DevTools to
// exercise the stubs. The actual implementation needs:
//
//   1. Vendor @ruvector/rvf-wasm into vendor/ruvector/rvf_wasm/ alongside the
//      existing ruvector_wasm drop (see ruvector/npm/packages/rvf-wasm/pkg/).
//   2. Boot the wasm the same way ruvectorBridge.js boots ruvector_wasm —
//      fetch the .wasm, call `init(...)`, stash exports.
//   3. On export:
//        const h = exp.rvf_store_create(FLAT_LENGTH, METRIC_L2);
//        // ingest every brain in the mirror (see ruvectorBridge._brainMirror),
//        // passing Float32 weight blocks + Uint32 ids.
//        exp.rvf_store_ingest(h, vecsPtr, idsPtr, count);
//        // query size then export the segment bytes:
//        const nbytes = exp.rvf_store_export(h, 0, 0);         // size probe
//        const buf = new Uint8Array(nbytes);
//        exp.rvf_store_export(h, bufPtr, nbytes);              // real export
//      → wrap `buf` in a Blob({type:'application/x-rvf'}) and download.
//   4. On import: mirror of the above via rvf_store_open(bufPtr, bufLen),
//      then iterate the store and write each vector back into the ruvector
//      bridge archive (archiveBrain-shaped inserts, preserving meta).
//   5. Optional: attach LoRA weights as an OVERLAY segment and lineage DAG
//      as a GRAPH segment so recipients get the whole training context, not
//      just raw brains. These are the RVF features that make it worth doing
//      over JSON — for a single brain, JSON is fine.

function exportBrainPackRvf(){
    if (!window.__rvfEnabled){
        console.warn('[brainExport] RVF export not enabled — set window.__rvfEnabled=true to try the stub');
        alert('RVF export is not wired up yet. Use Export Brain (JSON) for now.');
        return;
    }
    // TODO: replace with the five steps above once @ruvector/rvf-wasm is
    // vendored. Keeping the call path here so the future patch is a file-
    // swap, not a UI rewrite.
    console.warn('[brainExport] RVF export stub reached — pack construction NYI');
    alert('RVF export stub — feature flag on, but wasm not vendored yet.');
}

function importBrainPackRvf(){
    if (!window.__rvfEnabled){
        console.warn('[brainExport] RVF import not enabled — set window.__rvfEnabled=true to try the stub');
        alert('RVF import is not wired up yet. Use Import Brain (JSON) for now.');
        return;
    }
    // TODO: file picker → ArrayBuffer → rvf_store_open → hydrate bridge.
    console.warn('[brainExport] RVF import stub reached — pack ingest NYI');
    alert('RVF import stub — feature flag on, but wasm not vendored yet.');
}
