---
'@pyreon/native-compiler': patch
---

A helper function that returns only from inside control flow now compiles to native code. Examples are `function label(k: number) { if (k === 1) { return 'one' } else { return 'many' } }`, or a `switch` with a `return` in each case. Such helpers used to be dropped with the misleading warning "Component label: no return statement found", while the call to them stayed in the emitted code, so the file did not build on iOS or Android. Also, `switch` case bodies now go through the same statement handling as function bodies. A braced case body (`case 1: { … }`), a `const a = 1, b = 2` declaration and a flat destructure inside a case no longer get dropped.
