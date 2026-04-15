/**
 * gen-docs core — orchestration logic for the manifest → docs pipeline.
 *
 * Pure rendering (manifest → line, manifest → section) lives in
 * `@pyreon/manifest` along with filesystem walking (`findManifests`).
 * This file owns the orchestration step: given a file's contents + a
 * set of manifests, compute the regenerated contents. Also owns the
 * `main()` entry point that the CLI wraps, with injectable I/O so
 * tests can run in-process without `spawnSync` overhead.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  findManifests,
  formatLineDiff,
  type LoadedManifest,
  type PackageManifest,
  renderApiReferenceBlock,
  renderLlmsFullSection,
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
 * Replace per-package sections in `llms-full.txt` with content
 * regenerated from the manifests. A section starts at
 * `^## <name> — ` and runs until the next `^## ` header or
 * end-of-file. The render already terminates with one newline; we
 * add a blank line separator to match the hand-written file's shape.
 *
 * Manifests without a matching section are reported in
 * `missingEntries` so callers can treat them as hard errors.
 *
 * @example
 * ```ts
 * import { regenerateLlmsFullTxt } from './gen-docs-core'
 *
 * const before = readFileSync('llms-full.txt', 'utf8')
 * const { contents, missingEntries } = regenerateLlmsFullTxt(before, manifests)
 * if (missingEntries.length > 0) throw new Error(`missing: ${missingEntries.join(', ')}`)
 * ```
 */
export function regenerateLlmsFullTxt(
  contents: string,
  manifests: LoadedManifest[],
): RegenerateResult {
  let next = contents
  let changedLines = 0
  const missingEntries: string[] = []
  for (const { manifest } of manifests) {
    const sectionRange = findSectionRange(next, manifest.name)
    if (!sectionRange) {
      missingEntries.push(manifest.name)
      continue
    }
    const [start, end] = sectionRange
    const prev = next
    // `renderLlmsFullSection` output ends with one `\n`. We replace the
    // exclusive range [start, end).
    //
    // The existing file shape separates sections with a blank line
    // (body ends `\n`, next line is `## next` — producing `...\n\n##
    // next`). Original [start, end) covers body up to but not
    // including `## next`, so it includes the intermediate `\n`
    // separator. Append that `\n` ONLY when the section wasn't last
    // in file — at EOF there's no separator to preserve.
    const hadNextHeader = end < next.length
    const replacement = renderLlmsFullSection(manifest) + (hadNextHeader ? '\n' : '')
    next = next.slice(0, start) + replacement + next.slice(end)
    // Count one per SECTION modified, not per line — matches the
    // stdout message "N sections regenerated".
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines, missingEntries }
}

/**
 * Find the character range `[start, end)` of a per-package section in
 * `llms-full.txt`. Returns null if the section doesn't exist. A
 * section starts at the line beginning `## <name> — ` and runs until
 * the next `^## ` header or end-of-file.
 *
 * Implementation note: a sentinel `'\n'` is logically prepended to the
 * content so we can search for `\n## <name> —` uniformly whether the
 * header is at file offset 0 or elsewhere. The returned indices are
 * adjusted back to the original content's coordinate space. This
 * collapses what was previously a forked control flow (offset-0 vs
 * anywhere-else) into a single search.
 */
function findSectionRange(content: string, name: string): [number, number] | null {
  const sentinel = '\n' + content
  const headerPattern = `\n## ${name} —`
  const headerIdx = sentinel.indexOf(headerPattern)
  if (headerIdx === -1) return null
  // Sentinel→original coordinate conversion: the `##` byte sits at
  // sentinel position `headerIdx + 1`, which maps to original
  // position `headerIdx + 1 - 1 = headerIdx`. Same trick for the
  // next-header lookup — the `##` byte of the NEXT header sits at
  // original position `nextHeaderIdx` in sentinel-space, which is
  // already the correct exclusive upper bound in original-space.
  const sectionStart = headerIdx
  const nextHeaderIdx = sentinel.indexOf('\n## ', headerIdx + 1)
  const sectionEnd = nextHeaderIdx === -1 ? content.length : nextHeaderIdx
  return [sectionStart, sectionEnd]
}

