---
name: pyreon-benchmarks
description: Pyreon's measured benchmark standings and the measurement protocol that produced them — the krausest-style DOM suite, core micro-benchmarks, per-library head-to-heads, retained-heap numbers, and the honest limits (author-judge, synthetic-not-real-app). Load before making, changing, or reviewing ANY performance claim, before running a benchmark, and before writing a perf number into docs. Carries the traps: never force GC in JSC, never run benches concurrently, NODE_ENV=production before framework imports.
---

Read `.agents/guides/benchmarks/README.md` in full (the tool-neutral source of truth for this topic). Per-topic files live in `.agents/guides/benchmarks/references/` — read only the one you need. Edit those files, not this shim.
