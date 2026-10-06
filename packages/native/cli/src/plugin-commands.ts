// `pyreon-native plugins` and `pyreon-native explain` — pure renderers over the
// compiler's service registry, so the output is unit-testable without a spawn.

import { readdirSync, readFileSync } from 'node:fs'
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
  // Entries carry their own type, so nothing is stat()ed and then read: a
  // check-then-use pair on a path is a race (js/file-system-race), and the
  // directory listing already says which entries are directories.
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (path.endsWith(extension)) texts.push(readFileSync(path, 'utf8'))
    }
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
  const elements = compiler.registries.elements.entries
  lines.push(`element lowerings (${elements.length}):`)
  for (const { lowering, owner } of elements) {
    lines.push(`  ${lowering.module}  ${lowering.tags.join(', ')}  ${owner}`)
  }
  lines.push(`discovered plugins (${discovered.length}):`)
  for (const found of discovered) {
    const services = Object.keys(found.plugin.services ?? {})
    lines.push(
      `  ${found.plugin.name}  ${found.package}${found.version ? `@${found.version}` : ''}  services: ${services.length > 0 ? services.join(', ') : '-'}${found.plugin.elements?.length ? `  elements: ${found.plugin.elements.flatMap((e) => e.tags).join(', ')}` : ''}`,
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

const isSpace = (ch: string | undefined): boolean =>
  ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r'

/**
 * Tags the source imports (`import { Row } from '@pyreon/coolgrid'`) as
 * `module → tags`.
 *
 * Scanned by hand rather than with one regex: `import\s*\{([^}]*)\}` rescans to
 * the end of the file from every `import {` that has no closing brace, and
 * `\s+as\s+` backtracks on whitespace runs — both quadratic on hostile input
 * (CodeQL js/polynomial-redos). Here the closing-brace search is remembered
 * (a position past the last known `}` is the only reason to search again), so
 * every character is read a bounded number of times.
 */
function importedTags(source: string): Map<string, Set<string>> {
  const imported = new Map<string, Set<string>>()
  const skipSpace = (from: number): number => {
    let i = from
    while (i < source.length && isSpace(source[i])) i++
    return i
  }
  let nextClose = -2
  let at = source.indexOf('import')
  while (at !== -1) {
    let resume = at + 'import'.length
    let i = skipSpace(resume)
    if (source.startsWith('type', i) && isSpace(source[i + 4])) i = skipSpace(i + 4)
    if (source[i] === '{') {
      if (nextClose !== -1 && nextClose < i) nextClose = source.indexOf('}', i)
      if (nextClose === -1) break
      let j = skipSpace(nextClose + 1)
      if (source.startsWith('from', j)) {
        j = skipSpace(j + 4)
        const quote = source[j]
        if (quote === '"' || quote === "'") {
          const end = source.indexOf(quote, j + 1)
          const specifier = end === -1 ? '' : source.slice(j + 1, end)
          if (specifier !== '' && !specifier.includes('\n')) {
            const tags = imported.get(specifier) ?? new Set<string>()
            for (const part of source.slice(i + 1, nextClose).split(',')) {
              // `Row as R` -> Row; an inline `type Row` modifier is skipped.
              const words = part.trim().split(/\s+/)
              const name = words[0] === 'type' && words.length > 1 && words[1] !== 'as' ? words[1] : words[0]
              if (name) tags.add(name)
            }
            imported.set(specifier, tags)
            // Like a global regex match: carry on AFTER this statement, so the
            // text inside it is never scanned a second time.
            resume = end + 1
          }
        }
      }
    }
    at = source.indexOf('import', resume)
  }
  return imported
}

/**
 * `explain <file>`: for each plain service the parser lowered, the hook, its
 * owning plugin, and the declaration both targets emit — plus whether that
 * declaration really appears in the emit. Every element a registered lowering
 * claims in the file is attributed to its owning plugin too. The file is parsed
 * against the compiler's OWN registries, so a plugin's service or element is
 * explained exactly as it is lowered.
 */
export function explainReport(
  source: string,
  filename: string,
  compiler: Pick<NativeCompiler, 'transform' | 'services' | 'registries'>,
  root: string = process.cwd(),
): CommandReport {
  const lines: string[] = [relative(root, filename) || filename]
  let swiftEmit: string
  let kotlinEmit: string
  const decls: { name: string; hook: string }[] = []
  try {
    for (const component of parsePyreon(source, filename, { registries: compiler.registries }).components) {
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
  const imports = importedTags(source)
  for (const { lowering, owner } of compiler.registries.elements.entries) {
    const used = lowering.tags.filter(
      (tag) => imports.get(lowering.module)?.has(tag) === true && new RegExp(`<${tag}[\\s/>]`).test(source),
    )
    if (used.length > 0) {
      lines.push(`  <${used.join('>, <')}> from ${lowering.module}  [element lowering, owner: ${owner}]`)
    }
  }
  const called = new Set([...source.matchAll(HOOK_CALL)].map((m) => m[1]!))
  for (const hook of [...called].sort()) {
    if (compiler.services.has(hook) && !lowered.has(hook)) {
      lines.push(`  ${hook}() is registered but was not lowered as a service declaration in this file`)
    }
  }
  if (lines.length === 1) lines.push('  no service hooks or element lowerings found')
  return { lines, exitCode: 0 }
}
