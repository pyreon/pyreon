import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Pyreon workspace alias map — every `@pyreon/*` package AND every subpath it
 * exports, resolved to the TypeScript source under the `bun` condition.
 *
 * ── Why this is derived, not listed ──────────────────────────────────────
 *
 * This used to be two hand-maintained arrays: one of package names, one of
 * subpaths. Both drifted, silently and in the direction that hurts — an
 * unlisted subpath does not fail to resolve, it resolves to the PARENT package
 * and then appends the rest of the specifier, so `@pyreon/reactivity/coverage`
 * became `…/reactivity/src/index.ts/coverage` and surfaced as a baffling
 * `ENOTDIR: not a directory`.
 *
 * An audit at the time of writing found **93** exported subpaths absent from
 * the list, including `@pyreon/reactivity/coverage`, `@pyreon/sync/yjs`,
 * `@pyreon/validate/mini`, every `@pyreon/testing/*` helper, and most of
 * `@pyreon/zero`. Any test importing one of those could not run at all — which
 * is a quiet ceiling on what the repo is able to test, not a cosmetic gap.
 *
 * Deriving from each package's own `exports` map removes the drift surface
 * entirely: a new package or subpath is aliased the moment it is exported,
 * with no second place to remember. `packages/internals/vitest-config` is the
 * only consumer of this ordering contract, and `aliases.test.ts` locks it.
 */

export type AliasEntry = { find: string | RegExp; replacement: string }

/** The `exports` value shapes we understand: a string, or a conditions object. */
type ExportsValue = string | { [condition: string]: ExportsValue } | undefined

/**
 * Resolve one exports entry to a source path.
 *
 * `bun` first — that is the condition the workspace resolves under, and the
 * one that points at `src`. `import`/`default` are the fallbacks, and they
 * usually point at `lib`, which is filtered out below.
 */
function resolveTarget(value: ExportsValue): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  for (const condition of ['bun', 'import', 'default'] as const) {
    const resolved = resolveTarget(value[condition])
    if (resolved) return resolved
  }
  return undefined
}

/** Only TS sources are aliasable — `.json` presets and built `lib/` are not. */
function isSource(target: string): boolean {
  return target.endsWith('.ts') || target.endsWith('.tsx')
}

interface Discovered {
  /** `@pyreon/core` */
  name: string
  /** `@pyreon/core/jsx-runtime` — absent for the root entry */
  subpath?: string
  /** absolute path to the source file */
  file: string
}

function readPackage(dir: string): Discovered[] {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) return []
  let parsed: { name?: string; exports?: Record<string, ExportsValue>; main?: string }
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  } catch {
    return [] // a malformed manifest is not this module's problem to report
  }
  const name = parsed.name
  if (!name?.startsWith('@pyreon/')) return []

  const out: Discovered[] = []
  const entries = Object.entries(parsed.exports ?? {})
  for (const [key, value] of entries) {
    // Wildcards cannot become a static alias, and `./package.json` is not code.
    if (key === './package.json' || key.includes('*')) continue
    const target = resolveTarget(value)
    if (!target || !isSource(target)) continue
    const file = resolve(dir, target)
    if (!existsSync(file)) continue
    out.push(key === '.' ? { name, file } : { name, subpath: `${name}${key.slice(1)}`, file })
  }

  // A package with no `exports` map still resolves via the bun condition in
  // its `bun` field or a conventional `src/index.ts`.
  if (!out.some((e) => e.subpath === undefined)) {
    const fallback = resolve(dir, 'src/index.ts')
    if (existsSync(fallback)) out.push({ name, file: fallback })
  }
  return out
}

/**
 * Build the alias array. `repoRoot` is the absolute path to the monorepo root.
 * The root is a parameter (not a module-load-time constant) so the package
 * works under both the workspace `bun` condition (loaded from src) and future
 * build artifacts (loaded from lib) without a build-time path bake.
 */
export function buildAliases(repoRoot: string): AliasEntry[] {
  const packagesDir = resolve(repoRoot, 'packages')
  const found: Discovered[] = []

  if (existsSync(packagesDir)) {
    for (const category of readdirSync(packagesDir)) {
      const categoryDir = join(packagesDir, category)
      if (!statSync(categoryDir).isDirectory()) continue
      for (const pkg of readdirSync(categoryDir)) {
        const pkgDir = join(categoryDir, pkg)
        if (!statSync(pkgDir).isDirectory()) continue
        found.push(...readPackage(pkgDir))
      }
    }
  }

  // ORDERING IS LOAD-BEARING. Vite resolves aliases in array order, first match
  // wins, and `@pyreon/core` is a prefix of `@pyreon/core/jsx-runtime`. Sorting
  // by descending specifier length puts every subpath ahead of its parent
  // without needing two separate lists to stay in the right order by hand.
  const subpaths = found
    .filter((e) => e.subpath !== undefined)
    .sort((a, b) => b.subpath!.length - a.subpath!.length)
  const roots = found.filter((e) => e.subpath === undefined).sort((a, b) => b.name.length - a.name.length)

  return [
    ...subpaths.map((e) => ({ find: e.subpath!, replacement: e.file })),
    ...roots.map((e) => ({ find: e.name, replacement: e.file })),
  ]
}
