---
"@pyreon/validate": patch
---

Faster valid-path parsing for scalars + flat objects — Pyreon's `s` runtime now beats ArkType on flat-object, nested, number-range, and array valid-parse (was behind on flat-object-with-email + number-range).

Three JIT/runtime optimizations, all semantics-preserving (JIT↔interpreter differential fuzz + format-registry-routing tests green; error messages, paths, and the client/server `/server` validator swap unchanged):

- **Format-check JIT inlining.** A format check (`.email()`/`.url()`/`.uuid()`/`.regex()`/…) now exposes a pure `_pred` predicate that the JIT calls on the valid path, invoking the issue-pushing closure ONLY on failure. The old path called a `wrapCheckWithPath` wrapper that pushed/popped `ctx.path` (with a `try/finally`) on EVERY valid parse — the dominant per-field cost of an object with a format field, which kept flat-object-with-email ~1.16× behind ArkType. The resolver is memoized against a registry version counter, so the per-parse `Map.get(name)` string-hash lookup is gone too.
- **Lazy `EMPTY_PATH` sentinel.** `makeCtx` starts every parse's `path` at a shared frozen empty-array sentinel; a scalar / flat-object parse (path-elided by the JIT) allocates ZERO path arrays. Only a keyed descent that actually writes swaps in a real array (`mutablePath`). Roughly doubles ctx-allocation throughput — the dominant cost of a trivial scalar parse.
- **Sync-only JIT body.** When a compiled schema tree has no fallback/array subtree (no source of an async result), the generated validator omits the async `A`/`B` pending lists + the `Promise.all` root barrier + the per-call `NOOP` closure — a leaner body the engine optimizes better.
