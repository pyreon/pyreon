---
'@pyreon/lint': patch
---

`pyreon/rx-prefer-pipe` no longer suggests a fix that does not work. Its message recommended `pipe(src, filter(…), map(…))`, but `@pyreon/rx` transforms are data-first `(source, fn)`, not curried operators, so that code is broken. The message now suggests `pipe(src, (xs) => …, (xs) => …)` with plain-function steps, which is what `pipe` accepts.
