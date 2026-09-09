---
'@pyreon/native-compiler': patch
---

Spreading an optional object now warns by name instead of emitting uncompilable code

`{ a: "x", ...o }` where `o: Opts | undefined` lowered to Swift
`{ var c = o; c.a = "x"; return c }()` — `c` is `Opts?`, so the member
assignment and the return type both fail — and to Kotlin `o.copy(a = "x")`,
which is rejected on a nullable receiver. TypeScript accepts the source
(`{ ...undefined }` is legal and contributes nothing), so nothing upstream
objected either, and the emit was **silent on both targets**.

The first signal was therefore a swiftc/kotlinc gate, whose error names the
generated Swift rather than the line that produced it. One such spread in a
crossing chart file cost 35 compile failures across every chart suite before it
was traced back.

The emit is deliberately unchanged — this is a diagnostic, not a behaviour
change. There is no honest fallback: JS says the spread contributes nothing
when the source is nullish, but the emitted struct still needs every field, and
the defaults for the ones the literal does not name are not knowable at that
point. So the message names the binding and the remedy (build the object field
by field: `field: o?.field ?? fallback`).

`T | null` warns as well as `T | undefined`; a non-optional spread stays silent,
which is the half that keeps this a diagnostic rather than noise.
