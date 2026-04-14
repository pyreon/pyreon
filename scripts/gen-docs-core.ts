/**
 * gen-docs core — orchestration logic for the manifest → docs pipeline.
 *
 * Pure rendering (manifest → line) lives in `@pyreon/manifest` along
 * with filesystem walking (`findManifests`). This file owns the
 * orchestration step: given a file's contents + a set of manifests,
 * compute the regenerated contents. Also owns the `main()` entry
 * point that the CLI wraps, with injectable I/O so tests can run
 * in-process without `spawnSync` overhead.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  findManifests,
  formatLineDiff,
  type LoadedManifest,
  type PackageManifest,
  renderLlmsTxtLine,
} from '../packages/internals/manifest/src'

export interface RegenerateResult {
  contents: string
  changedLines: number
  missingEntries: string[]
}

/**
 * Replace existing `- <name> —` bullets in llms.txt with regenerated
 * content from the manifests. Returns the list of manifest names whose
 * bullet line could NOT be found in llms.txt — the caller should
 * treat this as a hard error (manifests without a landing line
 * produce silent no-ops that drift untracked).
 *
 * @example
 * ```ts
 * import { regenerateLlmsTxt } from './gen-docs-core'
 * import { findManifests } from '@pyreon/manifest'
 * import { readFileSync } from 'node:fs'
 *
 * const manifests = await findManifests(process.cwd())
 * const before = readFileSync('llms.txt', 'utf8')
 * const { contents, missingEntries } = regenerateLlmsTxt(before, manifests)
 * if (missingEntries.length > 0) throw new Error(`missing: ${missingEntries.join(', ')}`)
 * ```
 */
export function regenerateLlmsTxt(
  contents: string,
  manifests: LoadedManifest[],
): RegenerateResult {
  let next = contents
  let changedLines = 0
  const missingEntries: string[] = []
  for (const { manifest } of manifests) {
    const targetLine = renderLlmsTxtLine(manifest)
    const bulletPrefix = `- ${manifest.name} —`
    const escaped = bulletPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escaped}.*$`, 'm')
    if (!re.test(next)) {
      missingEntries.push(manifest.name)
      continue
    }
    const prev = next
    next = next.replace(re, targetLine)
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines, missingEntries }
}

/**
 * Injectable I/O for `main()` — tests replace these to capture output
 * in-process. Default bindings point at the real process streams.
 */
export interface CliIO {
  stdout: (s: string) => void
  stderr: (s: string) => void
  exit: (code: number) => never
}

export const defaultIO: CliIO = {
  stdout: (s) => {
    // oxlint-disable-next-line no-console
    console.log(s)
  },
  stderr: (s) => {
    // oxlint-disable-next-line no-console
    console.error(s)
  },
  exit: (code) => process.exit(code),
}

/**
 * Main entry — orchestrates find → regenerate → write (or `--check`).
 * Injectable I/O keeps tests fast in-process and avoids shelling out
 * to `bun` via `spawnSync` for every scenario.
 *
 * @example
 * ```ts
 * const stdout: string[] = []
 * const stderr: string[] = []
 * try {
 *   await main(repoRoot, ['--check'], {
 *     stdout: (s) => stdout.push(s),
 *     stderr: (s) => stderr.push(s),
 *     exit: (c) => { throw new Error(`exit ${c}`) },
 *   })
 * } catch (e) {
 *   // inspect exit code + captured streams
 * }
 * ```
 */
export async function main(
  repoRoot: string,
  argv: string[],
  io: CliIO = defaultIO,
): Promise<void> {
  const check = argv.includes('--check')
  const manifests = await findManifests(repoRoot)

  if (!check) {
    io.stdout(
      `[gen-docs] found ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`,
    )
  }
  if (manifests.length === 0) {
    if (!check) io.stdout('[gen-docs] no manifests found — nothing to regenerate')
    return
  }

  const llmsTxtPath = join(repoRoot, 'llms.txt')
  const before = readFileSync(llmsTxtPath, 'utf8')
  const { contents: after, changedLines, missingEntries } = regenerateLlmsTxt(
    before,
    manifests,
  )

  if (missingEntries.length > 0) {
    io.stderr(
      `[gen-docs] ERROR: these manifests have no matching bullet in llms.txt\n` +
        `(expected a line starting with "- <name> —" — placement goes under the\n` +
        `package list section that matches the package's category — "core",\n` +
        `"fundamentals", "tools", "ui-system", "internals", or "zero"):\n` +
        missingEntries.map((n) => `  - ${n}`).join('\n') +
        `\n\nAdd the bullet by hand first (form: \`- <name> — <any text>\`, the\n` +
        `generator will then regenerate the tail), then re-run gen-docs.`,
    )
    return io.exit(1)
  }

  if (before !== after) {
    if (check) {
      io.stderr('[gen-docs] llms.txt is out of sync with manifests.\n')
      io.stderr(formatLineDiff(before, after))
      io.stderr('\nFix: run `bun run gen-docs` and commit the result.')
      return io.exit(1)
    }
    writeFileSync(llmsTxtPath, after)
    io.stdout(
      `[gen-docs] llms.txt: ${changedLines} line${changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else if (!check) {
    io.stdout(`[gen-docs] llms.txt: no changes (already in sync)`)
  }
}

// Re-export for test convenience — keeps a single import origin for
// consumers that don't care about the physical split between
// @pyreon/manifest (pure helpers) and this file (orchestration).
export {
  findManifests,
  formatLineDiff,
  type LoadedManifest,
  type PackageManifest,
  renderLlmsTxtLine,
} from '../packages/internals/manifest/src'
