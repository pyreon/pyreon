---
'@pyreon/router': patch
---

`scanCleanPath` (the fast-lane plain-path gatekeeper) gains a frozen-oracle behavior lock: a 5000-path differential fuzz + explicit edge suite against a verbatim copy of the implementation, via two `@internal` test hooks. Also records a measured negative result on the function itself: a native-`indexOf` scan rewrite was behavior-identical but 15% SLOWER at realistic path lengths (JSC per-call overhead vs the JIT'd char loop) and was reverted — the note prevents re-attempts. No behavior change.
