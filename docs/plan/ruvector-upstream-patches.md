# ruvector upstream patches — workflow concerns

**Status:** open concern, not yet resolved. Raised during P2.A ship on 2026-04-21.

---

## What this document is

A placeholder for figuring out how we apply, track, and publish fixes to
`@ruvector/sona` (and its siblings under `ruvnet/ruvector`) when we find
bugs that block our work. The ruvector repo is not ours; we consume it as
vendored WASM artifacts. When we need a fix, the current workflow is
informal and reproducibility-hostile.

Not a design doc yet. A list of concerns, options, and trade-offs so that
a future conversation (this one or a later one) can pick it up cold.

---

## Current state (what actually exists on disk)

1. **Consumer repo (this one, `car-learning`):**
   - Imports WASM via `import initSona, { WasmEphemeralAgent } from '../../vendor/ruvector/sona/ruvector_sona.js'`.
   - Vendored artifacts live under `vendor/ruvector/<crate>/` and are
     committed to git. End users never rebuild them.
   - `scripts/vendor-ruvector.sh` is a maintainer-only script that runs
     `wasm-pack build` against a ruvector crate and copies the resulting
     `pkg/` contents into `vendor/ruvector/<crate>/`. Takes a crate path
     as its first arg.
   - `vendor/ruvector/sona/VENDORED.md` records the upstream commit SHA
     and `git describe` output at build time.

2. **Upstream source (not ours):**
   - Lives at `~/code/utilities/ruvector/` on the current machine. It's a
     checkout of `git@github.com:ruvnet/ruvector.git`.
   - Has uncommitted local edits applied during P2.A — see the "Patch
     currently carried locally" section below.

3. **The coupling:**
   - The vendor script calls `wasm-pack` against that local checkout.
     Whatever state that checkout is in (clean, dirty, on a fork branch,
     at some random SHA) is baked into the committed WASM.
   - `VENDORED.md` transparently records it as, e.g.,
     `v2.2.0-21-gd5d3296c-dirty` — the `-dirty` suffix is the only signal
     that our build included uncommitted work.

---

## Patch currently carried locally (as of 2026-04-21)

Two files edited in `~/code/utilities/ruvector/crates/sona/src/`:

1. **`training/federated.rs`** (around line 234):
   - `EphemeralAgent::get_patterns()` was calling
     `self.engine.find_patterns(&[], 0)` — an empty-query/k=0 lookup that
     always returns an empty `Vec`. This was almost certainly a
     stub-that-compiles left over from scaffolding.
   - Replaced with `self.engine.get_all_patterns()` so consumers actually
     get the learned patterns back.
   - Also added a new method `find_patterns(query, k)` that delegates to
     `self.engine.find_patterns(query, k)`, so callers can ask the
     reasoning bank for a cosine-ranked top-k directly.

2. **`wasm.rs`** (around line 525, inside `impl WasmEphemeralAgent`):
   - Added a `#[wasm_bindgen(js_name = findPatterns)]` binding that
     exposes the new `find_patterns(query, k)` method to JS.

The binding is what `AI-Car-Racer/sona/engine.js` :: `findPatterns(trackVec, k)`
calls to populate the "Similar circuits" side panel.

---

## The concern, stated plainly

**Reproducibility is fragile.** If another contributor — or this same
machine after a clean `git clean -xfd` in the upstream tree — re-runs
`scripts/vendor-ruvector.sh` against mainline ruvector:

- `WasmEphemeralAgent.findPatterns` will disappear from the binding.
- `EphemeralAgent::get_patterns` will return empty again.
- The "Similar circuits" panel will silently regress to hidden.
- `info.sona.patterns` will still show counts (that reads `getStats`,
  which works), so nobody looking at the stats row will notice.

This isn't hypothetical: it's exactly the state this repo was in before
the patch. The bug was hidden for most of a P2.A ship cycle because the
symptoms looked like "empty panel, maybe nothing to show."

**Informal fix management doesn't scale.** We got lucky this time — one
small patch, two files. The next time a ruvector bug blocks us, we may
end up with three or four patches layered across multiple crates, and no
durable record of what was changed or why.

---

## Options (roughly in order of effort)

### Option 1 — Push the fix upstream

Open a PR against `ruvnet/ruvector`, get the `get_patterns`/`findPatterns`
change merged, then re-vendor from a clean mainline commit.

**Pros.** Cleanest end state. `VENDORED.md` records a real tagged SHA, no
`-dirty`. Other ruvector consumers benefit.

