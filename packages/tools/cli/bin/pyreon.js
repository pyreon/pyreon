#!/usr/bin/env node
// Hand-written bin (never bundled). It calls the CLI EXPLICITLY: the library
// entry `lib/index.js` must not run anything when it is imported, because
// `@pyreon/zero-cli` imports `doctor` from it, and a self-running entry ran
// the whole `pyreon` CLI a second time with zero's argv.
import { runPyreonCli } from '../lib/index.js'

await runPyreonCli(process.argv.slice(2))
