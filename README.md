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
- **No build step, no `npm install`.** Seven ruvector WASM crates plus the
  SONA engine are pre-built under `vendor/ruvector/` (see the tree in
  "What's in this repo" for the full list), each with `.wasm` binary + JS
  glue + `.d.ts`. If you want to rebuild them from source, maintainers can
  run `scripts/vendor-ruvector.sh <crate-path>`; it applies any patches
  under `scripts/ruvector-patches/` before building. Otherwise the vendored
  artifacts are authoritative.
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
  lineage, cross-track similarity, the GNN reranker, the LoRA track adapter,
  SONA trajectories / ReasoningBank / EWC, the lineage DAG viewer (🌳 Lineage
  DAG section in the Vector Memory panel), and hyperbolic HNSW (the Poincaré-
  ball alternative surfaced by the index toggle).
- **Learning mode (P4.A).** The 🚗 button above the 🎓 button starts a
  guided tour that walks through every ELI15 chapter in teaching order,
  highlighting the matching UI element on each step (←/→ arrow keys navigate;
  `ESC` exits). The Vector Memory panel also shows an **A/B toggle strip** —
  flip *reranker* (auto/none/ema/gnn), *track adapter* (off/micro-lora/sona),
  *dynamics key* (off/on), and *index* (euclidean/hyperbolic) to feel how
  each layer contributes. The hyperbolic index ships as an opt-in
  experiment — default stays euclidean; `?hhnsw=1` boots it selected, or
  flip the toggle at runtime. See `tests/bench-hnsw.html` for a two-scenario
  head-to-head — spherical (our CnnEmbedder shape; hyperbolic loses ~15 pp
  recall@5) and ball-native (the Poincaré-ball's own distribution; hyperbolic
  matches Euclidean), so the geometry-vs-data trade-off is visible in numbers
  rather than hand-waved.
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
├── ruvector_wasm/         # VectorDB (default Euclidean HNSW)
├── ruvector_cnn_wasm/     # CNN embedder (track-shape → 512-d)
├── ruvector_gnn_wasm/     # P1.A GNN reranker over the lineage DAG
├── ruvector_dag_wasm/     # P3.B lineage DAG + cycle-safe traversal
├── ruvector_learning_wasm/# P1.B MicroLoRA track adapter
├── ruvector_hyperbolic_hnsw_wasm/ # P3.A Poincaré-ball HNSW (opt-in)
├── ruvector_temporal_tensor_wasm/ # P1.C dynamics-trajectory embedding
└── sona/                  # P2.A SONA engine (trajectories + ReasoningBank)
scripts/vendor-ruvector.sh # maintainer-only: rebuild + recommit a WASM crate
scripts/ruvector-patches/  # in-repo patches applied before each vendor build
docs/plan/                 # design notes and phase-by-phase progress
tests/                     # browser-loadable test harnesses (bench, regressions)
```

## Credits & licence

- Game fork — [Apgoldberg1/AI-Car-Racer](https://github.com/Apgoldberg1/AI-Car-Racer)
- ruvector WASM — MIT, vendored under `vendor/ruvector/`
- Vector-memory integration + preset tracks + UI panels — this repo
