---
'@pyreon/validate': patch
---

`.refine(fn)` without its options no longer makes a synchronous `.parse()` throw: a failing refine returns an issue with the message `'Invalid value'` (the `s.custom()` default), on the JIT and the interpreter, as `parseAsync` already did. The `opts` argument and its `message` are now optional in the type.
