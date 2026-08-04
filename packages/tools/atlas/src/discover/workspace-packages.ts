/**
 * Where a WORKSPACE package's source entry lives.
 *
 * ── Why this is not the thing I refused to do ─────────────────────────────
 *
 * `resolve-types` deliberately does not follow bare specifiers into
 * `node_modules`: that needs the real module-resolution algorithm, and guessing
 * at it produces confident wrong answers.
 *
 * A WORKSPACE package is a different question with an exact answer. The
 * workspace already declares where its packages are (`workspaces` globs, or
 * `pnpm-workspace.yaml`), each one declares its own `name`, and matching the
 * two is a lookup rather than an algorithm. `@acme/ui-grid` → `packages/ui-grid`
 * is not a guess.
 *
 * This matters because it is where the contracts live. Measured on a real
 * 78-package monorepo: components import their props from sibling packages
 * (`import type { Props } from '@acme/ui-core'`), and refusing those left most
 * components in the catalog with no controls at all — found, but contract-less,
 * which is the least useful thing a catalog can be.
 *
 * ── Entry resolution ──────────────────────────────────────────────────────
 *
 * The SOURCE entry, not the built one. A workspace package points `exports` at
 * `./src/index.ts` in every repo that develops in TypeScript, and a `dist/`
 * build is both stale and stripped of the types this needs. `main`/`module` are
 * read only as a fallback, and a plain `src/index.ts` as the last one.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** package name → absolute directory. */
export type PackageMap = ReadonlyMap<string, string>

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Pull a source-ish path out of an `exports` field.
 *
 * Handles the shapes a workspace actually writes: a bare string, a conditions
 * object, and a subpath map with `"."`. Prefers the conditions that point at
 * source (`types`, `import`, `default`) — `require` is usually the built copy.
 */
export function entryFromExports(exports: unknown): string | undefined {
  if (typeof exports === 'string') return exports
  if (typeof exports !== 'object' || exports === null) return undefined
  const record = exports as Record<string, unknown>
  // A subpath map: only the root export can stand for "the package".
  const root = record['.'] !== undefined ? record['.'] : record
  if (typeof root === 'string') return root
  if (typeof root !== 'object' || root === null) return undefined
  const conditions = root as Record<string, unknown>
  for (const key of ['types', 'bun', 'import', 'default']) {
    const value = conditions[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

/** The file a workspace package's root export points at, if it resolves. */
export function packageEntry(dir: string): string | undefined {
  const pkg = readJson(join(dir, 'package.json'))
  if (!pkg) return undefined

  const candidates = [
    entryFromExports(pkg.exports),
    typeof pkg.module === 'string' ? pkg.module : undefined,
    typeof pkg.main === 'string' ? pkg.main : undefined,
    'src/index.ts',
    'src/index.tsx',
    'index.ts',
  ].filter((c): c is string => typeof c === 'string')

  for (const candidate of candidates) {
    const path = join(dir, candidate.replace(/^\.\//, ''))
    if (existsSync(path)) return path
    // A built entry (`dist/index.js`) usually has a source twin worth
    // preferring — the built copy is stale and stripped of types.
    const asSource = path.replace(/\.js$/, '.ts')
    if (asSource !== path && existsSync(asSource)) return asSource
  }
  return undefined
}

/**
 * Build the name → directory map for a workspace.
 *
 * Takes already-expanded directories rather than doing its own globbing, so
 * there is ONE owner of "where are this workspace's packages" — the same
 * expansion `detectProjects` uses. Two answers to that question is how a
 * monorepo tool starts disagreeing with itself.
 */
export function buildPackageMap(dirs: readonly string[]): PackageMap {
  const map = new Map<string, string>()
  for (const dir of dirs) {
    const pkg = readJson(join(dir, 'package.json'))
    const name = pkg?.name
    // FIRST wins. A duplicate package name is a broken workspace, and picking
    // the later one silently would make resolution depend on glob order.
    if (typeof name === 'string' && name.length > 0 && !map.has(name)) map.set(name, dir)
  }
  return map
}

/**
 * Resolve a bare specifier to a file, using the workspace map.
 *
 * Supports the root import (`@acme/ui`) and a subpath (`@acme/ui/types`), which
 * is resolved relative to the package directory — the common convention in a
 * source-linked workspace. Anything not in the map returns undefined: a real
 * third-party dependency stays unresolved, on purpose.
 */
export function resolveWorkspaceSpecifier(
  specifier: string,
  packages: PackageMap,
): string | undefined {
  if (specifier.startsWith('.')) return undefined

  const direct = packages.get(specifier)
  if (direct) return packageEntry(direct)

  // `@acme/ui/types` — find the longest package name that prefixes it, so
  // `@acme/ui-grid` is never matched by a lookup for `@acme/ui`.
  let best: { name: string; dir: string } | undefined
  for (const [name, dir] of packages) {
    if (!specifier.startsWith(`${name}/`)) continue
    if (!best || name.length > best.name.length) best = { name, dir }
  }
  if (!best) return undefined

  const subpath = specifier.slice(best.name.length + 1)
  for (const extension of ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx']) {
    const candidate = join(best.dir, `${subpath}${extension}`)
    if (existsSync(candidate)) return candidate
    const inSrc = join(best.dir, 'src', `${subpath}${extension}`)
    if (existsSync(inSrc)) return inSrc
  }
  return undefined
}
