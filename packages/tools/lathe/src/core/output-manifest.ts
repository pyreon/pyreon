/**
 * The emitted-path manifest: which files the LAST run wrote.
 *
 * Generated output is a function of the spec, so when a tag disappears from
 * the spec its `endpoints/<tag>.ts` should disappear from the output. Without a
 * record of what was generated there is no safe way to know which files those
 * are -- the output directory can hold hand-written files too, and deleting by
 * pattern is how a generator eats someone's code. So each run records exactly
 * the paths it produced, and the next run removes the difference: files it
 * wrote before and does not write now. Nothing it never wrote is ever touched.
 *
 * `lathe check` reports the same difference as stale, which is the half that
 * matters in CI: an orphaned `queries/old-tag.ts` still compiles and still
 * exports hooks for endpoints the server no longer serves.
 */

import type { GeneratedFile } from '../emit/writer'

/** Written into the output directory alongside the generated files. */
export const OUTPUT_MANIFEST = 'lathe-manifest.json'

const FORMAT = 1

/** Render the manifest for this run's files. Sorted, so it is byte-stable. */
export function emitOutputManifest(paths: readonly string[]): GeneratedFile {
  const files = [...new Set(paths)].filter((p) => p !== OUTPUT_MANIFEST).sort()
  return {
    path: OUTPUT_MANIFEST,
    contents: `${JSON.stringify({ format: FORMAT, generator: '@pyreon/lathe', files }, null, 2)}\n`,
  }
}

/**
 * Files the previous run generated that this run did not.
 *
 * Deliberately conservative: an absent, unparseable or foreign manifest yields
 * NOTHING to remove, and every entry must be a plain relative path inside the
 * output directory. The manifest is a file in the user's repo; a hand-edited or
 * hostile one must not be able to delete `../src/main.ts`.
 */
export function orphanedPaths(previous: string | undefined, current: readonly string[]): string[] {
  if (previous === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(previous)
  } catch {
    return []
  }
  const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  if (record?.format !== FORMAT || record.generator !== '@pyreon/lathe' || !Array.isArray(record.files)) {
    return []
  }
  const now = new Set(current)
  return record.files
    .filter((p): p is string => typeof p === 'string' && isSafeRelative(p))
    .filter((p) => p !== OUTPUT_MANIFEST && !now.has(p))
    .sort()
}

/** A relative path that cannot leave the directory it is joined to. */
function isSafeRelative(p: string): boolean {
  if (p.length === 0 || p.startsWith('/') || p.includes('\\') || /^[A-Za-z]:/.test(p)) return false
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}
