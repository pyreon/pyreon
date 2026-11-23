/**
 * The doc-claims gate's unscoped package-runner check (`npx lathe …` runs the
 * npm package named "lathe", not @pyreon/lathe): which docs pages, READMEs and
 * published source files a user copies commands from, the string/template text
 * inside source files, the narrow, reasoned allowances, and the finding.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Finding } from '../types'

/**
 * The published source a user reads commands from WITHOUT opening a docs page:
 * CLI output, error and diagnostic `fix` text, generated READMEs and scripts.
 * Only string and template-literal text is checked (see `stringLiteralText`);
 * tests, fixtures, type declarations and build output are not shipped prose.
 */
export function commandSourceFiles(repoRoot: string): string[] {
  const out: string[] = []
  const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'tests', '__tests__', 'test', 'fixtures', '__fixtures__'])
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.[cm]?[jt]sx?$/.test(entry) && !/\.(?:test|spec)\./.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
    }
  }
  const packagesDir = join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return out
  for (const group of readdirSync(packagesDir)) {
    const groupDir = join(packagesDir, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) walk(join(groupDir, pkg, 'src'))
  }

  return out
}

/**
 * `source` with everything that is NOT the text of a string or template
 * literal blanked to spaces (newlines kept, so offsets and line numbers stay
 * true). Comments and code vanish; `${…}` holes in a template are code too.
 * A small scanner rather than a parser: it only has to tell strings from
 * comments, and a regex literal containing a quote is the one shape it can
 * misread — the cost of that is a missed or extra match in that file, never a
 * crash.
 *
 * @internal — exported for tests.
 */
export function stringLiteralText(source: string): string {
  const out = source.replace(/[^\n]/g, ' ').split('')
  const keep = (i: number): void => {
    out[i] = source[i] as string
  }
  // Stack of open template literals; each entry is the `${` brace depth inside it.
  const templates: number[] = []
  let i = 0
  const n = source.length
  const readQuoted = (quote: string): void => {
    i++
    while (i < n && source[i] !== quote && source[i] !== '\n') {
      if (source[i] === '\\') {
        keep(i)
        i++
      }
      keep(i)
      i++
    }
    i++
  }
  // Reads template text from `i` until the closing backtick or a `${`.
  const readTemplateText = (): void => {
    while (i < n) {
      const c = source[i]
      if (c === '`') {
        templates.pop()
        i++
        return
      }
      if (c === '$' && source[i + 1] === '{') {
        templates[templates.length - 1] = 1
        i += 2
        return
      }
      if (c === '\\') {
        keep(i)
        i++
      }
      keep(i)
      i++
    }
  }
  while (i < n) {
    const c = source[i]
    const depth = templates.length > 0 ? (templates[templates.length - 1] as number) : -1
    if (depth === 0) {
      readTemplateText()
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (c === "'" || c === '"') {
      readQuoted(c)
      continue
    }
    if (c === '`') {
      templates.push(0)
      i++
      continue
    }
    if (depth > 0 && c === '{') templates[templates.length - 1] = depth + 1
    else if (depth > 0 && c === '}') templates[templates.length - 1] = depth - 1
    i++
  }

  return out.join('')
}

/**
 * Unscoped runner commands that are RIGHT as written, each with the reason.
 * Keyed `<repo-relative file>` → bins allowed in that file's strings. Keep it
 * narrow: an entry is a file whose text only ever runs inside a project that
 * already installs the package, so the runner resolves the local bin.
 */
export const RUNNER_COMMAND_ALLOWANCES: ReadonlyMap<string, { bins: readonly string[]; reason: string }> = new Map([
  [
    'packages/zero/create-multiplatform/src/scaffold.ts',
    {
      bins: ['pyreon-native'],
      reason:
        'the Xcode/Gradle build phases and the README it writes run inside the scaffolded app, whose package.json declares @pyreon/native-cli, so `npx pyreon-native` resolves that local bin',
    },
  ],
])

/**
 * Every bin a PUBLISHED `@pyreon/*` package ships, with the package. Read from
 * the package.json files, so a new CLI is covered the day it ships.
 */
export function pyreonBins(repoRoot: string): Map<string, string> {
  const bins = new Map<string, string>()
  const packagesDir = join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return bins
  for (const group of readdirSync(packagesDir)) {
    const groupDir = join(packagesDir, group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) {
      const manifestPath = join(groupDir, pkg, 'package.json')
      if (!existsSync(manifestPath)) continue
      let manifest: { name?: string; private?: boolean; bin?: string | Record<string, string> }
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        continue
      }
      if (manifest.private === true || !manifest.name?.startsWith('@pyreon/') || !manifest.bin) continue
      const names =
        typeof manifest.bin === 'string' ? [manifest.name.slice('@pyreon/'.length)] : Object.keys(manifest.bin)
      for (const name of names) bins.set(name, manifest.name)
    }
  }

  return bins
}

