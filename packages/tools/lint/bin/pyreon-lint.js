#!/usr/bin/env node
// The invocation MUST live here, in this un-bundled wrapper. `src/cli.ts`'s
// `if (import.meta.main) main()` self-run guard does NOT survive the library
// build (rolldown drops it — and inside a chunk `import.meta.main` is never
// true anyway), so a bare `import('../lib/cli.js')` loads a pure re-export
// module and exits 0 having done nothing: the shipped 0.43.0 bin was a
// complete no-op. Locked by `src/tests/bin-invokes-cli.test.ts`.
import('../lib/cli.js').then(({ runCli }) => {
  const code = runCli(process.argv.slice(2))
  // `null` = long-running mode (--watch / --lsp) — keep the process alive.
  if (code !== null) process.exit(code)
})