/**
 * Replace per-package regions in `packages/tools/mcp/src/api-reference.ts`
 * with content regenerated from each manifest's `api[]`. A region is
 * delimited by matching marker comments inside the exported
 * `API_REFERENCE` record literal:
 *
 * ```ts
 *   // <gen-docs:api-reference:start @pyreon/flow>
 *   'flow/createFlow': { ... },
 *   'flow/useFlow': { ... },
 *   // <gen-docs:api-reference:end @pyreon/flow>
 * ```
 *
 * The generator rewrites the block BETWEEN the markers (exclusive of
 * the marker lines themselves). The start-marker line, end-marker
 * line, and leading / trailing blank lines adjacent to the block are
 * preserved verbatim so the surrounding hand-written entries stay
 * stable.
 *
 * This file is opt-in per package — manifests whose package does not
 * have a region pair are simply skipped (NOT reported as missing). A
 * package can be migrated incrementally: land the markers + flip one
 * package at a time, the other packages continue to live as
 * hand-written literals in the same file.
 *
 * @example
 * ```ts
 * import { regenerateApiReferenceTs } from './gen-docs-core'
 *
 * const before = readFileSync('packages/tools/mcp/src/api-reference.ts', 'utf8')
 * const { contents, changedLines } = regenerateApiReferenceTs(before, manifests)
 * ```
 */
export function regenerateApiReferenceTs(
  contents: string,
  manifests: LoadedManifest[],
): RegenerateResult {
  let next = contents
  let changedLines = 0
  for (const { manifest } of manifests) {
    const range = findApiReferenceRegion(next, manifest.name)
    if (!range) {
      // Opt-in: a package without markers stays hand-written. No
      // `missingEntries` push — this mirrors the explicit decision
      // to migrate the MCP surface one package at a time.
      continue
    }
    const [start, end] = range
    const prev = next
    const block = renderApiReferenceBlock(manifest)
    // `block` has no leading / trailing newlines — we splice it
    // between `\n` boundaries so the marker lines stay on their own
    // lines.
    const replacement = block.length > 0 ? `\n${block}\n` : '\n'
    next = next.slice(0, start) + replacement + next.slice(end)
    if (prev !== next) changedLines++
  }
  return { contents: next, changedLines, missingEntries: [] }
}

/**
 * Locate the `[start, end)` byte range BETWEEN the start and end
 * markers for `name` inside an api-reference.ts source. `start` points
 * at the byte AFTER the start-marker's trailing newline; `end` points
 * at the byte OF the end-marker's indentation. Returns null if either
 * marker is absent or mis-paired (start but no matching end).
 *
 * Using the literal package name (with `@pyreon/` scope) in the
 * marker keeps search / replace tooling honest — the marker text
 * appears verbatim in exactly one place.
 */
