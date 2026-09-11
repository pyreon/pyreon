---
'@pyreon/native-compiler': patch
---

An integer literal in a `Record<string, Double>` now emits as a Double.

`values={{ '2024-01-03': 4 }}` is the natural way to write calendar counts —
they ARE integers — and it emitted an Int-valued map against a Double-valued
annotation, which does not compile on Android. It read fine on the web, so the
first sign of it was a native example refusing to build.

Applied where the value type is KNOWN (a map literal's values), deliberately not
at the literal emit reading the ambient expected type: that type describes an
ENCLOSING position and also covers an array index, the argument of
`Double(n - 1)` and the operands of `level == 2`.
