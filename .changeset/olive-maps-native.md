---
'@pyreon/native-compiler': minor
'@pyreon/sized-map': minor
---

Co-locate a native runtime for `@pyreon/sized-map`, and lower its constructor

`@pyreon/sized-map` is 102 lines of pure logic with no platform edge, and it did
not work natively at all: `new SizedMap(...)` fell through to the generic "class
constructors are not supported" path and emitted `let m = ""` — an empty STRING
where a bounded map was expected.

It now ships `native/{swift,kotlin}/PyreonSizedMap` and
`new SizedMap<K, V>({ maxEntries, lru })` lowers to it on both targets, so the
tier moves from `web-only` to `shared`.

The ordering is the whole of the work. JavaScript's `Map` preserves insertion
order, so the web gets eviction for free from `map.keys().next()`. Kotlin's
`LinkedHashMap` does too and mirrors it almost line for line; Swift's
`Dictionary` is explicitly UNORDERED, so the Swift runtime carries the recency
order in a parallel array — O(n) per touch against the web's O(1), which is a
deliberate trade for a structure whose cap is small by construction, and is
stated in the file rather than left to be discovered.

Three semantics are easy to get wrong and are asserted one-for-one on both
platforms: FIFO is the DEFAULT (a read does not rescue an entry from eviction),
LRU is opt-in, and `set` ALWAYS refreshes position in BOTH modes — otherwise a
just-written entry is evicted on the very next call.

The constructor recognizer gates on the IMPORT, not the bare name: `SizedMap` is
a plausible name for a user's own class. A non-literal `maxEntries` declines
with a reason rather than baking in a wrong constant.
