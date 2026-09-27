/**
 * `lathe init` — set a project up from what it already has.
 *
 * Detects an orval / @hey-api/openapi-ts / kubb config, an openapi-typescript
 * script or a bare `openapi.*` file; maps every option it can onto a `lathe`
 * section and REPORTS every one it cannot; writes that section into
 * `pyreon.config.ts` (creating it, or amending it — never replacing anything
 * already there); adds `package.json` scripts; and runs the first generate.
 *
 * Interactive only when it has to be (several candidates, or none) and only on
 * a terminal. `--yes` answers every question with its default, which is what
 * a CI job or a scaffolder wants.
 */

import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { LatheProject, LatheSection } from '../../core/config'
import { jsLiteral } from '../../emit/jsdoc'
import { detect, readPackageJson, type Detected, type DetectFs } from './detect'
import { fromSpec, TOOL_NAMES, type Migration, type SourceTool, type UnmappedOption } from './migrate'

export const SOURCE_TOOLS: readonly SourceTool[] = ['orval', 'hey-api', 'kubb', 'openapi-typescript', 'spec']

export interface InitOptions {
  /** Only consider this tool's config. */
  from?: SourceTool | undefined
  /** A spec path or URL, skipping detection. */
  input?: string | undefined
  /** Override the output directory. */
  output?: string | undefined
  /** Answer every question with its default. */
  yes: boolean
  /** Run `lathe generate` once the config is written. */
  generate: boolean
  /** Report what would be written; write nothing. */
  dryRun: boolean
}

export interface InitFs extends DetectFs {
  write(path: string, contents: string): void
  /** Entries of a directory, or `[]` when it does not exist. */
  list(path: string): string[]
}

export interface InitDeps {
  fs: InitFs
  /** Absolute project root; every relative path above is against it. */
  cwd: string
  /** The nearest existing `pyreon.config.*`, absolute, or `undefined`. */
  configFile: string | undefined
  /** Ask a question; `undefined` when there is no one to ask. */
  ask?: ((question: string) => Promise<string>) | undefined
  /** Run the first generate with the new section (paths relative to `cwd`). */
  generate?: ((section: LatheSection) => Promise<{ code: number; stdout: string; stderr: string }>) | undefined
}

export interface InitReport {
  ok: boolean
  from: { tool: SourceTool; file: string } | undefined
  config: { file: string; action: 'created' | 'amended' | 'unchanged' } | undefined
  section: LatheSection | undefined
  mapped: Migration['mapped']
  unmapped: UnmappedOption[]
  scripts: { added: string[]; kept: string[] }
  /** package.json scripts that still run the old generator. */
  oldScripts: string[]
  missingDependencies: { runtime: string[]; dev: string[] }
  installCommand: string | undefined
  /** Notes about the output directory, the old tool's files, etc. */
  notes: string[]
  generated: { code: number; stdout: string; stderr: string } | undefined
  error?: string | undefined
}

