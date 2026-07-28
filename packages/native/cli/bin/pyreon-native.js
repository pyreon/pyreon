#!/usr/bin/env node
// Hand-written, never bundled.
//
// This bin CALLS main() explicitly rather than importing the entry and hoping
// a self-run guard fires. `cli.ts` gates its own invocation on
// `import.meta.main`, which is Bun-only (undefined on Node < 24.2) AND is
// dropped by the bundler when `lib/` is built — the exact combination that
// shipped `pyreon-lint` as a silent no-op in every published version.
//
// The scaffolded builds invoke this through `npx pyreon-native build …`
// (scripts/build-ios.sh, scripts/build-android.sh), so Node — not Bun — is
// the runtime that has to work.
import { main } from '../lib/index.js'

const argv = process.argv.slice(2)
const code = main(argv)

// Long-running modes keep themselves alive via their own listeners; exiting
// here would tear them down. Mirrors the guard block in src/cli.ts.
if (!argv.includes('--lsp') && !argv.includes('--watch')) {
  process.exit(code)
}
