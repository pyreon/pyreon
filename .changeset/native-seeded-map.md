---
'@pyreon/native-compiler': minor
---

feat(native): seeded `new Map([[k, v], …])` lowers to a native dict literal

The mirror of the already-supported seeded `new Set([...])`. `new Map([["apple", 3], ["pear", 2]])` now lowers instead of warning + dropping: Swift `["apple": 3, "pear": 2]` (typed `[String: Int]`), Kotlin `mutableMapOf("apple" to 3, "pear" to 2)`. Key and value must be SCALAR (a native dictionary key needs Hashable; the value is held to the same scalar bar as the empty `new Map<K,V>()` form). Any other shape — a non-pair element, a non-scalar key/value, a computed pair array — stays a named warning, never a mis-emit.

Verified end-to-end against real swiftc + kotlinc; bisect-verified.
