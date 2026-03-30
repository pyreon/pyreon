import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Create a filter function that returns true if a file path should be ignored.
 *
 * Loads patterns from `.pyreonlintignore` and `.gitignore` in the given directory.
 *
 * @example
 * ```ts
 * import { createIgnoreFilter } from "@pyreon/lint"
 *
 * const isIgnored = createIgnoreFilter(process.cwd())
 * if (!isIgnored("src/app.tsx")) lintFile(...)
 * ```
 */
export function createIgnoreFilter(
  cwd: string,
  extraIgnore?: string | undefined,
): (filePath: string) => boolean {
  const patterns: string[] = []
  const resolvedCwd = resolve(cwd)

  // Load .pyreonlintignore
  loadPatternsFromFile(join(resolvedCwd, '.pyreonlintignore'), patterns)

  // Load .gitignore
  loadPatternsFromFile(join(resolvedCwd, '.gitignore'), patterns)

  // Load extra ignore file if provided
  if (extraIgnore) {
    loadPatternsFromFile(resolve(extraIgnore), patterns)
  }

  // Compile patterns into matchers
  const matchers = patterns.map((p) => compileMatcher(p))

  return (filePath: string): boolean => {
    const rel = relative(resolvedCwd, resolve(filePath))
    // Normalize to forward slashes
    const normalized = rel.replace(/\\/g, '/')

    for (const matcher of matchers) {
      if (matcher(normalized)) return true
    }
    return false
  }
}

function loadPatternsFromFile(filePath: string, patterns: string[]): void {
  if (!existsSync(filePath)) return
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue
      patterns.push(trimmed)
    }
  } catch {
    // Ignore read errors
  }
}

/**
 * Compile a gitignore-style pattern into a matcher function.
 * Supports: `*` (any non-slash chars), `**` (any path segment), `?` (single char),
 * leading `/` (root-anchored), trailing `/` (directory only).
 */
function compileMatcher(pattern: string): (path: string) => boolean {
  let p = pattern
  let anchored = false

  // Negated patterns (not supported — just skip them)
  if (p.startsWith('!')) {
    return () => false
  }

  // Leading slash means anchored to root
  if (p.startsWith('/')) {
    anchored = true
    p = p.slice(1)
  }

  // Trailing slash means only match directories (we treat all paths as files, so strip it
  // and match as a prefix)
  let dirOnly = false
  if (p.endsWith('/')) {
    dirOnly = true
    p = p.slice(0, -1)
  }

  const regex = globToRegex(p)

  return (path: string): boolean => {
    if (dirOnly) {
      // Match as prefix: the pattern should match a directory portion
      if (anchored) {
        return regex.test(path) || path.startsWith(`${p}/`) || path === p
      }
      // Unanchored directory pattern — match anywhere in path
      return regex.test(path) || path.includes(`/${p}/`) || path.startsWith(`${p}/`) || path === p
    }

    if (anchored) {
      return regex.test(path)
    }

    // Unanchored pattern — try matching the full path, or just the basename
    if (regex.test(path)) return true

    // Also try matching against just the filename
    const lastSlash = path.lastIndexOf('/')
    if (lastSlash !== -1) {
      const basename = path.slice(lastSlash + 1)
      return regex.test(basename)
    }

    return false
  }
}

const GLOB_CHAR_MAP: Record<string, string> = {
  '?': '[^/]',
  '.': '\\.',
  '/': '/',
}

function handleStar(glob: string, pos: number): { pattern: string; advance: number } {
  if (glob[pos + 1] === '*') {
    if (glob[pos + 2] === '/') return { pattern: '(?:.*/)?', advance: 3 }
    return { pattern: '.*', advance: 2 }
  }
  return { pattern: '[^/]*', advance: 1 }
}

function globToRegex(glob: string): RegExp {
  let result = '^'
  let i = 0

  while (i < glob.length) {
    const ch = glob[i] as string
    if (ch === '*') {
      const star = handleStar(glob, i)
      result += star.pattern
      i += star.advance
    } else {
      result += GLOB_CHAR_MAP[ch] ?? escapeRegex(ch)
      i++
    }
  }

  result += '$'
  return new RegExp(result)
}

function escapeRegex(str: string): string {
  return str.replace(/[\\^$+{}[\]|()]/g, '\\$&')
}
