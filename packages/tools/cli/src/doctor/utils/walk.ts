/**
 * Shared source-file walker for the per-file scanning gates
 * (react-patterns, pyreon-patterns).
 *
 * The walker skips the standard non-source dirs (`node_modules`,
 * `dist`, `lib`, `.git`, etc.) and matches `.ts` / `.tsx` / `.js` /
 * `.jsx`. It's a thin wrapper around the original `collectSourceFiles`
 * that lived in `doctor.ts` pre-PR-2; extracted here so any gate can
 * use it without import-cycling through the doctor module.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

const SOURCE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js'])
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'lib',
  '.pyreon',
  '.git',
  '.next',
  'build',
])

const shouldSkipDirEntry = (entry: fs.Dirent): boolean => {
  if (!entry.isDirectory()) return false
  return entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)
}

const walk = (dir: string, results: string[]): void => {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (shouldSkipDirEntry(entry)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, results)
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      results.push(fullPath)
    }
  }
}

export const collectSourceFiles = (cwd: string): string[] => {
  const results: string[] = []
  walk(cwd, results)
  return results
}
