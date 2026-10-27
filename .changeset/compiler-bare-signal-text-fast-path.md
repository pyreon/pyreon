---
'@pyreon/compiler': patch
---

A bare signal used as JSX text (`<span>{count}</span>`) now compiles to the same direct `_bindText(count, …)` binding as the called form `{count()}`, in both the JS and Rust backends. It used to go through the general `bindPolymorphicText` binding, which re-tracks on every update. Behaviour is unchanged: `_bindText` still mounts a VNode if the signal holds one. A local variable that shadows a signal's name is not affected.
