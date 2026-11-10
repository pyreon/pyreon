---
'@pyreon/runtime-dom': patch
---

Keyed reorders (`<For>` and keyed `.map` lists) now move existing rows with the browser's state-preserving `moveBefore` where it exists (Chromium 133+), falling back to `insertBefore` elsewhere. A moved row keeps focus, running CSS animations and transitions, iframe and media state, instead of being removed and re-inserted.
