---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

An optional value turned into text now reads as it does on the web. `` `Picked: ${xs.find(p)}` `` printed `Picked: Optional(2)` on iOS and, when absent, `nil` (iOS) / `null` (Android) where the web prints `undefined`; the same for optional fields, `.at`, `.findLast`, `map.get`, `?.` chains, `'text' + x` and `String(x)`. These positions now go through the runtimes' new `pyreonOptionalText(value, absent)`, which spells the absent value as the TypeScript type names it (`undefined` or `null`). The Swift typecheck gates also reject any emitted interpolation of an optional (swiftc's "debug description for an optional value" warning), so a position the emitters miss fails validation instead of shipping.
