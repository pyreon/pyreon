---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): cancel in-progress transitions on unmount

`<Transition>` and `<TransitionGroup>` added a 5-second safety timer to
their enter/leave/move callbacks (so CSS transitions that never fire
don't leak listeners). Without a matching cancel on component unmount,
that timer kept running after the component was detached — firing
`onAfterEnter` / `onAfterLeave` on now-detached elements up to 5 seconds
later.

Fix:
- `<Transition>`: track `pendingEnterCancel` (parallel to the existing
  `pendingLeaveCancel`). `onUnmount` calls both to tear down listeners,
  clear safety timers, and strip active-state classes WITHOUT firing
  the onAfterX callback.
- `<TransitionGroup>`: each `ItemEntry` gains a `cancelTransition`
  function that applyEnter / applyLeave / startMoveAnimation install.
  Container `onUnmount` iterates entries and cancels in-progress
  transitions before tearing down each entry's DOM.
