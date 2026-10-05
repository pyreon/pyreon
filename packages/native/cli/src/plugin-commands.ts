// `pyreon-native plugins` and `pyreon-native explain` — pure renderers over the
// compiler's service registry, so the output is unit-testable without a spawn.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  BUILT_IN_PLUGINS,
  createCompiler,
  parsePyreon,
  renderKotlinService,
  verifyServiceTypes,
  type NativeCompiler,
  type ServiceTypeFinding,
} from '@pyreon/native-compiler'
import { discoverPlugins, listPluginPackages, type DiscoveredPlugin } from './discover-plugins'
import { resolveNativeSources } from './native-sources'

export interface CommandReport {
  readonly lines: string[]
  readonly exitCode: number
}

function readSources(dirs: readonly string[], extension: '.swift' | '.kt'): string[] {
  const texts: string[] = []
  const walk = (path: string): void => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) walk(join(path, entry))
    } else if (path.endsWith(extension)) texts.push(readFileSync(path, 'utf8'))
  }
  for (const dir of dirs) walk(dir)
  return texts
}

/** Verify one discovered plugin's services against its package's OWN native dirs. */
export function verifyDiscovered(appDir: string, found: DiscoveredPlugin): ServiceTypeFinding[] {
  const own = resolveNativeSources(appDir, { include: (name) => name === found.package })
  return verifyServiceTypes(found.plugin, {
    swiftSources: readSources(
      own.swift.filter((s) => s.package === found.package).map((s) => s.dir),
      '.swift',
    ),
    kotlinSources: readSources(
      own.kotlin.filter((s) => s.package === found.package).map((s) => s.dir),
      '.kt',
    ),
  })
}

/**
 * `plugins [--verify]`: built-in plugins, the service registry with each
 * hook's owner, and every package-declared plugin. Loads every declared plugin
 * (a listing has no `--source` to be lazy against).
 */
export async function pluginsReport(appDir: string, verify: boolean): Promise<CommandReport> {
  const lines: string[] = []
  let discovered: DiscoveredPlugin[]
  let compiler: ReturnType<typeof createCompiler>
  try {
    discovered = await discoverPlugins(appDir)
    compiler = createCompiler({ discovered: discovered.map((d) => d.plugin) })
  } catch (error) {
    return {
      lines: [`[pyreon-native] ${error instanceof Error ? error.message : String(error)}`],
      exitCode: 2,
    }
  }
  const replaced = new Set(discovered.map((d) => d.plugin.name))
  lines.push('built-in plugins:')
  for (const plugin of BUILT_IN_PLUGINS) {
    lines.push(`  ${plugin.name}${replaced.has(plugin.name) ? '  (replaced by a discovered plugin)' : ''}`)
  }
  lines.push(`services (${compiler.services.size}):`)
  for (const [hook, { owner }] of [...compiler.services].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  ${hook}  ${owner}`)
  }
  lines.push(`discovered plugins (${discovered.length}):`)
  for (const found of discovered) {
    const services = Object.keys(found.plugin.services ?? {})
    lines.push(
      `  ${found.plugin.name}  ${found.package}${found.version ? `@${found.version}` : ''}  services: ${services.length > 0 ? services.join(', ') : '-'}`,
    )
  }
  const undeclared = listPluginPackages(appDir).length - discovered.length
  if (undeclared !== 0) lines.push(`  (${undeclared} declared plugin(s) not loaded)`)
  let exitCode = 0
  if (verify) {
    const findings = discovered.flatMap((d) => verifyDiscovered(appDir, d).map((f) => ({ d, f })))
    if (findings.length === 0) lines.push('verify: every service type is declared in its package sources')
    for (const { d, f } of findings) {
      lines.push(`verify: ${d.package} [${f.target}] ${f.message}`)
    }
    if (findings.length > 0) exitCode = 2
  }
  return { lines, exitCode }
}

const HOOK_CALL = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g

/**
 * `explain <file>`: for each plain service the parser lowered, the hook, its
 * owning plugin, and the declaration both targets emit — plus whether that
 * declaration really appears in the emit.
 */
export function explainReport(
  source: string,
  filename: string,
  compiler: Pick<NativeCompiler, 'transform' | 'services'>,
  root: string = process.cwd(),
): CommandReport {
  const lines: string[] = [relative(root, filename) || filename]
  let swiftEmit: string
  let kotlinEmit: string
  const decls: { name: string; hook: string }[] = []
  try {
    for (const component of parsePyreon(source, filename).components) {
      for (const decl of component.decls) {
        if (decl.kind === 'service') decls.push({ name: decl.name, hook: decl.hook })
      }
    }
    swiftEmit = compiler.transform(source, { target: 'swift', filename }).code
    kotlinEmit = compiler.transform(source, { target: 'kotlin', filename }).code
  } catch (error) {
    return {
      lines: [...lines, `  error: ${error instanceof Error ? error.message : String(error)}`],
      exitCode: 2,
    }
  }
  const lowered = new Set<string>()
  for (const { name, hook } of decls) {
    lowered.add(hook)
    const entry = compiler.services.get(hook)
    if (entry === undefined) {
      lines.push(`  ${name} = ${hook}()  [no service registered — parser/registry disagree]`)
      continue
    }
    const swift = `@State private var ${name} = ${entry.descriptor.swift}`
    const kotlin = renderKotlinService(entry.descriptor, name)
    lines.push(`  ${name} = ${hook}()  [owner: ${entry.owner}]`)
    lines.push(`    swift:  ${swift}  (${swiftEmit.includes(swift) ? 'emitted' : 'NOT in emit'})`)
    const status = kotlinEmit.includes(kotlin) ? 'emitted' : 'NOT in emit'
    const kotlinLines = kotlin.split('\n').map((line) => line.replace(/^ {2}/, ''))
    kotlinLines.forEach((line, i) => {
      const prefix = i === 0 ? '    kotlin: ' : '            '
      lines.push(`${prefix}${line}${i === kotlinLines.length - 1 ? `  (${status})` : ''}`)
    })
  }
  const called = new Set([...source.matchAll(HOOK_CALL)].map((m) => m[1]!))
  for (const hook of [...called].sort()) {
    if (compiler.services.has(hook) && !lowered.has(hook)) {
      lines.push(`  ${hook}() is registered but was not lowered as a service declaration in this file`)
    }
  }
  if (decls.length === 0 && lines.length === 1) lines.push('  no service hooks found')
  return { lines, exitCode: 0 }
}
