/**
 * Source-only entry for the repo's own scripts: `bun packages/tools/cli/src/main.ts …`
 * (`lint:pyreon`, `check-pyreon-lint-ratchet`). It is not a published entry and
 * is never built into `lib/`.
 *
 * The library entry (`index.ts`) must not run the CLI in any form: it used to
 * self-run under an `import.meta.main` guard, which ships in `lib/index.js` and
 * is true again in a consumer that bundles `@pyreon/cli` into its own script,
 * so `zero doctor` and friends would run the whole CLI a second time. The
 * published bin is `bin/pyreon.js`.
 */
import { runPyreonCli } from './index'

await runPyreonCli(process.argv.slice(2))
