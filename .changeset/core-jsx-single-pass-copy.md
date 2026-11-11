---
'@pyreon/core': patch
---

`jsx()` copies props in one pass instead of building the whole `Object.getOwnPropertyDescriptors` map and rest-destructuring. About 4x cheaper per call for ordinary elements and components; getter, setter, non-enumerable and symbol-keyed props still take the previous descriptor-preserving copy. `_wrapSpread` scans for getters the same way.
