---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
---

`Map`, `Set` and `Record` now keep insertion order on iOS, as they do on the web and on Android.

Swift's `Dictionary` and `Set` order entries by a hash that changes on every launch. So the same `Record` rendered in a different order each time, and `Object.keys(r)` changed between runs. The iOS output now uses new runtime types, `PyreonMap` and `PyreonSet`. They use the same syntax as `Dictionary` and `Set`, and keep the web's rules:

- setting an existing key keeps its position;
- deleting a key and adding it again moves it to the end;
- a string-keyed map stringifies as a JSON object in insertion order.

Also new on both targets:

- `m.keys()` and `m.values()` now lower. Before, they were copied into the output as written and did not compile.
- `Object.keys(r)` and `Object.values(r)` on a map now lower. Before, they produced an empty array.
- `new Map(other)` now copies a map.
