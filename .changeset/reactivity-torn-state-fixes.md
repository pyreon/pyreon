---
'@pyreon/charts': patch
'@pyreon/flow': patch
'@pyreon/sync': patch
'@pyreon/lint': patch
---

Three reactivity/correctness fixes found by running `pyreon doctor` against the
framework itself, plus the rule-option support that made the remaining reports
resolvable.

- **`useChart` published a torn frame.** `instance.set(chart)`, `loading.set(false)`
  and `error.set(null)` ran unbatched, so a subscriber reading two of them saw
  the chart instance published while `loading` was still `true` — the "chart is
  ready but still showing a spinner" flicker. Batched into one notify cycle; the
  batch flushes before `onInit`, so the documented "fully configured before
  `onInit` fires" invariant is unchanged.

- **Flow's `handlePointerUp` fired one notify cycle per selected node.** Its
  three branches (rubber-band / drag-end / connection-drop) are sequential and
  can co-occur, and the rubber-band branch calls `clearSelection()` plus
  `selectNode()` once per hit node — so a band over 100 nodes fired 100+ cycles
  and re-rendered the canvas each time. One pointerup is now one transition.

- **`createActorId`'s fallback could collide.** The doc comment states two live
  peers must not share an id, but the non-`crypto.randomUUID` path was
  `Date.now()` + `Math.random()`, which repeats within a millisecond and is a
  birthday risk besides. It now prefers `crypto.getRandomValues` (far more widely
  available than `randomUUID`, which requires a secure context) and its last
  resort mixes in a per-process monotonic counter, so two ids from one process
  can never collide by construction and the random field only has to separate
  processes.

- **`exemptPaths` on six rules that documented the convention but never read it.**
  `toast-a11y`, `no-href-navigation`, `no-inline-style-object`,
  `prefer-use-is-active`, `no-effect-in-mount` and `prefer-field-array` all
  inspect a call site, so the file that *implements* the thing being recommended
  reports against itself — `link.tsx` renders the `<a href>` that `<Link>`
  wraps, and the toast row computes `role` from severity in its definition
  rather than at the `<ToastItem>` call site. Resolving that in-rule needs the
  parent chain, which oxc's visitor does not provide, so these now honour the
  documented `exemptPaths` option instead. Each still fires normally everywhere
  else.
