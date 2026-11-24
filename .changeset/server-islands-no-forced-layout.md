---
'@pyreon/server': patch
---

Setting up `hydrate: 'visible'` islands (and `prefetch: 'visible'`) no longer forces a synchronous style recalc and layout of the whole page. What to observe for a `display: contents` island was decided with `getComputedStyle` while the islands module evaluated, usually before the first paint; on pyreon.dev's home page that was 10 ms of a 17 ms task, unthrottled, which Lighthouse's mobile run turns into Total Blocking Time. The island element is now observed first and its targets are resolved in the IntersectionObserver's first report, after the browser's own layout. A boxed island hydrates exactly as before; a `display: contents` island fires one observer report later.
