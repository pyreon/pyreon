---
'@pyreon/validate': minor
'@pyreon/vite-plugin': patch
---

`@pyreon/validate/mini` no longer ships the runtime JIT: a 4-field object schema app drops from 8.72 to 5.20 KB gz, below `zod/mini`. Mini schemas compile through the interpreter, which returns identical results. The main entry (`@pyreon/validate`) still installs the JIT, so its speed is unchanged.

Migration: if you import from `@pyreon/validate/mini` directly and want the JIT's speed, call `enableJit()` from the new `@pyreon/validate/jit` subpath once, before the first parse. `pyreon({ optimizeValidators: true })` now adds that call to every module it rewrites, so plugin users see no change.