/** Run `lathe init`. Never throws for a user error. */
export async function runInit(options: InitOptions, deps: InitDeps): Promise<InitReport> {
  const report: InitReport = {
    ok: false,
    from: undefined,
    config: undefined,
    section: undefined,
    mapped: [],
    unmapped: [],
    scripts: { added: [], kept: [] },
    oldScripts: [],
    missingDependencies: { runtime: [], dev: [] },
    installCommand: undefined,
    notes: [],
    generated: undefined,
  }
  const fail = (error: string): InitReport => ({ ...report, ok: false, error })
  const { fs } = deps
  const interactive = deps.ask !== undefined && !options.yes

  // ── 1. What does the project generate from today? ──────────────────────────
  let chosen: Detected | undefined
  if (options.input) {
    chosen = { tool: 'spec', file: options.input, migrations: fromSpec(options.input) }
  } else {
    const found = dedupe(detect(fs, options.from))
    if (found.length === 0) {
      if (!interactive) {
        return fail(
          options.from
            ? `[Pyreon] lathe init: no ${TOOL_NAMES[options.from]} setup found in ${deps.cwd}.`
            : '[Pyreon] lathe init: found no OpenAPI document and no orval / hey-api / kubb / openapi-typescript setup.\n' +
                '  Pass the spec: `lathe init ./openapi.yaml` (a URL works too).',
        )
      }
      const answer = (await (deps.ask as NonNullable<InitDeps['ask']>)('Path or URL of your OpenAPI document: ')).trim()
      if (!answer) return fail('[Pyreon] lathe init: no spec given; nothing written.')
      chosen = { tool: 'spec', file: answer, migrations: fromSpec(answer) }
    } else if (found.length > 1 && interactive) {
      const list = found.map((d, i) => `  ${i + 1}) ${d.file} (${TOOL_NAMES[d.tool]})`).join('\n')
      const answer = (await (deps.ask as NonNullable<InitDeps['ask']>)(`Found:\n${list}\nWhich one? [1] `)).trim()
      const index = answer === '' ? 0 : Number(answer) - 1
      chosen = found[index]
      if (!chosen) return fail(`[Pyreon] lathe init: \`${answer}\` is not one of 1-${found.length}.`)
    } else {
      chosen = found[0]
    }
  }
  const picked = chosen as Detected
  report.from = { tool: picked.tool, file: picked.file }
  if (picked.migrations.length === 0) {
    return fail(
      `[Pyreon] lathe init: could not read ${picked.file} — it does not export a config object this reader understands.\n` +
        '  Point Lathe at the spec instead: `lathe init ./openapi.yaml`.',
    )
  }
  for (const m of picked.migrations) {
    const prefix = m.name && picked.migrations.length > 1 ? `[${m.name}] ` : ''
    report.mapped.push(...m.mapped.map((x) => ({ ...x, from: prefix + x.from })))
    report.unmapped.push(...m.unmapped.map((x) => ({ ...x, from: prefix + x.from })))
  }

  // ── 2. The section, with an output directory that is safe to write ─────────
  const section = buildSection(picked.migrations, options, fs, report)
  if (typeof section === 'string') return fail(section)
  report.section = section

  // ── 3. Where it goes ───────────────────────────────────────────────────────
  const configFile = deps.configFile ?? join(deps.cwd, 'pyreon.config.ts')
  const configDir = dirname(configFile)
  const inConfig = rebaseSection(section, deps.cwd, configDir)
  const configRel = relative(deps.cwd, configFile) || configFile
  const existing = deps.configFile && fs.exists(configRel) ? fs.read(configRel) : undefined
  let configText: string
  if (existing === undefined) {
    configText = createConfig(inConfig)
    report.config = { file: configRel, action: 'created' }
  } else if (hasLatheSection(existing)) {
    report.config = { file: configRel, action: 'unchanged' }
    return fail(
      `[Pyreon] lathe init: ${configRel} already has a \`lathe\` section; it was left untouched.\n` +
        `  The detected settings would be:\n\n  lathe: ${jsLiteral(inConfig, 2, 9)}\n\n` +
        '  Merge them by hand, or remove the section and run `lathe init` again.',
    )
  } else {
    const amended = amendConfig(existing, inConfig)
    if (amended === undefined) {
      return fail(
        `[Pyreon] lathe init: could not find the exported object in ${configRel} to add a \`lathe\` section to.\n` +
          `  Add it by hand:\n\n  lathe: ${jsLiteral(inConfig, 2, 9)},\n`,
      )
    }
    configText = amended
    report.config = { file: configRel, action: 'amended' }
  }

  // ── 4. package.json: scripts, the old tool's scripts, missing dependencies ─
  const pkg = readPackageJson(fs)
  const wanted: Record<string, string> = {
    'lathe:generate': 'lathe generate',
    'lathe:check': 'lathe check',
    ...(sectionSources(section) ? { 'lathe:pull': 'lathe pull' } : {}),
  }
  let pkgText: string | undefined
  if (pkg) {
    const scripts: Record<string, string> = { ...pkg.scripts }
    for (const [name, command] of Object.entries(wanted)) {
      if (scripts[name] === undefined) {
        scripts[name] = command
        report.scripts.added.push(name)
      } else if (scripts[name] !== command) {
        report.scripts.kept.push(name)
      }
    }
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      if (/(^|[\s/])(orval|openapi-ts|kubb|openapi-typescript)(\s|$)/.test(command)) report.oldScripts.push(name)
    }
    if (report.scripts.added.length > 0) pkgText = withScripts(fs.read('package.json'), scripts)
    const have = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
    const need = requiredPackages(section)
    report.missingDependencies = {
      runtime: need.runtime.filter((p) => !have.has(p)),
      dev: need.dev.filter((p) => !have.has(p)),
    }
    report.installCommand = installCommand(fs, report.missingDependencies)
  } else {
    report.notes.push('no package.json here, so no scripts were added.')
  }
  if (report.oldScripts.length > 0) {
    report.notes.push(
      `these scripts still run the old generator: ${report.oldScripts.join(', ')} — replace them with \`lathe:generate\` once your imports use the new client.`,
    )
  }

  // ── 5. Confirm, then write ─────────────────────────────────────────────────
  if (interactive && !options.dryRun) {
    const answer = (await (deps.ask as NonNullable<InitDeps['ask']>)(`Write ${configRel}${pkgText ? ' and package.json scripts' : ''}? [Y/n] `)).trim()
    if (/^n/i.test(answer)) return fail('[Pyreon] lathe init: cancelled; nothing written.')
  }
  if (options.dryRun) {
    report.notes.push('dry run: nothing was written.')
    report.ok = true
    return report
  }
  fs.write(configRel, configText)
  if (pkgText) fs.write('package.json', pkgText)

  // ── 6. The first generate ──────────────────────────────────────────────────
  if (options.generate && deps.generate) {
    report.generated = await deps.generate(section)
    report.ok = report.generated.code === 0
    return report
  }
  report.ok = true
  return report
}

