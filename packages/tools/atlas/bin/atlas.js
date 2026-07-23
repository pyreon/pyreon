#!/usr/bin/env node
// Hand-written bin (never bundled) — invokes the CLI entry EXPLICITLY rather
// than relying on an `import.meta.main` self-run guard, which does not survive
// the library build (see .claude/rules/testing.md "Test the shipped ENTRY").
import { runCli } from '../lib/cli.js'

runCli(process.argv.slice(2))
  .then((code) => {
    if (code) process.exit(code)
  })
  .catch((error) => {
    process.stderr.write(`atlas: ${error?.message ?? error}\n`)
    process.exit(1)
  })
