/**
 * Third-party plugins named on the command line: `--plugins schemas,./my-plugin.ts`
 * or `--plugins schemas,lathe-plugin-msw`.
 *
 * A config file imports its plugins itself, so the module system resolves them
 * against the config's location. A CLI name has no importing module, so it is
 * resolved here the same way -- a path against the working directory, a bare
 * specifier through `node_modules` from the working directory upward, honouring
 * a package's `exports` with the `import` condition -- and then imported.
 *
 * Kept out of `run.ts` (which stays free of `node:fs` and `import()`): the bin
 * hands `run` an `importModule` that uses these; a test hands it a map.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Conditions tried, in order, when a package's `exports` has several. */
const CONDITIONS = ['import', 'node', 'default'] as const

/** A path (`./x.ts`, `/abs/x.js`, `C:\x.js`), as opposed to a package name. */
export function isPathSpecifier(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../') || spec === '.' || isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)
}

/**
 * The absolute file a specifier names, resolved from `cwd`. Throws with the
 * reason when it cannot be found.
 */
export function resolveModuleSpecifier(spec: string, cwd: string): string {
  if (isPathSpecifier(spec)) {
    const full = resolve(cwd, spec)
    if (!existsSync(full)) throw new Error(`no file at ${full}`)
    return full
  }
  const { name, subpath } = splitBare(spec)
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const pkgDir = join(dir, 'node_modules', name)
    const manifest = join(pkgDir, 'package.json')
    if (existsSync(manifest)) return entryOf(pkgDir, manifest, subpath, spec)
    if (dirname(dir) === dir) break
  }
  throw new Error(`no package \`${name}\` in any node_modules from ${cwd} upward`)
}

/** `@scope/pkg/sub` -> `{ name: '@scope/pkg', subpath: './sub' }`. */
function splitBare(spec: string): { name: string; subpath: string } {
  const parts = spec.split('/')
  const count = spec.startsWith('@') ? 2 : 1
  const name = parts.slice(0, count).join('/')
  const rest = parts.slice(count).join('/')
  return { name, subpath: rest ? `./${rest}` : '.' }
}

function entryOf(pkgDir: string, manifest: string, subpath: string, spec: string): string {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
    exports?: unknown
    module?: string
    main?: string
  }
  if (pkg.exports !== undefined) {
    const target = exportTarget(pkg.exports, subpath)
    if (target === undefined) throw new Error(`\`${spec}\` is not exported by its package.json \`exports\``)
    return join(pkgDir, target)
  }
  if (subpath !== '.') return withExtension(join(pkgDir, subpath))
  return withExtension(join(pkgDir, pkg.module ?? pkg.main ?? 'index.js'))
}

/** A subpath's target in an `exports` field, under {@link CONDITIONS}. */
function exportTarget(exports: unknown, subpath: string): string | undefined {
  const isSubpathMap =
    exports !== null && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some((k) => k.startsWith('.'))
  if (!isSubpathMap) return subpath === '.' ? conditional(exports) : undefined
  const map = exports as Record<string, unknown>
  if (subpath in map) return conditional(map[subpath])
  // One `*` pattern per key, as Node allows.
  for (const [key, value] of Object.entries(map)) {
    const star = key.indexOf('*')
    if (star === -1) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= prefix.length + suffix.length) {
      const match = subpath.slice(prefix.length, subpath.length - suffix.length)
      return conditional(value)?.replace(/\*/g, match)
    }
  }
  return undefined
}

function conditional(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = conditional(v)
      if (t !== undefined) return t
    }
    return undefined
  }
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const c of CONDITIONS) if (c in o) return conditional(o[c])
  }
  return undefined
}

function withExtension(path: string): string {
  if (existsSync(path) && statSync(path).isFile()) return path
  for (const ext of ['.js', '.mjs', '/index.js']) if (existsSync(path + ext)) return path + ext
  return path
}

/** Import a specifier the way {@link resolveModuleSpecifier} resolves it. */
export async function importFromCwd(spec: string, cwd: string): Promise<unknown> {
  return import(pathToFileURL(resolveModuleSpecifier(spec, cwd)).href)
}
