---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/http': patch
'@pyreon/storage': patch
---

Native: a `Record` lists its keys in the web's own-property order, and a decoded JSON object keeps the web's rule for a repeated key.

- `Object.keys(record)`, `Object.values(record)` and `JSON.stringify(record)` list array-index keys (`"0"`, `"7"`, `"42"`) first in ascending order, then the other keys in insertion order. This now holds on iOS and Android for a literal, an assignment or a decode. A `Map` keeps plain insertion order.
- On iOS, a repeated key in decoded JSON keeps its last value at its first position, as `JSON.parse` does. Before, iOS kept the first value. This applies to records and to struct fields.
- On iOS, `useStream` payloads and `@PyreonAppStorage` / `PyreonStorage` values now decode in document order instead of hash order. Storage now writes the web's `JSON.stringify` bytes.
- On Swift, `const r: Record<…> = {}; r[k] = v` now compiles. The local is declared `var`.
