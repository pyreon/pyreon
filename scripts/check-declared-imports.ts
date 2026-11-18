#!/usr/bin/env bun
/**
 * check-declared-imports: every bare import a published entry reaches must be declared.
 *
 * For each published package, for each `exports` subpath, take the built file a consumer's bundler or Node loads (the `import`
 * condition, else `default`; never the `bun` source condition), follow its STATIC relative imports through the package's own
 * `lib/` chunks, and collect every bare specifier it reaches. Each one must be in `dependencies`, in a NON-optional
 * `peerDependencies`, a Node builtin, or the package's own name. A package listed as an OPTIONAL peer (or `optionalDependencies`)
 * may be imported statically only by a NON-ROOT subpath (`@pyreon/testing/store` needs `@pyreon/store`; a consumer who never
 * imports that subpath never needs it) or through a dynamic `import()`. The ROOT entry (`.`) must not statically import one:
 * a static import of a package the consumer did not install crashes on load. This is the packed-tarball failure that `@pyreon/ambient` shipped: `@pyreon/core` was an optional peer, yet the
 * built chunk imported it unconditionally, so `import '@pyreon/ambient'` threw ERR_MODULE_NOT_FOUND in a project without core.
 *
 * Static analysis of `lib/` only: no install, no network. A package whose `lib/` is not built is skipped (and counted).
 *
 * Run: bun scripts/check-declared-imports.ts [--json]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'

export interface PackageJson {
  name: string
  private?: boolean
  exports?: unknown
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

export interface Offender {
  pkg: string
  subpath: string
  file: string
  specifier: string
  reason: string
}

/**
 * Dynamic imports of modules the USER supplies, deliberately not declared anywhere: the component loads them inside a try/catch
 * and renders nothing when they are missing. Each entry needs a reason; adding one is a decision, not a workaround.
 */
export const USER_SUPPLIED: Record<string, Record<string, string>> = {
  '@pyreon/zero-content': {
    katex: 'the math renderer is loaded on demand inside a try/catch; apps that use <Math> install it',
    mermaid: 'the diagram renderer is loaded on demand inside a try/catch; apps that use <Mermaid> install it',
  },
}

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]))

/** The package name of a bare specifier (`@scope/pkg/sub` -> `@scope/pkg`, `pkg/sub` -> `pkg`). */
export function packageOf(specifier: string): string {
  const parts = specifier.split('/')

  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string)
}

/** The built file each `exports` subpath loads: `import`, else `default`; type and source conditions are not code a consumer runs. */
export function entryFiles(exportsField: unknown): Array<{ subpath: string; file: string }> {
  const out: Array<{ subpath: string; file: string }> = []
  const pick = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value
    if (typeof value !== 'object' || value === null) return undefined
    const rec = value as Record<string, unknown>

    return pick(rec.import) ?? pick(rec.default) ?? pick(rec.node)
  }

  if (typeof exportsField === 'string') return [{ subpath: '.', file: exportsField }]
  if (typeof exportsField !== 'object' || exportsField === null) return out
  const rec = exportsField as Record<string, unknown>
  const subpaths = Object.keys(rec).some((k) => k.startsWith('.')) ? rec : { '.': rec }

  for (const [subpath, value] of Object.entries(subpaths)) {
    const file = pick(value)

    if (file !== undefined && /\.m?js$/.test(file)) out.push({ subpath, file })
  }

  return out
}

/** Static and dynamic specifiers in built code, read from the AST (comments and strings never count). */
export function specifiersOf(code: string, filename = 'chunk.js'): { statics: string[]; dynamics: string[] } {
  const { module } = parseSync(filename, code, { sourceType: 'module' })
  const statics: string[] = []
  const dynamics: string[] = []

  for (const i of module.staticImports) statics.push(i.moduleRequest.value)
  for (const e of module.staticExports) for (const entry of e.entries) if (entry.moduleRequest) statics.push(entry.moduleRequest.value)
  for (const d of module.dynamicImports) {
    const text = code.slice(d.moduleRequest.start, d.moduleRequest.end).trim()

    if (/^(["'`])[^"'`$]*\1$/.test(text)) dynamics.push(text.slice(1, -1))
  }

  return { statics, dynamics }
}

interface Declared {
  pkg: PackageJson
  required: Set<string>
  optional: Set<string>
}

function declaredOf(pkg: PackageJson): Declared {
  const required = new Set(Object.keys(pkg.dependencies ?? {}))
  const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}))

  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    if (pkg.peerDependenciesMeta?.[name]?.optional === true) optional.add(name)
    else required.add(name)
  }

  return { pkg, required, optional }
}

