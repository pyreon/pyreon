---
'@pyreon/reactivity': minor
---

Add `linked()`, a writable derived value (Angular `linkedSignal`). `linked(() => expr)` follows `expr` and resets when it changes; `linked(source, (s, prev) => value)` tracks only `source` and computes untracked from the new source value and the previous `{ source, value }`. Between source changes the value can be overwritten with `.set()` / `.update()`. Lazy like `computed`, with an optional `equals` for downstream notifications.
