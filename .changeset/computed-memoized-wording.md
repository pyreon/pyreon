---
"@pyreon/reactivity": patch
---

Stop calling `computed` "memoized" without saying what that does and does not cover

`computed` caches its value and recomputes lazily — but it does NOT gate
propagation on equality. Without `equals` it notifies downstream on every
dependency change, even when the recomputed value is identical. That is the one
place Pyreon diverges from Solid `createMemo` and Vue/Preact `computed`, which
all memoize by default.

The prose said so. Four summary lines did not, and those are the ones people
read first: the `llms.txt`/`llms-full.txt` one-liner that AI assistants consume,
the header comment in the usage example, the API table row, and the return-value
description. All four said "memoized" unqualified — the exact word that means
"gates on equality" in every peer framework, aimed squarely at the audience most
likely to be porting from one.

No behaviour change. The divergence is now stated where a reader meets it,
including an explicit note for anyone porting from Solid/Vue/Preact.