**Cons.** Depends on upstream responsiveness. If the project is slow or
inactive, we're blocked. Also: the upstream maintainers may prefer a
different fix (e.g. removing `get_patterns` entirely and only exposing
`find_patterns`). Useful conversation to have regardless, but it blocks
our ability to ship until they weigh in.

**When to pick this.** When the fix is clearly "this is a bug" (the P2.A
fix qualifies) AND the upstream project is healthy enough to review PRs
on a reasonable timescale.

---

### Option 2 — Fork on GitHub, pin our vendor script to our fork

Fork `ruvnet/ruvector` to our org/account, apply our patches on a branch
there (e.g. `car-learning-patches`), and change `scripts/vendor-ruvector.sh`
to build from that fork rather than whatever happens to be in
`~/code/utilities/ruvector/`.

**Pros.** Fully reproducible. Any contributor who can run `cargo` and
`wasm-pack` can rebuild the vendored WASM without having a particular
working tree on their laptop. We keep the ability to cherry-pick upstream
changes into our fork. Good pressure to still send upstream PRs.

**Cons.** Fork drift. Every time upstream updates, we rebase our fork.
Requires us to own a public (or private) repo for the fork.

**When to pick this.** When we're accumulating more than 1–2 patches and
upstream is either slow or philosophically divergent. This is the
"serious" answer.

---

### Option 3 — Keep a patch file in this repo, apply it in the vendor script

Commit a `scripts/ruvector-patches/sona-find-patterns.patch` file
(output of `git diff` against whatever SHA we pin). Modify
`scripts/vendor-ruvector.sh` to:

1. `git checkout <pinned-sha>` inside the upstream working tree.
2. `git apply scripts/ruvector-patches/*.patch`.
3. Build.
4. Reset the upstream tree so the patch doesn't linger.

**Pros.** Self-contained. The car-learning repo alone is enough to
reproduce the build (given a ruvector checkout pointed at the right SHA).
No fork repo to maintain. The patches are reviewable in PRs here.

**Cons.** The vendor script gets more complex. Patch files rot — if
upstream moves on, rebasing each patch is manual. Easy to forget to
update the patch when we fix a second bug in the same file. Also: acting
on someone else's repo from our script feels off; it requires a ruvector
tree on-disk and assumes it's idempotent to mutate.

**When to pick this.** When we want the reproducibility of a fork but
don't want to run a fork. Good stepping-stone before committing to a
fork.

---

### Option 4 — Vendor the ruvector source into this repo

Pull the relevant ruvector crate's Rust source into `vendor/ruvector-src/`
and build from that. The vendored source is the source of truth for our
WASM.

**Pros.** Zero external dependency. Fully hermetic. Patches live in a
normal file edit, like any other vendor dir (e.g. `vendor/` in some
Go/Ruby projects).

**Cons.** Heaviest. We'd be carrying a meaningful chunk of ruvector
source, including tests, benches, and crates we don't need. Updates mean
re-vendoring the source tree, not just the artifact. Probably overkill
for the scale of patches we have.

**When to pick this.** If upstream becomes hostile, stale, or
disappears — the emergency bunker option.

---

## Decision needed

Who makes it and when:

- **Blocking today:** nothing. The current vendored WASM works; the
  `-dirty` note in `VENDORED.md` is visible if anyone looks.
- **Blocking next time ruvector has a bug we need fixed:** we'll have to
  pick one of the above to avoid piling up a second informal patch.
- **A soft trigger:** anything that changes `~/code/utilities/ruvector/`
  (a `git pull`, a `cargo clean`, a laptop migration). If that tree ever
  resets, the committed WASM still works (it's already built), but the
  next re-vendor will regress.

Preferred starting move: **Option 1 first, Option 2 as plan B.** Send
the `get_patterns` fix as an upstream PR; if it merges within a
reasonable window, re-vendor from clean and retire this doc. If not,
fork and pin.

---

## Quick reference — what to tell a future session

If a future Claude Code session picks this up, the minimum context it
needs:

- P2.A shipped with vendored WASM built from a dirty upstream tree.
- The patch touches `crates/sona/src/training/federated.rs` (line ~234)
  and `crates/sona/src/wasm.rs` (inside `impl WasmEphemeralAgent`).
- The patch is recoverable via `git diff` in `~/code/utilities/ruvector/`
  if the tree is still dirty, OR by regenerating it from the code in
  this repo's vendored `vendor/ruvector/sona/ruvector_sona.js` (search
  for `wasmephemeralagent_findPatterns`).
- We need a decision between Options 1–4 above before taking the next
  ruvector patch.
