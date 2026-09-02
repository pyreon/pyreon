---
'@pyreon/native-compiler': patch
---

PMTC: an un-lowered `@pyreon/validation` adapter call is now DECLINED BY NAME instead of shipped broken

Every schema recognizer keys on the INLINE argument — `zodSchema(z.object({ … }))`.
The ordinary refactor of lifting the schema to its own const, `const base =
z.string()` then `zodSchema(base)`, matches none of them.

Declining is correct: synthesizing a native struct from an unresolved binding
would be a guess. But the node then fell through to a VERBATIM emit, and `z` /
`v` / `type` exist in neither Swift nor Kotlin — so the generated file failed to
compile (`cannot find 'z' in scope`, `unresolved reference`) with nothing said at
emit time. The compiler now warns naming the adapter, the binding, what will
happen, and the fix.

The existing spec asserting no struct is synthesized for this shape is the right
invariant and is unchanged; it was simply silent about what got emitted instead.
This is the missing half.

Found by compiling all 103 shared-source fixtures across the tier2 emit suites
against the real toolchains: 4 of 206 compiles failed with NO warning, and they
were these two shapes. Those suites make almost no toolchain calls — 13 of 15
files invoke no compiler at all — so a string assertion was the only thing
standing between this and a user.
