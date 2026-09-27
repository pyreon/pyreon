#!/usr/bin/env node
// Hand-written bin (never bundled) — invokes the CLI entry EXPLICITLY rather
// than relying on an `import.meta.main` self-run guard, which does not survive
// the library build (see .agents/rules/testing.md "Test the shipped ENTRY").
import { runCli } from '../lib/cli.js'

// `loom scan . | head` closes the pipe early. That is the reader's choice, not
// a failure, so exit quietly instead of printing an EPIPE stack trace.
process.stdout.on('error', (error) => {
  if (error?.code === 'EPIPE') process.exit(0)
  throw error
})

runCli(process.argv.slice(2))
  .then((code) => {
    if (code) process.exit(code)
  })
  .catch((error) => {
    process.stderr.write(`loom: ${error?.message ?? error}\n`)
    process.exit(1)
  })
