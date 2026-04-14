#!/usr/bin/env bun
/**
 * gen-docs — CLI entry for the manifest → docs pipeline.
 *
 * Pure-function implementation lives in `gen-docs-core.ts` so tests
 * and external callers can import without hitting the shebang that
 * Vite/Rolldown reject when bundling downstream test files.
 *
 * ## CLI
 *
 * - `bun run gen-docs` — regenerate in-place.
 * - `bun run gen-docs --check` — exit 0 if in sync, 1 if any file
 *   would change. Prints a minimal unified-diff pointer so reviewers
 *   see exactly what would change without re-running the generator
 *   just to produce a diff.
 *
 * ## Rollback / override
 *
 * If a bug here blocks an urgent merge, a repo admin can temporarily
 * remove `Docs Sync` from the required-checks list in branch-protection
 * settings. File a follow-up to fix the generator, then restore the
 * check. **Do not bypass by hand-editing generated lines** — the next
 * gen-docs run will revert those edits silently.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findManifests, regenerateLlmsTxt } from './gen-docs-core'
import { formatLineDiff } from '../packages/internals/manifest/src/render'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '..')

async function main() {
  const check = process.argv.includes('--check')
  const manifests = await findManifests(REPO_ROOT)
  if (!check) {
    console.log(
      `[gen-docs] found ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`,
    )
  }
  if (manifests.length === 0) {
    if (!check) console.log('[gen-docs] no manifests found — nothing to regenerate')
    return
  }

  const llmsTxtPath = join(REPO_ROOT, 'llms.txt')
  const before = readFileSync(llmsTxtPath, 'utf8')
  const { contents: after, changedLines, missingEntries } = regenerateLlmsTxt(
    before,
    manifests,
  )

  if (missingEntries.length > 0) {
    console.error(
      `[gen-docs] ERROR: these manifests have no matching bullet in llms.txt (expected a line starting with "- <name> —"):\n` +
        missingEntries.map((n) => `  - ${n}`).join('\n') +
        `\nAdd the bullet by hand first (form: \`- <name> — <any text>\`, the generator will then regenerate the tail), then re-run gen-docs.`,
    )
    process.exit(1)
  }

  if (before !== after) {
    if (check) {
      console.error('[gen-docs] llms.txt is out of sync with manifests.\n')
      console.error(formatLineDiff(before, after))
      console.error('\nFix: run `bun run gen-docs` and commit the result.')
      process.exit(1)
    }
    writeFileSync(llmsTxtPath, after)
    console.log(
      `[gen-docs] llms.txt: ${changedLines} line${changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else if (!check) {
    console.log(`[gen-docs] llms.txt: no changes (already in sync)`)
  }
}

// Guard the CLI entry so tests can import this module without running
// `main()` as a side effect. `import.meta.main` is true only when bun
// invokes the file as the entry script.
if (import.meta.main) {
  await main()
}
