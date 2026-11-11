---
'@pyreon/native-compiler': patch
---

Native: on Android, the cross-target `Int` alias (`type Int = number`) is now a `Long`, the same 64-bit integer as Swift's `Int` and as a plain integer `number`. It used to be emitted as Kotlin's 32-bit `Int`, so a field, parameter or return typed `Int` rejected the `Long` values PMTC emits (`qty = 1L`, `row.qty + 1L`) and failed to compile. The integer-decode warning recommends exactly this spelling for whole-number fields.
