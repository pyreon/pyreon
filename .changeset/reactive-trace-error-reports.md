---
'@pyreon/reactivity': minor
'@pyreon/core': minor
---

Error reports now carry the reactive run-up to the crash.

For a signal framework, the first question a crash raises isn't *what threw* — the stack answers that — it's *what reactive state led there*. Pyreon's `ErrorContext` previously carried component / phase / props / error but nothing about the signal activity that produced the bad state.

**New: `ErrorContext.reactiveTrace`** — the last ~50 signal writes (chronological, oldest → newest) leading up to the error. The causal *sequence*, not a point-in-time snapshot (a snapshot of every value can't explain *how* the app reached the bad state; the order of writes can). Populated automatically — every registered error handler (Sentry/Datadog/console) gets it for free:

```ts
registerErrorHandler((ctx) => {
  Sentry.captureException(ctx.error, {
    extra: { component: ctx.component, reactiveTrace: ctx.reactiveTrace },
    // e.g. [{ name: 'status', prev: '"idle"', next: '"submitting"' },
    //       { name: 'user',   prev: 'null',    next: 'User {id, …}' }]
  })
})
```

**New: `getReactiveTrace()` / `clearReactiveTrace()`** (`@pyreon/reactivity`) — read / reset the buffer directly (devtools, test isolation), plus the `ReactiveTraceEntry` type.

Design properties:

- **Zero production cost.** The recorder feeding the buffer sits behind the bundler-agnostic production dead-code gate in `signal.ts` `_set` and tree-shakes out of prod bundles. `reactiveTrace` is simply `undefined` in production. Verified: bundle budgets unchanged (all 54 within budget), perf-harness tree-shake regression passes.
- **Bounded + leak-safe.** Fixed-size (~50-entry) ring buffer, oldest-evicted, never grows. Stores **truncated string previews** of values — never raw references — so it can't pin large arrays / detached DOM / closures, and is always safe to serialize into a report. Hostile values (throwing getters, cycles, huge strings, BigInt) are handled without throwing.
- **Distinct from `onSignalUpdate`.** That is opt-in and captures stacks (expensive, for time-travel debugging). This is always-on in dev, deliberately cheap (no stack), and exists specifically to enrich error reports.
- **Best-effort.** Trace capture in `reportError` is wrapped so a buggy/empty trace can never block the real error from reaching handlers. Caller-supplied `reactiveTrace` is never overwritten.

Bisect-verified at both layers: (1) removed the `_recordSignalWrite` call → reactivity ring-buffer tests fail; (2) removed the `reportError` enrichment → `telemetry.test.ts > attaches recent signal writes` fails at `expect(captured?.reactiveTrace).toBeDefined()`; restored → all pass. Suites: `@pyreon/reactivity` 290, `@pyreon/core` 497.
