---
'@pyreon/core': patch
---

fix(core): context stack leak under repeated reactive remounts — provide() + restoreContextStack now use identity-based frame removal

**Reported symptom**: `@pyreon/core@<=0.22.0` apps that repeatedly remount subtrees containing `provide()` calls (route navigation, theme toggle, `<Show>` / `<For>` cycling, kinetic transitions) accumulate orphan frames on the module-level context stack. One reporter observed a 1 GB heap where 33 in-flight effect snapshots × ~10,000-frame copies each retained ~138 MB of arrays. The live context stack held 321,024 entries but only 47 distinct provider Map instances — the same providers were re-referenced thousands of times each.

**Root cause** (two cooperating bugs):

1. `provide()` registered `onUnmount(() => popContext())`. `popContext` pops `stack.pop()` — the last frame. That assumes strict LIFO between push and pop, but `mountReactive`'s effect-re-fire flow runs the previous-mount subtree cleanup INSIDE the effect's snapshot-restore window. The snapshot-pushed frames sit ABOVE the descendant's own provider frame at the moment its `onUnmount` fires. `popContext` pops the snapshot push; the descendant's provider frame is orphaned on the live stack.
2. `restoreContextStack` used position-based `stack.splice(insertIndex, snapshot.length)` to remove its pushes on exit. That assumed the pushes stayed where they were placed — but identity-based removal by a descendant (fix 1) can shift them down, making `splice(insertIndex, …)` either a no-op or pull the wrong frames.

**Fix**: both layers now use IDENTITY-based removal.

- `provide()` and `withContext()` capture the frame reference at push, register `onUnmount(() => removeContextFrame(frame))`, where `removeContextFrame` does `stack.splice(stack.lastIndexOf(frame), 1)`. Robust to "wrong frame on top" because it splices the specific frame regardless of position. `lastIndexOf` matches the most-recent occurrence — preserves LIFO ordering when the same `Map` reference appears multiple times (the snapshot-push case).
- `restoreContextStack`'s finally now iterates `snapshot` in reverse and removes each frame via `stack.lastIndexOf(frame) + splice`. Same identity-based approach. Robust to descendants having removed frames at earlier indices.

`popContext` is preserved as the public position-based API — only `provide` / `withContext` switch to the safe path. Server-side `trimContextStack` in `@pyreon/runtime-server` still uses `popContext` correctly because SSR has no reactive boundaries pushing snapshot frames during render.

**Regression tests** (`packages/core/runtime-dom/src/tests/ctx-stack-growth-repro.test.tsx`, 4 specs): the nested-boundaries-with-providers shape that reproduces the leak (502 orphan frames after 500 toggle cycles pre-fix) is the load-bearing one. Bisect-verified: reverting `context.ts` to pre-fix state → that spec fails with `expected 502 to be less than 10`. The other 3 specs (single-boundary, signal-driven re-mount, descendant useContext correctness) pass even pre-fix — they're guards against the FIX regressing the useful behavior.

No public-API surface change. `provide` / `useContext` / `popContext` / `pushContext` / `withContext` / `captureContextStack` / `restoreContextStack` keep their existing signatures. Behavior change is invisible to correct existing code; the leak shape was undetected because `useContext` walks the stack top-down and finds the freshest provider regardless of whether orphan frames exist below.
