---
'@pyreon/runtime-dom': patch
---

`<Transition>` now cancels its pending animation frame on unmount. An unmount between the enter or leave class swap and the next frame let that frame run on the detached element, attaching `transitionend`/`animationend` listeners and a 5s safety timer that fired `onAfterEnter`/`onAfterLeave` after the component was gone. A transition superseded before its frame (show toggled twice within one frame) is cancelled the same way.
