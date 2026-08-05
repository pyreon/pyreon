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
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workspacePackageDirs } from './workspace'

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
export function entryFromExports(exports: unknown, want: EntryKind = 'types'): string | undefined {
  if (typeof exports === 'string') return exports
  if (typeof exports !== 'object' || exports === null) return undefined
  const record = exports as Record<string, unknown>
  // A subpath map: only the root export can stand for "the package".
  const root = record['.'] !== undefined ? record['.'] : record
  if (typeof root === 'string') return root
  if (typeof root !== 'object' || root === null) return undefined
  const conditions = root as Record<string, unknown>
  for (const key of CONDITION_ORDER[want]) {
    const value = conditions[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

/**
 * What the caller intends to do with the entry — and therefore which export
 * condition is the right answer.
 *
 * Not a detail: the two orders disagree, and picking the wrong one fails in a
 * way that reads like a missing file. Reading a package's `types` first is
 * right for prop-type resolution (it is the condition guaranteed to carry the
 * contract) and wrong for loading, where it lands on `index.d.ts` — a
 * declaration file whose relative imports point at chunks that do not exist.
 */
export type EntryKind = 'types' | 'runtime'

const CONDITION_ORDER: Record<EntryKind, readonly string[]> = {
  types: ['types', 'bun', 'import', 'default'],
  // `bun` first for the same reason the loader prepends it: it points at
  // source, which is the copy the host runtime already holds.
  runtime: ['bun', 'import', 'module', 'default', 'require'],
}

/** The file a workspace package's root export points at, if it resolves. */
export function packageEntry(dir: string, want: EntryKind = 'types'): string | undefined {
  const pkg = readJson(join(dir, 'package.json'))
  if (!pkg) return undefined

  const candidates = [
    entryFromExports(pkg.exports, want),
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
    if (isFile(candidate)) return candidate
    const inSrc = join(best.dir, 'src', `${subpath}${extension}`)
    if (isFile(inSrc)) return inSrc
  }
  return undefined
}

/**
 * Exists AND is a file.
 *
 * The bare-`''` probe above runs first, so a plain `existsSync` matched a
 * DIRECTORY whenever a package ships both — `src/ui.ts` next to `src/ui/` is
 * the normal shape for a barrel with an implementation folder, and Atlas's own
 * `@pyreon/atlas/ui` is exactly it. The bundler then reported
 * `UNLOADABLE_DEPENDENCY: Could not load .../src/ui`, which reads as a broken
 * package rather than a resolver that stopped one candidate too early.
 */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a specifier as if it were imported from one of the workspace's own
 * packages.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * A package manager links a dependency only into the packages that DECLARE it.
 * The repo ROOT usually declares almost nothing — a linter, a CLI — so a file
 * that lives at the root can import almost nothing.
 *
 * `atlas.config.ts` lives at the root. It is also the file where a project is
 * told to export a `wrapper`, which has to build a vnode, which means importing
 * `@pyreon/core`. Measured on a real 78-package monorepo: neither the project's
 * own theme package nor `@pyreon/core` resolved from it, so the one file that
 * unlocks rocketstyle discovery and provider-wrapped mounting could not be
 * written at all.
 *
 * ── Why this is a lookup and not a guess ──────────────────────────────────
 *
 * It does not invent a resolution algorithm — it runs Node's real one, from a
 * base that legitimately declares the dependency. "Resolve as a package that
 * depends on this would" is an exact question with an exact answer.
 *
 * Bases are sorted so the answer never depends on directory-walk order, and the
 * FIRST resolution wins. Packages in a workspace overwhelmingly share one copy
 * of a given dependency; where they genuinely disagree, a stable pick beats an
 * arbitrary one, and the config can always import by path instead.
 */
export function resolveFromWorkspace(
  specifier: string,
  dirs: readonly string[],
): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return undefined
  // Package name and subpath. A scoped name keeps two segments.
  const segments = specifier.split('/')
  const name = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
  if (!name) return undefined
  const subpath = specifier.slice(name.length + 1)

  for (const dir of [...dirs].sort()) {
    // Walk up from the package looking for the link. `node_modules` may sit at
    // the package, at the workspace root, or anywhere between.
    let current = dir
    for (;;) {
      const candidate = join(current, 'node_modules', name)
      if (existsSync(candidate)) {
        // Read the exports map rather than asking `createRequire` to resolve.
        // `require.resolve` applies the `require` condition, and a modern
        // ESM-only package (`@pyreon/core` among them) publishes only
        // `import`/`types`, so it fails with ERR_PACKAGE_PATH_NOT_EXPORTED for a
        // package that is present and perfectly importable.
        const entry =
          subpath === ''
            ? packageEntry(candidate, 'runtime')
            : subpathEntry(candidate, subpath, 'runtime')
        // The REAL path, not the symlink.
        //
        // An isolated install (bun, pnpm) links `packages/app/node_modules/
        // @pyreon/core` at a content-addressed store directory, and that
        // package's own dependencies sit as SIBLINGS inside the store — not
        // under the link. Handing back the link means the resolver walks up
        // from `packages/app/…` instead, never reaches the store, and the
        // module's transitive imports fail with `Cannot find module
        // '@pyreon/reactivity' imported from …/@pyreon/core/lib/index.js`.
        //
        // Invisible in a hoisted layout and invisible when the tool runs from
        // the same workspace as its target — it took installing the published
        // package into a separate consumer workspace to see it at all.
        // The REAL path, not the symlink. An isolated install (bun, pnpm)
        // links a dependency at a content-addressed store, and that package's
        // OWN dependencies sit as SIBLINGS inside the store — hand back the
        // link and the resolver walks up from the consuming package instead,
        // so transitive imports fail with `Cannot find module
        // '@pyreon/reactivity' imported from …/@pyreon/core/lib/index.js`.
        if (entry) {
          try {
            return realpathSync(entry)
          } catch {
            return entry
          }
        }
      }
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }
  return undefined
}

/**
 * A Vite/Rolldown plugin that resolves bare specifiers against the workspace.
 *
 * Exists because two places need the identical behaviour — the module loader
 * (so a root `atlas.config.ts` can import anything) and the static build (so the
 * generated entry, which lives in `node_modules/.atlas-build/`, can resolve the
 * framework). Writing it twice is how the two come to disagree.
 *
 * `enforce: 'pre'` so it answers before ordinary resolution walks up to a repo
 * root that declares nothing. Returns undefined for anything the workspace does
 * not own, so a real third-party dependency resolves normally.
 */
export function workspaceResolvePlugin(root: string, extraBases: readonly string[] = []) {
  const dirs = [...workspaceDirsFor(root), ...extraBases]
  return {
    name: 'atlas:workspace-resolve-build',
    // POST, emphatically not `pre`. A resolver that answers FIRST wins even
    // when ordinary resolution would have succeeded, and then hands back a
    // symlinked `node_modules` path while Vite resolving the same specifier
    // itself reaches the package's real location. Two ids for one file loads
    // the framework TWICE, and the workbench dies with
    // `props.model.view.set(...) is not a function`.
    //
    // Running last makes this a genuine fallback: Rollup stops at the first
    // non-null answer, so this is consulted only for specifiers nothing else
    // could resolve — which is exactly the case it exists for.
    enforce: 'post' as const,
    resolveId(id: string, importer?: string): string | undefined {
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return undefined
      // ONLY for Atlas's own generated modules.
      //
      // This is the hard-won part. A blanket resolver looks like the obvious
      // fix and breaks the workbench: the id it returns is a symlinked
      // `node_modules` path, while Vite resolving the same specifier itself
      // arrives at the package's real location. Two ids for one file means the
      // framework is loaded TWICE, and the workbench dies with
      // `props.model.view.set(...) is not a function` — a reactivity break from
      // a split instance. `realpathSync` does not save it either: on macOS it
      // rewrites `/tmp` to `/private/tmp` and produces the same divergence from
      // the other side. The axe-audit e2e caught both attempts.
      //
      // So: claim nothing a project file imports. Atlas's generated entry and
      // its virtual catalog are the only modules that genuinely cannot resolve
      // on their own — they live in `node_modules/.atlas-build/` or nowhere at
      // all — and they are the only ones this answers for.
      if (!isAtlasGenerated(importer)) return undefined
      const found = resolveFromWorkspace(id, dirs)
      if (found) return found

      // `@pyreon/atlas` itself — the one specifier the `node_modules` walk
      // above structurally CANNOT answer.
      //
      // A package manager never links a package inside its own `node_modules`,
      // and nothing above it links it either unless some project declares it.
      // So the generated entry — which is Atlas's UI code, and therefore
      // imports `@pyreon/atlas/ui` — resolved every framework package (those
      // sit in Atlas's own `node_modules`) and died on the workbench itself:
      //
      //   Rolldown failed to resolve import "@pyreon/atlas/ui"
      //     from ".../node_modules/.atlas-build/entry.js"
      //
      // The effect was that `atlas build` only worked against a project that
      // happened to declare `@pyreon/atlas` as a dependency. A component
      // library never does — the workbench is a tool you point AT it — so the
      // monorepo case this build exists for failed on every real package.
      //
      // Resolving by the workspace's own package MAP rather than by walking
      // `node_modules` is the same lookup-not-a-guess argument this file is
      // built on: the workspace declares where its packages live, and Atlas's
      // own directory is known from this module's location.
      return resolveWorkspaceSpecifier(id, buildPackageMap(dirs))
    },
  }
}

/**
 * A module Atlas owns, and therefore may answer resolution for.
 *
 * Three kinds: its virtual modules, its generated build input, and the
 * project's `atlas.config.*` — which is Atlas's file in every sense that
 * matters here. The config carries the `wrapper`, so the static build pulls it
 * into the bundle, and it sits at the repo ROOT where ordinary resolution finds
 * nothing.
 */
function isAtlasGenerated(importer: string | undefined): boolean {
  if (!importer) return false
  return (
    importer.startsWith('\0') ||
    importer.includes('virtual:atlas') ||
    importer.includes('.atlas-build') ||
    /[/\\](?:atlas|pyreon)\.config\.[cm]?[jt]sx?$/.test(importer)
  )
}

/**
 * Package directories for a workspace root, plus the root itself.
 *
 * The root is included as a resolution base because a single-package project
 * keeps its dependencies there, and a monorepo root occasionally does too.
 */
function workspaceDirsFor(root: string): string[] {
  // Atlas's OWN directory is a base too, and it is the one that matters for the
  // generated entry: that entry is Atlas's UI code, so it imports the framework
  // — and in a consumer install NO project package declares `@pyreon/runtime-dom`,
  // only Atlas does. Without this the build failed with `Rolldown failed to
  // resolve import "@pyreon/runtime-dom"` on an ordinary installed project.
  //
  // Last in the order, so a package the PROJECT declares always wins: if both
  // hold a copy they should be the same one, and preferring the project's keeps
  // it that way when they are not.
  const own = atlasOwnDir()
  return [...workspacePackageDirs(root), root, ...(own ? [own] : [])]
}

/**
 * The directory of Atlas's own package — the nearest ancestor with a
 * `package.json`.
 *
 * Derived from this module's location rather than passed in, because every
 * caller would otherwise have to know it and they would eventually disagree.
 * Works from `src/` in development and from `lib/_chunks/` once bundled.
 */
function atlasOwnDir(): string | undefined {
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (;;) {
      if (existsSync(join(dir, 'package.json'))) return dir
      const parent = dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  } catch {
    return undefined
  }
}


/** A package subpath (`@scope/pkg/sub`), via its exports map or on disk. */
function subpathEntry(dir: string, subpath: string, want: EntryKind): string | undefined {
  const pkg = readJson(join(dir, 'package.json'))
  const exports = pkg?.exports
  if (typeof exports === 'object' && exports !== null) {
    const declared = (exports as Record<string, unknown>)[`./${subpath}`]
    const target = entryFromExports(declared, want)
    if (target) {
      const path = join(dir, target.replace(/^\.\//, ''))
      if (existsSync(path)) return path
    }
  }
  for (const extension of ['', '.js', '.mjs', '.ts', '/index.js', '/index.ts']) {
    const path = join(dir, `${subpath}${extension}`)
    if (existsSync(path)) return path
  }
  return undefined
}
