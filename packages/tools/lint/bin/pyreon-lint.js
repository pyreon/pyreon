#!/usr/bin/env node
// The invocation MUST live here, in this un-bundled wrapper. `src/cli.ts`'s
// `if (import.meta.main) main()` self-run guard does NOT survive the library
// build (rolldown drops it — and inside a chunk `import.meta.main` is never
// true anyway), so a bare `import('../lib/cli.js')` loads a pure re-export
// module and exits 0 having done nothing: the shipped 0.43.0 bin was a
// complete no-op. Locked by `src/tests/bin-invokes-cli.test.ts`.
Promise.all([import('../lib/cli.js'), import('../lib/internal.js')]).then(async ([{ runCli }, { exitAfterFlush }]) => {
  // `runCli` is async: the default lint path uses a worker pool.
  const code = await runCli(process.argv.slice(2))
  // `null` = long-running mode (--watch / --lsp) — keep the process alive.
  // `exitAfterFlush`, not `process.exit`: on a pipe stdout is written
  // asynchronously and an immediate exit cut `--format json` off at 64 KiB
  // (#4799); the worker pool's handles are why it still has to force the exit.
  if (code !== null) await exitAfterFlush(code)
})
