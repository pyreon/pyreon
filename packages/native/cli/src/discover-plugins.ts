// Package-owned compiler plugin discovery.
//
// A library ships its native lowering knowledge as a plugin file in its OWN
// package and points at it from `package.json`:
//
//   "pyreon": { "native": { "plugin": "native/plugin.mjs", "modules": ["@acme/camera"] } }
//
// Discovery walks the app's declared dependencies with the SAME resolver the
// native-source scan uses (`findPackageDir`), and loads a plugin LAZILY: only
// when some source file under `--source` imports one of the package's
// `modules`. Activation is decided from the manifest alone — the plugin cannot
// declare its own activation set, because deciding whether to load a module by
// asking the module defeats the laziness.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertPluginShape, type CompilerPlugin } from '@pyreon/native-compiler'
import { findPackageDir, readManifest } from './native-sources'

/** A dependency that declared `pyreon.native.plugin`. */
export interface PluginPackage {
  readonly package: string
  readonly version: string | undefined
  readonly packageDir: string
  /** Absolute path of the plugin module. */
  readonly file: string
  /** Import specifiers that activate it (manifest `modules`, else the package name). */
  readonly modules: readonly string[]
}

export interface DiscoveredPlugin {
  readonly package: string
  readonly version: string | undefined
  readonly file: string
  readonly plugin: CompilerPlugin
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'])

/** Every dependency of `appDir` that declares a plugin, in declaration order. */
export function listPluginPackages(appDir: string): PluginPackage[] {
  const app = readManifest(appDir)
  if (!app) return []
  const names = [
    ...new Set([...Object.keys(app.dependencies ?? {}), ...Object.keys(app.devDependencies ?? {})]),
  ]
  const found: PluginPackage[] = []
  for (const name of names) {
    const packageDir = findPackageDir(name, appDir)
    if (!packageDir) continue
    const manifest = readManifest(packageDir)
    const declared = manifest?.pyreon?.native?.plugin
    if (declared === undefined) continue
    if (typeof declared !== 'string' || !declared) {
      throw new Error(`[Pyreon] Package "${name}" declares pyreon.native.plugin that is not a path string.`)
    }
    const modules = manifest?.pyreon?.native?.modules
    found.push({
      package: name,
      version: manifest?.version,
      packageDir,
      file: resolve(packageDir, declared),
      modules: modules !== undefined && modules.length > 0 ? modules : [name],
    })
  }
  return found
}

// Conservative on purpose: a regex over import syntax can over-activate (an
// `import` inside a comment) but never under-activate, and over-activation only
// costs loading one more plugin.
const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]/g,
]

/** Every module specifier a source text imports. */
export function collectImportSpecifiers(text: string): Set<string> {
  const specifiers = new Set<string>()
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) specifiers.add(match[1]!)
  }
  return specifiers
}

function sourceFiles(target: string): string[] {
  const out: string[] = []
  const walk = (path: string): void => {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        if (entry !== 'node_modules') walk(join(path, entry))
      }
    } else if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(path))) out.push(path)
  }
  if (existsSync(target)) walk(target)
  return out
}

/** Every module specifier imported anywhere under a file or directory. */
export function collectSourceImports(source: string): Set<string> {
  const all = new Set<string>()
  for (const file of sourceFiles(source)) {
    for (const spec of collectImportSpecifiers(readFileSync(file, 'utf8'))) all.add(spec)
  }
  return all
}

/** Whether any imported specifier is one of `modules` (exact, or a `module/` subpath). */
export function isActivated(modules: readonly string[], specifiers: ReadonlySet<string>): boolean {
  for (const spec of specifiers) {
    if (modules.some((m) => spec === m || spec.startsWith(`${m}/`))) return true
  }
  return false
}

/** Load and validate one package's plugin module; errors name the package and file. */
export async function loadPluginPackage(pkg: PluginPackage): Promise<DiscoveredPlugin> {
  const where = `package "${pkg.package}" (${pkg.file})`
  if (!existsSync(pkg.file)) {
    throw new Error(`[Pyreon] ${where} declares pyreon.native.plugin, but that file does not exist.`)
  }
  let loaded: { default?: unknown }
  try {
    loaded = (await import(pathToFileURL(pkg.file).href)) as { default?: unknown }
  } catch (cause) {
    throw new Error(
      `[Pyreon] ${where} failed to load: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
  }
  try {
    assertPluginShape(loaded.default)
  } catch (cause) {
    throw new Error(`[Pyreon] ${where}: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    })
  }
  return {
    package: pkg.package,
    version: pkg.version,
    file: pkg.file,
    plugin: loaded.default as CompilerPlugin,
  }
}

/**
 * The plugins an app needs for a source tree. With `source` omitted every
 * declared plugin loads (what `plugins` listing wants); with it, a plugin loads
 * only when the source imports one of its `modules`.
 */
export async function discoverPlugins(appDir: string, source?: string): Promise<DiscoveredPlugin[]> {
  const specifiers = source === undefined ? undefined : collectSourceImports(source)
  const out: DiscoveredPlugin[] = []
  for (const pkg of listPluginPackages(appDir)) {
    if (specifiers !== undefined && !isActivated(pkg.modules, specifiers)) continue
    out.push(await loadPluginPackage(pkg))
  }
  return out
}
