---
'@pyreon/validate': minor
---

feat(validate): client/server validation tiers — `.serverCheck(key)` + `Result.pending` + `parseAsync` context.

One shared schema, a thin client and a heavy server. `.serverCheck(key, opts?)` declares a server-only validation step (unique-email, breach-check, DNS-MX, cross-field DB lookups). On the **client** (no validator installed) it's a no-op: the value passes and the deferred check is recorded on `Result.pending` — so the UX can show a "checking…" affordance. On the **server**, the validator registered via `registerServerCheck(key, fn)` (from `@pyreon/validate/server`) runs, sync or async; an async check promotes the parse to `parseAsync(input, { context })`, which threads an opaque context (DB handle, request) to the validator.

Enabling infrastructure shipped alongside:

- **Async-aware object fields and array elements.** A field/element validator that returns a Promise (an async `.serverCheck` / `.refine` under `parseAsync`) is now collected and awaited instead of rejected as "async in sync parse". The all-sync path is unchanged (no Promise allocation, byte-identical behavior).
- **Sync/async parity in the compile pipeline.** When a composite type-check resolves async, the object/array's own checks/transforms/refines run against the resolved value, and are skipped when an async field already failed — matching the synchronous early-return semantics.
- **JIT correctness.** A schema containing any `serverCheck` is never JIT-compiled (the generated sync code can't await); it uses the async-aware interpreter. Issue `path` is snapshotted at the check site, so a field/array-element check reports the correct path even though it resolves after the path unwinds.

New exports: `registerServerCheck` / `uninstallServerCheck` / `ServerCheckFn` (from `@pyreon/validate/server`); `installServerCheck` / `getServerCheck` / `uninstallServerCheck` / `ServerCheckFn` and the `PendingCheck` type (from the main entry). `Result<T>`'s ok-branch gains an optional `pending?: ReadonlyArray<PendingCheck>` (additive — existing consumers unaffected). `parseAsync` now accepts an optional `{ context }` second argument.
