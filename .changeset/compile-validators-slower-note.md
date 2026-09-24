---
'@pyreon/validate': patch
'@pyreon/vite-plugin': patch
---

Correct the documented speed of `pyreon({ compileValidators: true })`. It was described as 1.6–3× faster than the default `.is()`; measured today it is ~2× slower (0.42–0.63× across four schemas, two load-gated runs), because the runtime `.is()` has since gained its own verdict-only JIT while the build still emits an issues-array validator. The option now documents that it is only useful where runtime code generation is blocked (a CSP without `unsafe-eval`).
