---
'@pyreon/validate': patch
---

The verdict JIT now serves `.strict()` as well, pairing it with an own-key scan.

`.strict()` was excluded because rejecting an unknown key needs a scan the inline
loop does not emit, and silently accepting one would be a validation hole. The
emission now pairs eligibility WITH the scan, so the two cannot drift apart: the
predicate is own-key membership (a `Set` built from the shape's keys), matching the
interpreter's `Object.hasOwn` — never `in`, which walks the prototype chain.

Measured on an 8-field object: 244.7ns → 94.7ns (2.6×). In the independent
typescript-runtime-type-benchmarks harness, `assertStrict` goes 4,012,670 →
13,716,279 ops/s, narrowing the gap to TypeBox from 19× to 5.7× and to arktype from
4.5× to 1.3×. It does NOT lead — TypeBox compiles a specialised checker ahead of
time; this scan is generic.

`.catchall()` remains refused in both modes: the inline loop skips unknown keys and
a catchall must VALIDATE them.
