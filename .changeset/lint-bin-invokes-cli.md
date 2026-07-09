---
"@pyreon/lint": patch
---

The `pyreon-lint` bin actually runs the CLI — it was a complete no-op in published builds. `bin/pyreon-lint.js` was a bare `import('../lib/cli.js')`, but the built `lib/cli.js` is a pure re-export: `src/cli.ts`'s `if (import.meta.main) main()` self-run guard does not survive the library build (rolldown drops it, and inside a bundled chunk `import.meta.main` is never true anyway), so the bin loaded a module, ran nothing, and exited 0 for every invocation. The wrapper now explicitly calls `runCli(process.argv.slice(2))` and exits with its code (staying alive for `--watch`/`--lsp`). Locked by a real-bin regression test that asserts exit code 1 on an error-severity finding — the no-op bin exited 0 (bisect-verified). Note `pyreon lint` (via `@pyreon/cli`) was unaffected — it forwards to `runCli` programmatically; only the standalone `pyreon-lint` binary was dead.
