---
'@pyreon/runtime-dom': patch
---

Reactive text bindings no longer read `node.data` back from the DOM on every update. They compare against the string they last wrote, and read the node only on their first run, so a hydrated node whose server text already matches is still left alone. This covers the signal fast path of `_bindText`, its callable path, and the shared core behind `bindPolymorphicText`. On the dbmon scenario (600 text cells changing per tick) the tick drops about 5%, from 1.85–1.90 ms to 1.70–1.81 ms.
