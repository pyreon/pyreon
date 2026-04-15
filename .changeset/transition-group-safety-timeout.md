---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): add safety timeout to `<TransitionGroup>` enter/leave/move

`TransitionGroup`'s per-item `applyEnter` / `applyLeave` /
`startMoveAnimation` added `transitionend` / `animationend` listeners
with `{ once: true }` but had NO safety timeout — unlike the matching
code in `transition.ts`.

If a CSS transition never fires (off-screen element, zero-duration,
`display: none`, visibility: hidden), the `done` callback never runs,
`onAfterLeave` never fires, and `entries.delete(key)` is never called —
**the item stays in the `entries` Map forever.** Real memory leak that
grows with every list mutation; the impact compounds in long-running
SPA sessions where list items cycle in and out frequently.

Fix: added a 5-second safety `setTimeout` (same pattern as
`transition.ts`). When CSS never fires, the timer forces the cleanup.