function findApiReferenceRegion(content: string, name: string): [number, number] | null {
  const startMarker = `// <gen-docs:api-reference:start ${name}>`
  const endMarker = `// <gen-docs:api-reference:end ${name}>`
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return null
  const endIdx = content.indexOf(endMarker, startIdx + startMarker.length)
  if (endIdx === -1) return null
  // `start` = first byte after the start-marker line's trailing `\n`.
  const afterStartLine = content.indexOf('\n', startIdx)
  if (afterStartLine === -1) return null
  // `end` = start of the end-marker line (including its leading
  // indentation). Walk back from endIdx to the last `\n` + 1 so the
  // marker line itself is preserved.
  const endLineStart = content.lastIndexOf('\n', endIdx) + 1
  const rangeStart = afterStartLine + 1
  if (rangeStart > endLineStart) return null
  return [rangeStart, endLineStart]
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
 * Regenerates both `llms.txt` (one-line bullets) and `llms-full.txt`
 * (per-package sections) from the same manifest set.
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

  // ─── llms.txt ─────────────────────────────────────────────────────────
  const llmsTxtPath = join(repoRoot, 'llms.txt')
  const llmsBefore = readFileSync(llmsTxtPath, 'utf8')
  const llmsResult = regenerateLlmsTxt(llmsBefore, manifests)

  if (llmsResult.missingEntries.length > 0) {
    io.stderr(buildMissingEntriesError('llms.txt', llmsResult.missingEntries))
    return io.exit(1)
  }

  // ─── llms-full.txt ────────────────────────────────────────────────────
  const llmsFullPath = join(repoRoot, 'llms-full.txt')
  const llmsFullBefore = readFileSync(llmsFullPath, 'utf8')
  const llmsFullResult = regenerateLlmsFullTxt(llmsFullBefore, manifests)

  if (llmsFullResult.missingEntries.length > 0) {
    io.stderr(buildMissingEntriesError('llms-full.txt', llmsFullResult.missingEntries))
    return io.exit(1)
  }

  // ─── packages/tools/mcp/src/api-reference.ts ──────────────────────────
  const apiRefPath = join(repoRoot, 'packages/tools/mcp/src/api-reference.ts')
  const apiRefBefore = readFileSync(apiRefPath, 'utf8')
  const apiRefResult = regenerateApiReferenceTs(apiRefBefore, manifests)
  // Note: regenerateApiReferenceTs never emits missingEntries — MCP
  // migration is opt-in per package, so a manifest without markers
  // stays hand-written silently.

  // ─── Apply or check ───────────────────────────────────────────────────
  const llmsChanged = llmsBefore !== llmsResult.contents
  const llmsFullChanged = llmsFullBefore !== llmsFullResult.contents
  const apiRefChanged = apiRefBefore !== apiRefResult.contents

  if (check) {
    if (llmsChanged || llmsFullChanged || apiRefChanged) {
      io.stderr('[gen-docs] generated docs are out of sync with manifests.\n')
      if (llmsChanged) {
        io.stderr('\n--- llms.txt ---')
        io.stderr(formatLineDiff(llmsBefore, llmsResult.contents))
      }
      if (llmsFullChanged) {
        io.stderr('\n--- llms-full.txt ---')
        io.stderr(formatLineDiff(llmsFullBefore, llmsFullResult.contents))
      }
      if (apiRefChanged) {
        io.stderr('\n--- packages/tools/mcp/src/api-reference.ts ---')
        io.stderr(formatLineDiff(apiRefBefore, apiRefResult.contents))
      }
      io.stderr('\nFix: run `bun run gen-docs` and commit the result.')
      return io.exit(1)
    }
    return
  }

  if (llmsChanged) {
    writeFileSync(llmsTxtPath, llmsResult.contents)
    io.stdout(
      `[gen-docs] llms.txt: ${llmsResult.changedLines} line${llmsResult.changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else {
    io.stdout('[gen-docs] llms.txt: no changes (already in sync)')
  }

  if (llmsFullChanged) {
    writeFileSync(llmsFullPath, llmsFullResult.contents)
    io.stdout(
      `[gen-docs] llms-full.txt: ${llmsFullResult.changedLines} section${llmsFullResult.changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else {
    io.stdout('[gen-docs] llms-full.txt: no changes (already in sync)')
  }

  if (apiRefChanged) {
    writeFileSync(apiRefPath, apiRefResult.contents)
    io.stdout(
      `[gen-docs] api-reference.ts: ${apiRefResult.changedLines} region${apiRefResult.changedLines === 1 ? '' : 's'} regenerated`,
    )
  } else {
    io.stdout('[gen-docs] api-reference.ts: no changes (already in sync)')
  }
}

function buildMissingEntriesError(fileLabel: string, names: string[]): string {
  const placementHint =
    fileLabel === 'llms.txt'
      ? 'bullet (form: `- <name> — <any text>`) under the package list section that matches the package\'s category'
      : 'section (form: `## <name> — <title>` followed by a code block) at an appropriate location'
  return (
    `[gen-docs] ERROR: these manifests have no matching ${fileLabel} entry\n` +
    `(valid category sections: "core", "fundamentals", "tools", "ui-system",\n` +
    `"internals", "zero"):\n` +
    names.map((n) => `  - ${n}`).join('\n') +
    `\n\nAdd the ${placementHint} by hand first — the generator will\n` +
    `then regenerate the body — and re-run gen-docs.`
  )
}

// Re-export for test convenience.
export {
  findManifests,
  formatLineDiff,
  type LoadedManifest,
  type PackageManifest,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '../packages/internals/manifest/src'
