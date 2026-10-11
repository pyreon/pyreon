/** Source dependencies of package-owned lowering, usable before bun install. */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isBuiltin } from 'node:module'

// Node-based tests import the classifier without executing this Bun-only scan.
// Keep its small runtime contract local, as with check-import-budgets.ts.
declare const Bun: {
  resolveSync(path: string, from: string): string
  Transpiler: new (options: { loader: 'ts' | 'tsx' }) => {
    transformSync(source: string): string
    scan(source: string): { imports: { path: string }[] }
  }
}

type JsonObject = Record<string, unknown>
interface Workspace {
  root: string
  manifest: JsonObject
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined
}

/** Match Bun's runtime export conditions in declaration order, without lib/. */
function runtimeTarget(value: unknown): string | undefined {
  if (value === null) throw new Error('blocked native plugin export')
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = runtimeTarget(item)
      if (target) return target
    }
  }
  for (const [condition, target] of Object.entries(object(value) ?? {})) {
    if (['bun', 'node-addons', 'node', 'import', 'default'].includes(condition)) {
      const selected = runtimeTarget(target)
      if (selected) return selected
    }
  }
  return undefined
}

function containsTarget(value: unknown, target: string): boolean {
  if (value === target) return true
  if (Array.isArray(value)) return value.some((item) => containsTarget(item, target))
  return Object.values(object(value) ?? {}).some((item) => containsTarget(item, target))
}

function exportTarget(exports: unknown, subpath: string): string | undefined {
  const entries = object(exports)
  if (!entries || !Object.keys(entries).some((key) => key.startsWith('.')))
    return subpath === '.' ? runtimeTarget(exports) : undefined
  if (subpath in entries) return runtimeTarget(entries[subpath])
  const patterns = Object.keys(entries)
    .filter((key) => key.includes('*'))
    .sort((a, b) => {
      return b.indexOf('*') - a.indexOf('*') || b.length - a.length
    })
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split('*') as [string, string]
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue
    const target = runtimeTarget(entries[pattern])
    if (target)
      return target.replaceAll('*', subpath.slice(prefix.length, subpath.length - suffix.length))
    throw new Error('unresolved native plugin export: ' + subpath)
  }
  return undefined
}

export interface PluginSurface {
  files: Set<string>
  /** Manifest paths make the owner set observable in regression tests. */
  owners: string[]
}

/**
 * Follow runtime imports from the declared plugin export's Bun source entry.
 * Do not load plugins: they need built packages and may execute arbitrary code.
 * Any unreadable/unresolvable source throws; the caller must run every lane.
 */
export function deriveNativePluginSurface(repoRoot: string): PluginSurface {
  const files = new Set<string>()
  const owners: string[] = []
  const workspaces = new Map<string, Workspace>()
  const pending: string[] = []
  const repoPath = (path: string): string => {
    const rel = relative(repoRoot, resolve(repoRoot, path)).replaceAll('\\', '/')
    if (rel === '..' || rel.startsWith('../')) throw new Error('source escapes checkout: ' + path)
    return rel
  }
  for (const category of readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })) {
    if (!category.isDirectory()) continue
    for (const pkg of readdirSync(join(repoRoot, 'packages', category.name), {
      withFileTypes: true,
    })) {
      if (!pkg.isDirectory()) continue
      const root = 'packages/' + category.name + '/' + pkg.name
      const manifest = object(
        JSON.parse(readFileSync(join(repoRoot, root, 'package.json'), 'utf8')),
      )
      if (!manifest || typeof manifest.name !== 'string')
        throw new Error('invalid manifest: ' + root)
      if (workspaces.has(manifest.name)) throw new Error('duplicate workspace: ' + manifest.name)
      workspaces.set(manifest.name, { root, manifest })
      const native = object(object(manifest.pyreon)?.native)
      if (native?.plugin === undefined) continue
      if (typeof native.plugin !== 'string') throw new Error('invalid native plugin: ' + root)
      const exports = object(manifest.exports)
      const entry = Object.values(exports ?? {}).find((candidate) =>
        containsTarget(candidate, native.plugin as string),
      )
      const source = runtimeTarget(entry)
      if (!source?.startsWith('./src/'))
        throw new Error('native plugin has no source export: ' + root)
      owners.push(root + '/package.json')
      files.add(root + '/package.json')
      pending.push(repoPath(join(root, source)))
    }
  }
  if (owners.length === 0) throw new Error('no native plugin owners found')

  const readSource = (path: string): { path: string; source: string } => {
    // Let the pinned runtime own extension substitution and directory resolution.
    // This only resolves a path; it never imports or executes the dependency.
    const resolved = repoPath(Bun.resolveSync(join(repoRoot, path), repoRoot))
    return { path: resolved, source: readFileSync(join(repoRoot, resolved), 'utf8') }
  }
  const scanners = {
    ts: new Bun.Transpiler({ loader: 'ts' }),
    tsx: new Bun.Transpiler({ loader: 'tsx' }),
  }
  while (pending.length) {
    const requested = pending.pop()!
    if (files.has(requested)) continue
    const { path, source } = readSource(requested)
    if (files.has(path)) continue
    files.add(path)
    const packageRoot = /^(packages\/[^/]+\/[^/]+)\//.exec(path)?.[1]
    if (packageRoot) files.add(packageRoot + '/package.json')
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue
    const scanner = path.endsWith('x') ? scanners.tsx : scanners.ts
    // scan() omits nonliteral loads. Treat them as uncertain, including template
    // paths, rather than claim their unknown dependencies are web-only. Scanning
    // normalized JS also handles comments between the callee and its argument.
    const normalized = scanner.transformSync(source)
    if (/\bimport\((?!(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')[,)])/.test(normalized))
      throw new Error('computed native plugin dependency: ' + path)
    // Bun.scan omits CommonJS require calls. This ESM workspace has none in
    // its lowering graph; an introduced require must run, not disappear.
    if (/\brequire(?:\.resolve)?\(/.test(normalized))
      throw new Error('CommonJS native plugin dependency: ' + path)
    for (const imported of scanner.scan(normalized).imports) {
      if (imported.path.startsWith('.')) {
        pending.push(repoPath(join(dirname(path), imported.path)))
        continue
      }
      const parts = imported.path.split('/')
      const name = parts[0]!.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
      const workspace = workspaces.get(name)
      if (!workspace) {
        if (isBuiltin(imported.path) || imported.path === 'bun') continue
        const owner = [...workspaces.values()].find((pkg) => path.startsWith(pkg.root + '/'))
        const declared =
          owner &&
          ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'].some(
            (field) => object(owner.manifest[field])?.[name] !== undefined,
          )
        if (name.startsWith('@pyreon/') || !declared)
          throw new Error('unknown native workspace import: ' + imported.path)
        continue // External packages are selected by the lockfile/toolchain rules.
      }
      files.add(workspace.root + '/package.json')
      const subpath = imported.path === name ? '.' : './' + imported.path.slice(name.length + 1)
      const target = exportTarget(workspace.manifest.exports, subpath)
      if (!target?.startsWith('./'))
        throw new Error('unresolved native workspace import: ' + imported.path)
      pending.push(repoPath(join(workspace.root, target)))
    }
  }
  return { files, owners: owners.sort() }
}
