# VectorVroom

A browser-based genetic-algorithm car racer augmented with a cross-track
**vector memory bridge**. Cars train from scratch on hand-drawn or preset
tracks; a ruvector-backed archive of past brains lets a new track warm-start
from the nearest-neighbour of brains that have performed well on geometrically
similar tracks.

Forked from [Apgoldberg1/AI-Car-Racer](https://github.com/Apgoldberg1/AI-Car-Racer).
The vector-memory integration uses [ruvector](https://github.com/shaal/ruvector)
(vendored as pre-built WASM — no Rust toolchain needed).

## Quick start

The app is a pure static site — there is **no build step**. But it uses ES
modules and WebAssembly, both of which refuse to load over `file://`. Serve
the repo root over HTTP and open the game:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/AI-Car-Racer/index.html
```

Any static server works (`npx serve`, `caddy file-server`, etc.).

## New-machine checklist

These are the friction points you may hit on a fresh clone:

- **Must serve over HTTP, not `file://`.** ES module imports (`ruvectorBridge.js`)
  and `fetch()` of the `.wasm` binaries both fail under the file protocol.
- **Modern browser required.** Chrome/Firefox/Safari from 2020 onward —
  anything that supports ES modules + WebAssembly + IndexedDB.
- **No build step, no `npm install`.** The ruvector WASM packages are
  pre-built under `vendor/ruvector/ruvector_wasm/`, `vendor/ruvector/ruvector_cnn_wasm/`,
  `vendor/ruvector/ruvector_gnn_wasm/`, and `vendor/ruvector/ruvector_learning_wasm/`
  (all four include `.wasm` binaries + JS glue + `.d.ts`). If you want to rebuild
  them from source, see the upstream ruvector repo; otherwise the vendored artifacts
  are authoritative.
- **IndexedDB is per-origin.** Opening the game at `localhost:8765` and
  `127.0.0.1:8765` gives you two *separate* archives — stick with one host
  if you want seed recall to survive across sessions.
- **Optional `?rv=0` URL flag** disables the vector-memory bridge and forces
  stock random brain init. Useful for A/B comparisons or when debugging the
  base GA without ruvector in the loop.
- **ELI15 teaching drawer.** Press `?` or click the floating 🎓 button (bottom-right)
  to open a drawer that explains what each piece of the app is doing, in
  plain language. Widgets with a small `?` badge open the matching chapter
  directly. Closes with `ESC` or by clicking the backdrop. Chapters now cover
  every existing AI feature — sensors, neural network, genetic algorithm,
  fitness function, CNN embedder, HNSW vector DB, EMA reranker, brain
  lineage, cross-track similarity, the GNN reranker, and the LoRA track adapter.
- **Track preset picker** appears top-left during phase 1 (editor phase);
  pick one of 5 pre-authored tracks or draw your own with left/right click.
  Loading a preset clears `bestBrain`/`progress` (the old brain is bound to
  the old sensor geometry), but the ruvector archive is intentionally kept —
  that cross-track recall is the whole point of the bridge.

## What's in this repo

```
AI-Car-Racer/              # the playable app (serve index.html from here)
├── index.html             # entry point
├── main.js                # top-level phase machine + training loop
├── ruvectorBridge.js      # ES module: warms the CNN embedder + VectorDB
├── brainCodec.js          # NeuralNetwork <-> Float32Array(92) [6,8,4] topology
├── trackPresets.js        # 5 loadable tracks + floating picker UI
├── eli15/                 # teaching drawer (? / 🎓 button) — one file per chapter
└── ...                    # canvas, car physics, sensors, GA logic
vendor/ruvector/           # pre-built WASM, committed so no toolchain needed
└── ruvector_{cnn_,gnn_,}wasm/  # CNN embedder + GNN reranker + VectorDB flavours
scripts/vendor-ruvector.sh # maintainer-only: rebuild + recommit a WASM crate
docs/plan/                 # design notes and phase-by-phase progress
```

## Credits & licence

- Game fork — [Apgoldberg1/AI-Car-Racer](https://github.com/Apgoldberg1/AI-Car-Racer)
- ruvector WASM — MIT, vendored under `vendor/ruvector/`
- Vector-memory integration + preset tracks + UI panels — this repo
