---
"@pyreon/rx": patch
---

perf: arity-specialize `combine` to drop per-emit allocations

`combine(...sources, fn)` recomputes on every input change (e.g. per keystroke
for a derived field), and the variadic body `fn(...sources.map((s) => s()))`
allocated a fresh `map` array plus a spread arguments object on every emit.

Read the fixed 2–4 sources directly (`fn(a(), b())`), capturing the signals once
at setup instead of mapping per emit. Behavior-identical — every arity (2–6
sources) is covered by the existing tests, and the 5+ case keeps the variadic
fallback.
