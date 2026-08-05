---
'@pyreon/runtime-dom': patch
---

hydrateElement composes its disposer over statically-known cleanup slots (props / children / select-value / ref) instead of allocating a cleanups array per hydrated element.