/** Drop a bare-spec candidate that a detected config already points at. */
function dedupe(found: Detected[]): Detected[] {
  // Only a GENERATOR's input can shadow a spec file — a spec candidate's own
  // input is itself.
  const inputs = new Set(
    found
      .filter((d) => d.tool !== 'spec')
      .flatMap((d) => d.migrations.map((m) => m.section.input))
      .filter((p): p is string => !!p)
      .map(norm),
  )
  return found.filter((d) => d.tool !== 'spec' || !inputs.has(norm(d.file)))
}

const norm = (p: string): string => p.replace(/^\.\//, '')

/**
 * One section from one or several migrations. Several (orval's multi-API
 * config) become `projects`, one per API, each with its own output.
 */
function buildSection(
  migrations: Migration[],
  options: InitOptions,
  fs: InitFs,
  report: InitReport,
): LatheSection | string {
  const one = (m: Migration, fallback: string): LatheSection | string => {
    const s: LatheSection = { ...m.section }
    if (!s.input) {
      return `[Pyreon] lathe init: ${m.file} does not say where the spec is${m.name ? ` for \`${m.name}\`` : ''}. Pass it: \`lathe init ./openapi.yaml\`.`
    }
    const wanted = options.output ?? s.output
    const out = safeOutput(wanted, fallback, fs, report, m)
    return orderKeys({ ...s, output: out })
  }
  if (migrations.length === 1) return one(migrations[0] as Migration, './src/gen')
  const projects: LatheProject[] = []
  for (const m of migrations) {
    const s = one(m, `./src/gen/${m.name ?? 'api'}`)
    if (typeof s === 'string') return s
    projects.push({ name: m.name ?? 'api', ...s, input: s.input as string })
  }
  return { projects }
}

/**
 * The output directory to write, and a note when it is not the one asked for.
 *
 * The old tool's directory is kept only when it is empty or already Lathe's:
 * writing into a tree of another generator's files would overwrite some of
 * them (`index.ts` is common to all of them) and leave the app broken
 * half-way through a migration. Side by side, the old client keeps working
 * until the imports move.
 */
