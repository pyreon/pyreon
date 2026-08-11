---
'@pyreon/flow': patch
---

Pan/zoom no longer remounts the entire graph. The viewport div was rendered by a reactive child accessor that read `viewport()` at its top — so every wheel tick, pan pointermove, and `animateViewport` frame tore down and re-created every node div (plus its ResizeObserver) and every edge path. The viewport div is now mounted statically with only its `style` string reactive: pan/zoom is one transform write per frame. Measured (happy-dom, 300 nodes/299 edges, 100 viewport writes): ~68ms/write → ~0.014ms/write, and zero element creations per write (was the whole subtree). Element identity across pan/zoom is now locked by bisect-verified regression tests; real-Chromium flow suites and the app-showcase e2e (wheel-zoom spec compiled through the real vite-plugin) pass unchanged.
