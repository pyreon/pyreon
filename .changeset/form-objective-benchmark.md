---
---

Add `examples/form-bench` — a Tier-B, real-browser, cross-framework form
benchmark (Pyreon vs React Hook Form MVP) with a committed objectivity +
honesty contract (`METHODOLOGY.md`), and harden the Tier-A headless form bench
(`packages/fundamentals/form/bench/form-bench.ts`) with bootstrap CI95 + CV +
tied-within-noise detection.

Benchmark-only: no shipped `@pyreon/form` code changed (`bench/` is not in the
published tarball, and the new example is private), so this is an intentional
no-release changeset.
