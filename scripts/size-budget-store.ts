/**
 * size-budget-store — where size ceilings live, and the only code that reads
 * or writes them.
 *
 * One file per owner under `scripts/size-budgets/`:
 *
 *   packages/<name>.json   { "package": "@pyreon/core", "bundle": 8232,
 *                            "imports": { "jsx": 683 } }
 *   apps/<example>.json    { "app": "ssr-showcase", "routes": { "/": 56950 } }
 *
 * `bundle` is the package's main-entry ceiling (`check-bundle-budgets`),
 * `imports` its minimal-import scenarios (`check-import-budgets`, id
 * `<package>::<scenario>`), `routes` an example's first-load JS per route
 * (`check-route-budgets`, id `<example>:<route>`). All values are gzipped
 * bytes.
 *
 * Per owner, because the three former shared tables put every package on
 * adjacent lines of one file: two pull requests that each touched a different
 * package's number conflicted, and a conflicting pull request gets no CI. Two
 * changes to different packages now touch different files.
 *
 * No Bun API, so tests can import it.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Ceilings {
  bundle: Record<string, number>
  imports: Record<string, number>
  routes: Record<string, number>
}

interface PackageFile {
  package: string
  bundle?: number
  imports?: Record<string, number>
}

interface AppFile {
  app: string
  routes: Record<string, number>
}

/** `<repoRoot>/scripts/size-budgets`. */
export function sizeBudgetsDir(repoRoot: string): string {
  return join(repoRoot, 'scripts', 'size-budgets')
}

/** `--budgets-dir=` (tests point the gates at a controlled directory) or the repo's. */
export function resolveBudgetsDir(args: readonly string[], repoRoot: string): string {
  const flag = args.find((a) => a.startsWith('--budgets-dir='))
  return flag ? flag.slice('--budgets-dir='.length) : sizeBudgetsDir(repoRoot)
}

/** `@pyreon/core` → `core.json`; any other scope keeps it: `@acme/x` → `acme__x.json`. */
export function packageFileName(pkg: string): string {
  const pyreon = /^@pyreon\/(.+)$/.exec(pkg)
  if (pyreon) return `${pyreon[1]}.json`
  return `${pkg.replace(/^@/, '').replaceAll('/', '__')}.json`
}

/** The file that holds an id's ceiling, relative to the budgets directory. */
export function ceilingFile(family: keyof Ceilings, id: string): string {
  if (family === 'routes') return join('apps', `${splitRouteId(id).app}.json`)
  const pkg = family === 'imports' ? splitImportId(id).pkg : id
  return join('packages', packageFileName(pkg))
}

function splitImportId(id: string): { pkg: string; scenario: string } {
  const at = id.indexOf('::')
  if (at < 0) throw new Error(`[Pyreon] size budgets: "${id}" is not a <package>::<scenario> id.`)
  return { pkg: id.slice(0, at), scenario: id.slice(at + 2) }
}

function splitRouteId(id: string): { app: string; route: string } {
  const at = id.indexOf(':')
  if (at < 0) throw new Error(`[Pyreon] size budgets: "${id}" is not an <example>:<route> id.`)
  return { app: id.slice(0, at), route: id.slice(at + 1) }
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    throw new Error(
      `[Pyreon] size budgets: ${file} is not valid JSON (${err instanceof Error ? err.message : String(err)}). Fix or regenerate it with --update.`,
    )
  }
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f))
}

const isBytes = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Every ceiling under `dir`. A directory that does not exist reads as empty:
 * that is the state of a base commit from before the per-owner layout.
 */
export function loadCeilings(dir: string): Ceilings {
  const out: Ceilings = { bundle: {}, imports: {}, routes: {} }
  for (const file of jsonFiles(join(dir, 'packages'))) {
    const data = readJson<Partial<PackageFile>>(file)
    if (typeof data.package !== 'string') {
      throw new Error(`[Pyreon] size budgets: ${file} has no "package" name. Add it.`)
    }
    if (data.package in out.bundle || Object.keys(out.imports).some((k) => k.startsWith(`${data.package}::`))) {
      throw new Error(`[Pyreon] size budgets: ${data.package} is declared twice; ${file} is the second. Keep one file per package.`)
    }
    if (data.bundle !== undefined) {
      if (!isBytes(data.bundle)) throw new Error(`[Pyreon] size budgets: "bundle" in ${file} must be a byte count.`)
      out.bundle[data.package] = data.bundle
    }
    for (const [scenario, value] of Object.entries(data.imports ?? {})) {
      if (!isBytes(value)) throw new Error(`[Pyreon] size budgets: imports.${scenario} in ${file} must be a byte count.`)
      out.imports[`${data.package}::${scenario}`] = value
    }
  }
  for (const file of jsonFiles(join(dir, 'apps'))) {
    const data = readJson<Partial<AppFile>>(file)
    if (typeof data.app !== 'string') {
      throw new Error(`[Pyreon] size budgets: ${file} has no "app" name. Add it.`)
    }
    for (const [route, value] of Object.entries(data.routes ?? {})) {
      if (!isBytes(value)) throw new Error(`[Pyreon] size budgets: routes["${route}"] in ${file} must be a byte count.`)
      out.routes[`${data.app}:${route}`] = value
    }
  }
  return out
}

const sorted = (record: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

function write(file: string, data: PackageFile | AppFile): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

/**
 * Sets one ceiling, leaving every other value and every other file untouched.
 * Returns the path written, relative to `dir`.
 */
export function writeCeiling(dir: string, family: keyof Ceilings, id: string, value: number): string {
  const rel = ceilingFile(family, id)
  const file = join(dir, rel)
  if (family === 'routes') {
    const { app, route } = splitRouteId(id)
    const prev = existsSync(file) ? readJson<Partial<AppFile>>(file) : {}
    write(file, { app, routes: sorted({ ...prev.routes, [route]: value }) })
    return rel
  }
  const pkg = family === 'imports' ? splitImportId(id).pkg : id
  const prev = existsSync(file) ? readJson<Partial<PackageFile>>(file) : {}
  const bundle = family === 'bundle' ? value : prev.bundle
  const imports =
    family === 'imports' ? { ...prev.imports, [splitImportId(id).scenario]: value } : prev.imports
  write(file, {
    package: pkg,
    ...(bundle === undefined ? {} : { bundle }),
    ...(imports === undefined || Object.keys(imports).length === 0 ? {} : { imports: sorted(imports) }),
  })
  return rel
}
