#!/usr/bin/env node
// The published entry. Calls `main` EXPLICITLY rather than relying on an
// `import.meta.main` self-run guard inside the bundled lib: that guard does not
// survive the library build (rolldown drops it, and inside a bundled chunk
// `import.meta.main` is never true), which ships a bin that silently does
// nothing. See `.claude/rules/testing.md` "Test the shipped ENTRY".
import { main } from '../lib/cli.js'

main(process.argv.slice(2), process.cwd())
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
