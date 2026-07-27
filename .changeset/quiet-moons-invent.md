---
'@pyreon/compiler': patch
'@pyreon/core': patch
'@pyreon/reactivity': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

Teach `pyreon doctor diagnose` / MCP `diagnose` the MAX_PASSES batch-flush error.

The reactivity batch flush drops queued effects after 32 passes and logs in both
dev and production, so users hit the string in production builds — but the
catalog had no entry for it. The new entry explains the cause (an effect that
writes a signal it also reads, re-enqueueing until the cap) and the three real
remedies: use `computed()` when only deriving, `.peek()` to read without
subscribing, or gate the write so it cannot re-trigger.

Also compresses verbose source comments across the core packages. No runtime
behaviour changes — the published artifacts are byte-identical, since `src/` is
stripped from the tarball and the bundler strips comments from `lib/`.
