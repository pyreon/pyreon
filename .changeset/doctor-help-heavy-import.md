---
'@pyreon/cli': patch
'@pyreon/mcp': patch
---

`pyreon doctor --help` no longer boots the entire gates graph to print a usage string. The CLI's eager `FAST_GATES`/`SLOW_GATES` import rode the orchestrator's `./gates` module — every gate implementation, the compiler, the TypeScript API — measuring 45.8s wall for `--help`. The gate NAME registry now lives in a dependency-free `gate-names.ts` (orchestrator re-exports it, so existing imports keep working), and the three tests the Coverage (Full) diagnostic named on main carry derived budgets instead of defaults (the mcp audit specs get coverage-aware arms — the instrumented server pays a 2-5x multiplier the uninstrumented Test cells never see).
