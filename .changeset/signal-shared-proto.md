---
'@pyreon/reactivity': minor
---

perf(reactivity): share signal methods via prototype — drop 6 per-instance property assignments

`signal()` used to assign all 6 methods (peek/set/update/subscribe/direct/debug) as own properties on every signal instance — 6 property writes per signal allocation. Replaced with a shared `SignalProto` object and a single `Object.setPrototypeOf(read, SignalProto)` call. Methods are now resolved via prototype chain.

All signals share the same prototype → monomorphic call sites at every `signal.method()` invocation. V8 hidden classes stay stable across signals.

Per-signal alloc cost: 6 method assignments + 3 state writes + 1 label write → 1 setPrototypeOf + 3 state writes + 1 label write.

bench:fair (2 confirmation runs vs post-merge main baseline):

| Test | Pyreon (compiled) | Verdict |
|---|---|---|
| create 1k | 12.90 → 10.50ms (−19%) | 5-way tie → **OUTRIGHT LEADER** |
| replace all rows | 11.90 → 10.50ms (−12%) | co-leader → still tied (was 17% behind Vue pre-merge) |
| create 10k | 124.25 → 113.80ms (−8%) | held outright |
| partial/select/swap/clear | within ±3% noise | held |

457/457 reactivity + 531 core + 683 runtime-dom + 543 router + 5 other downstream packages (3,241 tests total) pass with no failures.