function safeOutput(
  wanted: string | undefined,
  fallback: string,
  fs: InitFs,
  report: InitReport,
  m: Migration,
): string {
  const usable = (dir: string): boolean => {
    const entries = fs.list(dir)
    return entries.length === 0 || entries.includes('lathe-manifest.json')
  }
  if (wanted && usable(wanted)) return wanted
  if (wanted && m.tool !== 'spec') {
    report.notes.push(
      `${wanted} holds ${TOOL_NAMES[m.tool]}'s generated files, so Lathe writes to ${usable(fallback) ? fallback : `${fallback}-lathe`} instead. ` +
        `Move your imports to the new client, delete ${wanted}, then set \`output: '${wanted}'\` if you want the old path back.`,
    )
  }
  if (usable(fallback)) return fallback
  return `${fallback}-lathe`
}

/** Keys in the order a reader expects, so the written config reads top-down. */
function orderKeys(s: LatheSection): LatheSection {
  const order: Array<keyof LatheSection> = [
    'input', 'source', 'output', 'target', 'plugins', 'client', 'validator', 'baseUrl', 'responseValidation',
  ]
  const out: Record<string, unknown> = {}
  for (const k of order) if (s[k] !== undefined) out[k] = s[k]
  for (const [k, v] of Object.entries(s)) if (!(k in out) && v !== undefined) out[k] = v
  return out as LatheSection
}

function sectionSources(s: LatheSection): boolean {
  return s.source !== undefined || (s.projects ?? []).some((p) => p.source !== undefined)
}

/** Paths in a section are relative to the CONFIG FILE's directory. */
function rebaseSection(s: LatheSection, cwd: string, configDir: string): LatheSection {
  if (configDir === cwd) return s
  const fix = (p: string | undefined): string | undefined => {
    if (p === undefined || isAbsolute(p)) return p
    const r = relative(configDir, resolve(cwd, p))
    return r.startsWith('.') ? r : `./${r}`
  }
  const out: LatheSection = { ...s }
  if (s.input) out.input = fix(s.input) as string
  if (s.output) out.output = fix(s.output) as string
  if (s.projects) {
    out.projects = s.projects.map((p) => ({ ...p, input: fix(p.input) as string, ...(p.output ? { output: fix(p.output) as string } : {}) }))
  }
  return out
}

