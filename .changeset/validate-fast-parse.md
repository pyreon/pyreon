---
'@pyreon/validate': minor
---

Faster valid-input `parse()` and `.is()` on JIT-compiled schemas, and `compileValidators` can no longer slow `.is()` down.

- `parse()` on a fully inline OBJECT or ARRAY root now runs a third emission first: a ctx-free validator that builds the output value and returns a failure sentinel at the first failing check (compiled Zod's seam shape). The full validator re-runs only on failure, to build the issues. Results are unchanged; a new interpreter differential (`jit-fast-differential.test.ts`) locks it.
- `.is()` on a schema the verdict JIT serves is now the verdict function itself, installed as an own property in the same pass as the parse artifacts and removed with them on invalidation.
- The `standard` email check calls the scanner directly, and the scanner decides the TLD in its domain pass instead of a third loop.
- Behaviour change: a verdict attached by `pyreon({ compileValidators: true })` is now used only when the runtime verdict JIT does not serve the schema (`configure({ jit: false })`, a CSP without `'unsafe-eval'`, or a refused shape). With the JIT on, the runtime verdict was about 2× faster than the attached one, so it now wins.
