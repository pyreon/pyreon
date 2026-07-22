---
'@pyreon/validation': patch
---

`standardSchemaToValidator` sync fast-path: a synchronously-validating schema (zod/valibot/arktype sync trees, `@pyreon/validate`'s `s`) now returns the per-key error record **directly** instead of always wrapping in a Promise — no Promise allocation and no microtask hop per validation call (the keystroke path in `@pyreon/form`'s `validateOn`), and sync consumers stay sync. Genuinely async schemas still return a Promise. `SchemaValidateFn` always permitted both return shapes, so this is behavior-compatible for every awaiting caller.

Also ships `bench/validation-bench.ts` (`bun run bench:validation`) — a process-isolated, correctness-gated wrapper-tax bench proving the adapter/bridge overhead over the raw zod/valibot/arktype call is ≈0 ns on valid paths (the only real cost is arktype failure-path issue normalization, paid on rejection only).
