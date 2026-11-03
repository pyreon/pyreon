---
'@pyreon/native-compiler': patch
---

A local closure called as a statement keeps its call on iOS and Android. `const f = () => { n++ }; f()` inside a function, handler, loop or `onMount` body emitted a bare `f`, which swiftc rejected and Kotlin compiled as a silent no-op. The closure's name is now callable for the rest of the statement list that declares it, and only there, so a signal of the same name outside that list is still read, not called.
