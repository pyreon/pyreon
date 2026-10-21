---
'@pyreon/core': patch
'@pyreon/ui-core': patch
'@pyreon/styler': patch
---

Prop pipelines copy plain values by assignment instead of `Object.defineProperty`. `splitProps`, `mergeProps`, `removeUndefinedProps`, ui-core's `omit`/`pick` and the styler's prop forwarding copy property descriptors so getter-backed reactive props survive, but almost every prop is a plain value, and defining it costs about twice an assignment. An assignment produces the identical property, so it is now used whenever the source is a plain writable, enumerable value; getters and unusual descriptors keep the old path. Server-rendering `@pyreon/ui-components` gets 43% faster per component on Node (12.8 → 7.3 µs) and 15–24% faster on Bun, with byte-identical HTML.
