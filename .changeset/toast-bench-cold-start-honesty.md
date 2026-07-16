---
'@pyreon/toast': patch
---

Bench-only: the `bench:commit` create-throughput row is relabeled to what it actually measures — COLD-START ingest (fresh process + 10-call warmup runs JIT-untired code; measured decay ~3.5µs → ~0.22µs deep-warm). A warmed cross-lib burst is structurally impossible (sonner has no synchronous hard-reset → accumulation skew), so Pyreon's steady-state create is printed as a disclosure line via a new `tp:pyreon-warm` worker, never as a verdict. No shipped runtime code changed.
