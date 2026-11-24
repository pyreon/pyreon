#!/usr/bin/env node
// Hand-written, never bundled.
//
// Load explicit compiler plugins before starting build/check/watch/LSP.
// Calling the entry directly keeps published Node execution independent of
// Bun-only self-run guards and bundler transformations.
//
// The scaffolded builds invoke this through `npx pyreon-native build …`
// (scripts/build-ios.sh, scripts/build-android.sh), so Node — not Bun — is
// the runtime that has to work.
import { exitAfterFlush, mainWithPlugins } from '../lib/index.js'

const argv = process.argv.slice(2)
const code = await mainWithPlugins(argv)

// Long-running modes keep themselves alive via their own listeners; exiting
// here would tear them down. Setup failures must still exit unsuccessfully.
// `exitAfterFlush`, not `process.exit`: on a pipe stdout is written
// asynchronously, and an immediate exit cut piped output off at 64 KiB (#4799).
if (code !== 0 || (!argv.includes('--lsp') && !argv.includes('--watch'))) {
  await exitAfterFlush(code)
}
