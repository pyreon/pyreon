---
'@pyreon/vite-plugin': minor
---

Add `pyreon({ optimizeValidators: true })` — opt-in, build-only compile-time tree-shaking for `@pyreon/validate` schemas. You keep writing the beautiful chainable API (`s.string().email().min(2)`); the plugin rewrites each statically-analyzable module-level `const X = s.<chain>` (in `.ts` modules) into the equivalent lean `@pyreon/validate/mini` form at build time, importing only the constructors + actions it uses — so the bundle prunes the format/range validators it doesn't. Measured: a 3-field schema drops ~11 KB → ~6.5 KB gz (−41%). Verdict-for-verdict identical to the runtime (parity-locked end to end by `@pyreon/validate`'s `compile-rewrite-equivalence.test.ts`). OFF by default; dev keeps the chainable runtime (HMR-reactive). Conservative — dynamic schemas (built in a function / conditionally / non-literal arg) and `.tsx` schemas gracefully stay full-runtime.
