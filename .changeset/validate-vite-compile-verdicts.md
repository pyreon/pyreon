---
'@pyreon/vite-plugin': minor
---

Add opt-in `pyreon({ compileValidators: true })`. Production builds append `X._attachCompiledVerdict((v) => …)` to every module-level, fully-emittable `const X = s.<schema>` from `@pyreon/validate`, so the runtime `X.is(v)` runs an inlined monomorphic validator instead of `X.parse(v).ok`. The emitted verdict is byte-equivalent to the runtime (locked by the compiler's emit-equivalence gate) — speed only, never a different result. Runs for both `.ts` and `.tsx`; build-only (dev keeps the runtime path); composed/aliased/unsupported schemas are skipped silently and fall back to the runtime `.is()`. OFF by default. Exports `buildCompiledVerdicts(code, id)` for the same effect outside the plugin.
