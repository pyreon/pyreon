/**
 * Lightweight template engine for create-zero. No external dependency — a
 * single-pass `{{var}}` placeholder substitution plus a recursive
 * directory-copy helper that runs every copied file through the
 * substitution.
 *
 * ## Why in-house
 *
 * Handlebars / EJS / Mustache would each add a runtime dep to a CLI that
 * exists to scaffold OTHER projects. The substitution we need is purely
 * `{{var}}` → string lookup; there are no conditionals, no loops, no
 * partial includes. A 40-line implementation in source beats a third-party
 * dependency on the build path.
 *
 * ## Placeholder syntax
 *
 * - `{{varName}}` — replaced with `vars.varName`. Unknown keys are kept
 *   verbatim (so a JS template literal like `\${count}` in a `.tsx` source
 *   file isn't accidentally rewritten).
 * - Placeholders only match `[a-zA-Z0-9_]+` between the braces — keeps the
 *   matcher tight; no accidental match on `{{x.y}}` (no nested lookup
 *   support — flat vars only).
 *
 * ## File-copy semantics
 *
 * `copyOverlay(srcDir, dstDir, vars)`:
 *   - Recursively copies every file from `srcDir` to `dstDir`.
 *   - For each file, applies `substitute()` to the content before writing.
 *   - Directories that don't exist in `dstDir` are created.
 *   - Files already in `dstDir` are OVERWRITTEN — this is the contract
 *     overlays rely on (a feature overlay can replace a base-template
 *     file).
 *   - Binary files (image extensions) are copied verbatim without
 *     substitution to avoid corrupting them.
 */

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\}\}/g

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tar',
  '.pdf',
])

/**
 * Substitute every `{{varName}}` placeholder in `source` with the matching
 * `vars[varName]`. Unknown keys are kept verbatim so user-source template
 * literals (e.g. `${count}` in a `.tsx` file) aren't disturbed.
 */
export function substitute(source: string, vars: Record<string, string>): string {
  return source.replace(PLACEHOLDER, (full, key: string) => {
    const value = vars[key]
    return value === undefined ? full : value
  })
}

function isBinary(path: string): boolean {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx === -1) return false
  return BINARY_EXTENSIONS.has(path.slice(dotIdx).toLowerCase())
}

export interface CopyOverlayOptions {
  /**
   * Skip top-level directories whose name starts with an underscore (e.g.
   * `_ai/`, `_adapters/`, `_features/`). These are convention-namespaced
   * sub-overlays that the scaffolder copies explicitly per selection;
   * including them in the default base copy would dump every overlay
   * variant on disk. Default: `false`.
   */
  skipUnderscoreDirs?: boolean
}

/**
 * Recursively copy `srcDir` into `dstDir`, applying `{{var}}` substitution
 * to every text file along the way. Binary files (by extension) are copied
 * verbatim. Existing files at the destination are overwritten — overlays
 * rely on this to replace base-template files when a feature is selected.
 *
 * Returns `false` if `srcDir` does not exist (no-op).
 */
export async function copyOverlay(
  srcDir: string,
  dstDir: string,
  vars: Record<string, string> = {},
  options: CopyOverlayOptions = {},
): Promise<boolean> {
  if (!existsSync(srcDir)) return false
  await walkAndCopy(srcDir, dstDir, vars, options, true)
  return true
}

async function walkAndCopy(
  srcDir: string,
  dstDir: string,
  vars: Record<string, string>,
  options: CopyOverlayOptions,
  isTopLevel: boolean,
): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name)
    const dstPath = join(dstDir, entry.name)
    if (entry.isDirectory()) {
      // Convention: at the TOP LEVEL of a base copy, skip `_<name>/` dirs
      // — they're namespace-prefixed sub-overlays copied via explicit
      // calls. Nested `_<name>/` dirs (deeper than top level) are passed
      // through verbatim — the convention is only at the entry point.
      if (
        isTopLevel &&
        options.skipUnderscoreDirs &&
        entry.name.startsWith('_')
      ) {
        continue
      }
      await mkdir(dstPath, { recursive: true })
      await walkAndCopy(srcPath, dstPath, vars, options, false)
      continue
    }
    /* v8 ignore next — defensive: source tree is files+dirs only, no symlinks */
    if (!entry.isFile()) continue
    await mkdir(dirname(dstPath), { recursive: true })
    /* v8 ignore next 4 — binary copy path; templates ship only text files */
    if (isBinary(srcPath)) {
      await copyFile(srcPath, dstPath)
      continue
    }
    const raw = await readFile(srcPath, 'utf8')
    await writeFile(dstPath, substitute(raw, vars))
  }
}

/**
 * Walk a directory tree and return relative paths of every file. Used by
 * snapshot tests to enumerate the generated output deterministically.
 */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    /* v8 ignore next — defensive: caller controls root, never passes non-existent */
    if (!existsSync(dir)) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      /* v8 ignore next — files-or-dirs only; templates carry no symlinks */
      else if (entry.isFile()) out.push(relative(root, full))
    }
  }
  await walk(root)
  out.sort()
  return out
}

/**
 * Stat-checks helper — kept here next to the overlay code that uses it.
 */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}
