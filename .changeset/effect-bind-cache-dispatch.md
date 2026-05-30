---
'@pyreon/reactivity': patch
---

perf(reactivity): cache `effect` / `_bind` re-run dispatch at setup (match `renderEffect`)

`renderEffect` already pre-builds its tracked-fn closure at setup so re-runs skip the `snapshot !== null && _snapshotCapture` branch and the module-level read. `effect` and `_bind` did this work on every re-run — `effect` allocated a fresh `() => restore(snapshot, fn)` closure per non-first run; `_bind` re-evaluated the dual conditional every fire.

Both now mirror `renderEffect`: the hook reference and snapshot are captured at setup, the dispatch closure is built once, and re-runs do a disposed-check + direct call. Behaviorally identical (457/457 reactivity tests pass, including the snapshot-capture-restore branch test). `bench:fair` against the post-#1051 baseline shows no regression across the 7 js-framework-benchmark rows; absolute delta is within the bench's between-run noise (~±5%), so this is framed as a consistency / structural micro-opt, not a measured percentage win.
