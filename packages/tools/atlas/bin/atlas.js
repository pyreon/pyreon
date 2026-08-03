#!/usr/bin/env node
// Hand-written bin (never bundled) — invokes the CLI entry EXPLICITLY rather
// than relying on an `import.meta.main` self-run guard, which does not survive
// the library build (see .claude/rules/testing.md "Test the shipped ENTRY").
import { runCli } from '../lib/cli.js'

runCli(process.argv.slice(2))
  .then((code) => {
    // Set the code rather than exiting immediately: a natural drain flushes
    // piped stdout, which `process.exit()` can truncate — and callers (the
    // `verify-browser` e2e among them) assert on that stdout.
    process.exitCode = code ?? 0

    // ...but a SUCCESSFUL command must not hang on a handle we do not own.
    // Commands that embed a dev server close both the browser and the server,
    // and an embedded Vite dep-optimizer can still outlive them — the process
    // then sits idle forever with its work done and its output printed, which
    // reads to any caller as a timeout rather than as success. This timer is
    // `unref`ed so it cannot itself keep the loop alive: a clean drain exits
    // first and it never fires; a held-open loop force-exits with the right
    // code, after the output is already written.
    const bail = setTimeout(() => process.exit(process.exitCode ?? 0), 500)
    bail.unref?.()
  })
  .catch((error) => {
    process.stderr.write(`atlas: ${error?.message ?? error}\n`)
    process.exit(1)
  })
