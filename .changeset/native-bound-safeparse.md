---
'@pyreon/native-compiler': patch
---

`Pet.safeParse(x)` on a file-scope `@pyreon/validate` schema (`const Pet = s.object({ … })`) now lowers on iOS and Android, the same way the inline `s.object({ … }).safeParse(x)` form does — `.success` and `.data` both work. It used to be emitted verbatim (a static method called through an instance, with an object argument lowered to a struct) and compiled on neither target, with no warning. `Pet.parse(x)` and `.safeParse` on an `s.discriminatedUnion` binding now warn by name instead of emitting uncompilable code.
