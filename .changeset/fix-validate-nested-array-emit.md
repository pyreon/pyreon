---
'@pyreon/compiler': patch
---

Fix `emitValidator` crashing on nested arrays — under `pyreon({ compileValidators: true })` this silently false-rejected every input.

A schema with two `array` nodes on one root-to-leaf path (`s.array(s.array(...))`, `s.object({ rows: s.array(s.array(...)) })`, etc.) emitted colliding loop variables: every array level used `__i`/`__e`, so the inner `const __e = __e[__i]` self-referenced the outer `__e` in the inner block scope → `ReferenceError: Cannot access '__e' before initialization` (TDZ) thrown for **every** input. Under the vite-plugin's compiled-verdict wiring the throw is swallowed by the verdict try/catch, so `Schema.is(validInput)` returned `false` while `Schema.parse(validInput).ok` returned `true` — a silent, total false-reject.

Fix: thread an enclosing-array `depth` through `emitNode` so each nesting level names its loop vars `__i<depth>` / `__e<depth>`. Sibling arrays at the same depth keep the same name (they live in separate `for` block scopes — correct); only nested arrays now get distinct names. Locked by new nested-array cases in the emit⟷runtime equivalence corpus.
