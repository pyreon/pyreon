---
'@pyreon/router': patch
---

`<RouterLink prefetch="viewport">` no longer throws when it unmounts in the same tick it mounted. It started observing its anchor from a microtask scheduled at setup, which could run after the unmount had cleared the ref, so `observer.observe(null)` threw an uncaught TypeError. It now observes from `onMount` and disconnects in that hook's cleanup.
