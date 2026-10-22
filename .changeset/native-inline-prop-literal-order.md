---
'@pyreon/native-compiler': patch
---

Native: an object literal passed to a prop whose type is an inline object now constructs the prop's own struct, in either declaration order. `function Card(props: { user?: { name: string } })` with `<Card user={{ name: 'a' }} />` built `CardUser` only while `Card` was being emitted, so a call site emitted earlier synthesized its own identical `__ObjN`, which the parameter rejected — on Swift whenever the caller came first in the file, on Kotlin always — with no warning. Both emitters now render every component's prop types before emitting any component, reusing the same naming and declaring the same structs as before (the emitted output of every existing example is byte-identical), so the call site finds the prop's struct regardless of order.
