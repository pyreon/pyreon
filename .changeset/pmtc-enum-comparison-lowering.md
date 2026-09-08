---
'@pyreon/native-compiler': minor
---

PMTC: a string-literal union compared against a string literal now lowers to a native enum case in every operand position

A union alias (`type Position = 'top' | 'right' | …`) lowers to a Swift/Kotlin
enum, but the comparison emit only rewrote the literal side for ONE shape — an
enum-typed signal read. A function parameter, a struct field, or a literal on
the left of the comparison all emitted `p == "top"`, which neither toolchain
accepts:

```
swiftc  cannot convert value of type 'Position' to expected argument type 'String'
kotlinc operator '==' cannot be applied to 'Position' and 'String'
```

Branching on a union type is the ordinary reason to declare one, so this made
any such shared source uncompilable on both targets. It survived because the
only in-tree consumer of a union-alias enum is the generated chart engine,
which declares two and compares against neither — the emit path had never run.

The generated chart engine is byte-identical after the fix, and the new spec
compiles its own emit with the real `swiftc` and `kotlinc`.
