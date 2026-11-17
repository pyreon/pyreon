import { defineCpaCompatRuntimeSuite } from './cpa-app-compat.shared'

/**
 * Compat-mode runtime gate for a FRESH `create-zero --compat <x>` scaffold.
 * `scripts/scaffold-smoke.ts` scaffolds `examples/cpa-smoke-app-<x>-compat`,
 * installs and builds it, then runs this spec through
 * `e2e-configs/cpa-compat-scaffold.config.ts` against its dev server, with
 * `CPA_COMPAT` naming the layer.
 */
const compat = process.env['CPA_COMPAT']
if (compat !== 'react' && compat !== 'vue' && compat !== 'solid' && compat !== 'preact') {
  throw new Error(
    `[cpa-app-compat] CPA_COMPAT must be react, vue, solid or preact (got ${String(compat)}). Run it through \`bun scripts/scaffold-smoke.ts cpa-smoke-app-<x>-compat\`.`,
  )
}
defineCpaCompatRuntimeSuite(compat)