/** Is there already a `lathe` key at the top of the exported object? */
export function hasLatheSection(text: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return /(^|[\s{,])["']?lathe["']?\s*:/m.test(code)
}

/** A new `pyreon.config.ts` holding just the section. */
export function createConfig(section: LatheSection): string {
  return [
    '/**',
    ' * Pyreon tool configuration. `lathe` is read by `lathe generate` / `lathe check`;',
    ' * see https://pyreon.dev/docs/lathe#configuration-reference for every key.',
    ' */',
    'export default {',
    `  lathe: ${jsLiteral(section, 2, 9)},`,
    '}',
    '',
  ].join('\n')
}

/**
 * Add the section to an existing config's exported object, keeping every
 * other byte as it was. `undefined` when the exported object cannot be found
 * (`export default config`, a function) — the caller then prints the section
 * to add by hand rather than guess.
 */
export function amendConfig(text: string, section: LatheSection): string | undefined {
  const m = /export\s+default\s+(?:defineConfig\s*\(\s*)?\{/.exec(text)
  if (!m) return undefined
  const at = m.index + m[0].length
  const after = text.slice(at)
  const indent = /\n([ \t]+)\S/.exec(after)?.[1] ?? '  '
  const empty = /^\s*\}/.test(after)
  const entry = `\n${indent}lathe: ${jsLiteral(section, indent.length, indent.length + 7)},`
  return text.slice(0, at) + entry + (empty ? '\n' : '') + after
}

/** package.json with `scripts` replaced, keeping its indentation and newline. */
export function withScripts(text: string, scripts: Record<string, string>): string {
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  '
  const pkg = JSON.parse(text) as Record<string, unknown>
  pkg.scripts = scripts
  return `${JSON.stringify(pkg, null, indent)}${text.endsWith('\n') ? '\n' : ''}`
}

/** The packages the generated code imports, given what the section selects. */
export function requiredPackages(section: LatheSection): { runtime: string[]; dev: string[] } {
  const all = section.projects && section.projects.length > 0 ? section.projects.map((p) => ({ ...section, ...p })) : [section]
  const runtime = new Set<string>()
  const dev = new Set<string>(['@pyreon/lathe'])
  for (const s of all) {
    const plugins = s.plugins ?? ['schemas', 'client', 'queries']
    const client = s.client ?? 'pyreon'
    if (plugins.includes('schemas') || plugins.includes('client')) runtime.add(s.validator === 'zod' ? 'zod' : '@pyreon/validate')
    if (plugins.includes('client') || plugins.includes('queries')) {
      runtime.add('@pyreon/http')
      if (client === 'axios') runtime.add('axios')
      if (client === 'ky') runtime.add('ky')
    }
    if (plugins.includes('queries') || plugins.includes('components') || plugins.includes('atlas')) runtime.add('@pyreon/query')
    if (plugins.includes('components') || plugins.includes('atlas')) runtime.add('@pyreon/core')
    if (plugins.includes('faker')) dev.add('@faker-js/faker')
  }
  return { runtime: [...runtime].sort(), dev: [...dev].sort() }
}

/** The install command for the project's package manager, or `undefined` when nothing is missing. */
function installCommand(fs: DetectFs, missing: { runtime: string[]; dev: string[] }): string | undefined {
  if (missing.runtime.length === 0 && missing.dev.length === 0) return undefined
  const pm = fs.exists('bun.lock') || fs.exists('bun.lockb')
    ? 'bun'
    : fs.exists('pnpm-lock.yaml')
      ? 'pnpm'
      : fs.exists('yarn.lock')
        ? 'yarn'
        : 'npm'
  const add = pm === 'npm' ? 'npm install' : `${pm} add`
  const dev = pm === 'npm' ? 'npm install -D' : `${pm} add -D`
  return [
    missing.runtime.length > 0 ? `${add} ${missing.runtime.join(' ')}` : undefined,
    missing.dev.length > 0 ? `${dev} ${missing.dev.join(' ')}` : undefined,
  ]
    .filter(Boolean)
    .join(' && ')
}

/** The human report. */
export function renderInitReport(report: InitReport): string {
  const out: string[] = []
  const from = report.from ? ` — from ${TOOL_NAMES[report.from.tool]} (${report.from.file})` : ''
  out.push(`lathe init${from}`, '')
  if (report.config) out.push(`  config   ${report.config.file} (${report.config.action})`)
  if (report.scripts.added.length > 0) out.push(`  scripts  added ${report.scripts.added.join(', ')}`)
  if (report.scripts.kept.length > 0) out.push(`           kept your own ${report.scripts.kept.join(', ')} (different command)`)
  if (report.mapped.length > 0) {
    out.push('', '  mapped')
    const w = Math.min(44, Math.max(...report.mapped.map((m) => m.from.length)))
    for (const m of report.mapped) out.push(`    ${m.from.padEnd(w)}  → ${m.to}`)
  }
  if (report.unmapped.length > 0) {
    out.push('', `  not mapped (${report.unmapped.length}) — handle these by hand`)
    for (const u of report.unmapped) out.push(`    ${u.from}: ${u.value}`, `      ${u.advice}`)
  }
  if (report.installCommand) out.push('', `  install  ${report.installCommand}`)
  for (const n of report.notes) out.push('', `  note     ${n}`)
  if (report.generated) out.push('', report.generated.stdout.trimEnd(), report.generated.stderr.trimEnd())
  return `${out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trimEnd()}\n`
}
