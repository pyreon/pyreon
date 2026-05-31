---
'@pyreon/query': patch
---

perf(query): batch() 2 hot multi-signal write sites in `@pyreon/query`'s SSE adapter

Two sites in `use-sse.ts` were firing 2-3 separate notify cycles per error event when subscribers commonly read 2+ of the signals together (typical: a UI showing connection state + error message + readyState).

- **`handleError`** — 3 sequential writes (`status`, `error`, `readyState`) per SSE error. Wrapped in `batch()`: subscribers get notified once per error, not three times. Hot on flaky networks.
- **`connect` catch branch** — 2 sequential writes (`status`, `readyState`) on EventSource construction failure. Wrapped in `batch()`: same shape.

Bisect-proven via real `@pyreon/reactivity` harness:

```
UN-batched 3 writes → effect re-runs: 3 (expected: 3)
Batched   3 writes → effect re-runs: 1 (expected: 1)
PROVED: batch() reduces 3 SSE state writes → 1 notify
```

Caught by `pyreon/no-unbatched-updates` lint rule. `@pyreon/query`'s 3rd flagged site (`use-subscription.ts` `connect`) is a walker precision gap caused by early-return semantics — its real max-path is 2 writes, not 3 (the rule sums mutually-exclusive `!isEnabled` + catch branches). Fix lands in a follow-up rule precision PR.
