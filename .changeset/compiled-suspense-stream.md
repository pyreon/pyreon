---
'@pyreon/runtime-server': patch
---

Streaming SSR: compiled (`ssrTemplate`) pages now stream Suspense boundaries — shell and fallback flush first — instead of arriving as one chunk after the slowest child. Also fixes `h(Suspense, { fallback }, child)` streaming an empty swap template (the stream read `props.children` only).