/** The pages a reader copies commands from: the docs site's content and every README. */
function commandDocFiles(repoRoot: string): string[] {
  const out: string[] = []
  const walk = (dir: string, accept: (file: string) => boolean): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'lib' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, accept)
      else if (accept(entry)) out.push(full)
    }
  }
  walk(join(repoRoot, 'docs', 'src', 'content'), (f) => /\.mdx?$/.test(f))
  walk(join(repoRoot, 'packages'), (f) => f === 'README.md')
  if (existsSync(join(repoRoot, 'README.md'))) out.push(join(repoRoot, 'README.md'))

  return out
}

/**
 * A docs page — or a user-facing string in published source (CLI output, a
 * diagnostic's fix text, a generated README) — that tells the reader to run
 * `npx atlas …` / `bunx lathe …` with the UNSCOPED name of one of our binaries. Without a local install, the
 * package runner fetches the npm package of that name, which for `atlas`,
 * `lathe`, `loom`, `zero` and others is someone else's project (`npx lathe
 * init` ran a solid modeller). The scoped form (`npx @pyreon/lathe init`)
 * runs our CLI whether or not it is installed.
 */
export function findUnscopedRunnerCommands(repoRoot: string): Finding[] {
  const bins = pyreonBins(repoRoot)
  if (bins.size === 0) return []
  const names = [...bins.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(
    String.raw`\b(npx|bunx|pnpx|pnpm dlx|yarn dlx)\s+(?:(?:-y|--yes)\s+)?(${names.join('|')})(?=$|[\s` + '`' + String.raw`'")\]])`,
    'gm',
  )
  const findings: Finding[] = []
  const sources: Array<[string, boolean]> = [
    ...commandDocFiles(repoRoot).map((f): [string, boolean] => [f, false]),
    ...commandSourceFiles(repoRoot).map((f): [string, boolean] => [f, true]),
  ]
  for (const [filePath, isSource] of sources) {
    const raw = readFileSync(filePath, 'utf8')
    const content = isSource ? stringLiteralText(raw) : raw
    const relPath = relative(repoRoot, filePath)
    const allowed = RUNNER_COMMAND_ALLOWANCES.get(relPath.split('\\').join('/'))
    for (const m of content.matchAll(re)) {
      const runner = m[1] ?? 'npx'
      const bin = m[2] ?? ''
      if (allowed?.bins.includes(bin)) continue
      const pkg = bins.get(bin) ?? `@pyreon/${bin}`
      // A line that also names the package (`… use \`bunx @pyreon/mcp\`; an
      // unscoped \`npx pyreon-mcp\` resolves another package`) is contrasting
      // the two on purpose, or saying the bin comes from the installed
      // package. Only a bare instruction is reported.
      const lineStart = content.lastIndexOf('\n', m.index) + 1
      const lineEnd = content.indexOf('\n', m.index)
      const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
      if (lineText.includes(pkg)) continue
      const line = content.slice(0, m.index).split('\n').length
      findings.push({
        category: 'documentation',
        severity: 'error',
        code: 'doc-claims/unscoped-runner-command',
        gate: 'doc-claims',
        message: `${relPath}:${line}: \`${runner} ${bin}\` runs the npm package named "${bin}", not ${pkg}, when it is not installed locally.`,
        location: { path: filePath, relPath },
        fix: `Write \`${runner} ${pkg}\` (the package's ${bin} binary).`,
      })
    }
  }

  return findings
}