/** Why a bare specifier reached by `subpath` is a problem, or `undefined` when it is fine. */
function problemWith(specifier: string, subpath: string, dynamic: boolean, declared: Declared): string | undefined {
  const name = packageOf(specifier)

  if (BUILTINS.has(specifier) || BUILTINS.has(name) || name === declared.pkg.name || declared.required.has(name)) return undefined
  if (declared.optional.has(name)) {
    return dynamic || subpath !== '.'
      ? undefined
      : `${name} is an OPTIONAL peer but the root entry imports it statically (the import throws when it is not installed): make it a required peer, move the import behind a subpath, or load it with a dynamic import()`
  }
  if (dynamic && USER_SUPPLIED[declared.pkg.name]?.[name] !== undefined) return undefined

  return `${name} is not in dependencies or peerDependencies`
}

/** Every undeclared (or wrongly static) bare specifier reached by the entries of one package. */
export function undeclaredImports(pkgDir: string, pkg: PackageJson): { offenders: Offender[]; built: boolean } {
  const declared = declaredOf(pkg)
  const offenders: Offender[] = []
  let built = false

  for (const { subpath, file } of entryFiles(pkg.exports)) {
    const start = resolve(pkgDir, file)

    if (!existsSync(start)) continue
    built = true
    const seen = new Set<string>()
    const queue = [start]

    while (queue.length > 0) {
      const current = queue.pop() as string

      if (seen.has(current)) continue
      seen.add(current)
      const { statics, dynamics } = specifiersOf(readFileSync(current, 'utf8'), current)
      const where = current.slice(pkgDir.length + 1)

      for (const s of statics) {
        if (!s.startsWith('.')) {
          const reason = problemWith(s, subpath, false, declared)

          if (reason !== undefined) offenders.push({ pkg: pkg.name, subpath, file: where, specifier: s, reason })
        } else if (existsSync(resolve(dirname(current), s))) queue.push(resolve(dirname(current), s))
      }
      for (const s of dynamics.filter((d) => !d.startsWith('.'))) {
        const reason = problemWith(s, subpath, true, declared)

        if (reason !== undefined) offenders.push({ pkg: pkg.name, subpath, file: where, specifier: s, reason })
      }
    }
  }

  return { offenders, built }
}

function packageDirs(root: string): string[] {
  const out: string[] = []

  for (const category of readdirSync(join(root, 'packages'))) {
    const dir = join(root, 'packages', category)

    if (!existsSync(join(dir)) || !readdirSync(dir).length) continue
    for (const name of readdirSync(dir)) {
      if (existsSync(join(dir, name, 'package.json'))) out.push(join(dir, name))
    }
  }

  return out
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const all: Offender[] = []
  let skipped = 0
  let checked = 0

  for (const dir of packageDirs(root)) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson

    if (pkg.private === true || pkg.exports === undefined) continue
    const { offenders, built } = undeclaredImports(dir, pkg)

    if (built) checked++
    else skipped++
    all.push(...offenders)
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checked, skipped, offenders: all }, null, 2))
  } else if (all.length === 0) {
    console.log(`✓ every bare import reached by a published entry is declared (${checked} packages checked, ${skipped} not built and skipped)`)
  } else {
    console.error(`✗ ${all.length} undeclared or wrongly static import(s) in published entries:\n`)
    for (const o of all) console.error(`  ${o.pkg} (${o.subpath}) ${o.file}: "${o.specifier}"\n    ${o.reason}`)
    console.error('\nA consumer installs only what the package declares: an undeclared import crashes on load in a clean project.')
  }
  process.exit(all.length === 0 ? 0 : 1)
}
