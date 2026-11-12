#!/usr/bin/env node
import { resolve } from 'node:path'
import {
  createTerm,
  finding,
  formatElapsed,
  header,
  interrupted,
  onInterrupt,
  plural,
  verdict,
  wrap,
} from '@pyreon/ansi'
import { loadConfig, loadConfigFromPath } from './config/loader'
import { getPreset } from './config/presets'
import { initConfig } from './init'
import { listRules } from './lint'
import { lintAsync } from './parallel'
import { startLspServer } from './lsp/index'
import { formatCompact, formatGha, formatJSON, formatText, type TermChoice } from './reporter'
import { termFor } from './term-for'
import { groupOf } from './rules/groups'
import type { PresetName, RuleGroup, Severity } from './types'
import { watchAndLint } from './watcher'
import { explainRuleState, formatRuleState } from './why-off'

// Read version from package.json at build time; fallback for dev
const VERSION = '0.11.4'

function printUsage() {
  console.log(`
  pyreon-lint [options] [path...]

  Options:
    --preset <name>    Preset: recommended (default), strict, app, lib, best-practices
    --fix              Auto-fix fixable issues
    --format <fmt>     Output: text (default), json, compact, gha (GitHub annotations)
    --quiet            Only show errors
    --init             Write a starting .pyreonlintrc.json for this project
    --list             List all available rules
    --why-off <id>     Explain why a rule will (or will not) run here
    --rule <id>=<sev>          Override rule severity (e.g. --rule pyreon/no-window-in-ssr=off)
    --rule-options <id>=<json> Override rule options (e.g. --rule-options pyreon/no-window-in-ssr='{"exemptPaths":["src/foundation/"]}')
    --config <path>    Config file path
    --ignore <path>    Ignore file path
    --watch            Watch mode — re-lint on file changes
    --lsp              Start LSP server (stdin/stdout JSON-RPC)
    --help, -h         Show this help
    --version, -v      Show version
`)
}

const GROUP_BLURB: Record<RuleGroup, string> = {
  pyreon: 'framework semantics — nothing outside Pyreon can know these',
  security: 'exploitable shapes — script URLs, referrer leakage',
  a11y: 'accessibility — standard markup plus Pyreon\u2019s own surfaces',
  pkg: 'per-library — each self-activates on a declared dependency',
  internal: 'encodes the Pyreon repo itself — never on in a shipped preset',
  js: 'language-level shapes oxlint cannot express on its own',
  backend: 'server-role files — handlers, loaders, adapters',
  isomorphic: 'runs on BOTH sides — the hydration contract',
  'web-perf': 'client-role files — main thread, teardown, network',
  portable: 'must survive iOS + Android through PMTC',
}
const GROUP_ORDER: RuleGroup[] = [
  'pyreon',
  'isomorphic',
  'backend',
  'web-perf',
  'portable',
  'security',
  'a11y',
  'pkg',
  'js',
  'internal',
]

const SEVERITY_ROLE = { error: 'err', warn: 'warn', info: 'info', off: 'dim' } as const

/**
 * `--list`: one section per group (bold name, count, dim blurb), one row per
 * rule (id, category, default severity as a word in its colour, the
 * description wrapped under its own column, `fixable` when it is), then
 * the totals. Exported for tests.
 */
export function formatRuleList(opts: TermChoice = {}): string {
  const t = termFor(opts)
  const rules = listRules()
  const maxId = Math.max(...rules.map((r) => r.id.length))
  const maxCat = Math.max(...rules.map((r) => r.category.length))
  const lines = [header(t, 'pyreon-lint --list', `${plural(rules.length, 'rule')} in ${plural(GROUP_ORDER.length, 'group')}`)]
  // 4 indent, id, 2, category, 2, severity (5), 2: the description column.
  const descCol = 4 + maxId + 2 + maxCat + 2 + 5 + 2
  const descWidth = t.width - descCol
  // A window too narrow for a readable description column puts the
  // description on its own line under the id.
  const stacked = descWidth < 30

  for (const group of GROUP_ORDER) {
    const inGroup = rules.filter((r) => groupOf(r) === group)
    if (inGroup.length === 0) continue
    const title = `${t.bold(group.toUpperCase())} ${t.dim(`(${inGroup.length}) ${t.sym('dash')} ${GROUP_BLURB[group]}`)}`
    lines.push('', ...wrap(title, t.width, t.width - 2, '    ').map((l, i) => (i === 0 ? `  ${l}` : l)))
    for (const rule of inGroup) {
      const desc = `${rule.description}${rule.fixable ? ` ${t.ok('fixable')}` : ''}`
      const role = SEVERITY_ROLE[rule.severity as keyof typeof SEVERITY_ROLE] ?? 'dim'
      if (stacked) {
        lines.push(`    ${rule.id}  ${t.dim(rule.category)}  ${t.paint(role, rule.severity)}`)
        lines.push(...wrap(desc, t.width, t.width - 6, '      ').map((l, i) => (i === 0 ? `      ${l}` : l)))
        continue
      }
      const sev = t.paint(role, rule.severity.padEnd(5))
      const prefix = `    ${rule.id.padEnd(maxId)}  ${t.dim(rule.category.padEnd(maxCat))}  ${sev}  `
      const body = wrap(desc, t.width, descWidth, ' '.repeat(descCol))
      lines.push(`${prefix}${body[0] ?? ''}`, ...body.slice(1))
    }
  }

  const fixable = rules.filter((r) => r.fixable).length
  lines.push('', verdict(t, null, `${rules.length} rules total`, [`${fixable} fixable`]))
  return lines.join('\n')
}

function printList() {
  console.log(formatRuleList())
}

/** A usage problem on stderr in the shared theme: `✗ pyreon-lint · problem`, then `fix:`. */
function usageProblem(message: string, fix: string): void {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  // oxlint-disable-next-line no-console
  console.error(finding(t, { severity: 'error', source: 'pyreon-lint', message, fix }, { indent: 0, width: t.width }).join('\n'))
}

/** `--init`: the outcome as the verdict (last line), any guidance above it. */
export function formatInitResult(
  r: { status: 'written' | 'exists' | 'no-package-json'; message: string },
  opts: TermChoice = {},
): string {
  const t = termFor(opts)
  const [first = '', ...rest] = r.message.split('\n')
  const status = r.status === 'written' ? 'ok' : r.status === 'exists' ? 'warn' : 'err'
  const body = rest.filter((l, i) => !(i === 0 && l === ''))
  return [header(t, 'pyreon-lint --init'), ...(body.length > 0 ? ['', ...body] : []), '', verdict(t, status, first)].join('\n')
}

interface CliArgs {
  preset: PresetName
  fix: boolean
  format: 'text' | 'json' | 'compact' | 'gha'
  quiet: boolean
  runInit: boolean
  showList: boolean
  showHelp: boolean
  showVersion: boolean
  watchMode: boolean
  lspMode: boolean
  configPath: string | undefined
  ignorePath: string | undefined
  ruleOverrides: Record<string, Severity>
  /** Per-rule options parsed from `--rule-options id='{json}'`. */
  ruleOptionsOverrides: Record<string, Record<string, unknown>>
  /** `--why-off <rule-id>` — explain the rule's effective state, then exit. */
  whyOff: string | undefined
  paths: string[]
}

const BOOLEAN_FLAGS: Record<string, keyof CliArgs> = {
  '--init': 'runInit',
  '--help': 'showHelp',
  '-h': 'showHelp',
  '--version': 'showVersion',
  '-v': 'showVersion',
  '--list': 'showList',
  '--fix': 'fix',
  '--quiet': 'quiet',
  '--watch': 'watchMode',
  '--lsp': 'lspMode',
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    preset: 'recommended',
    fix: false,
    format: 'text',
    quiet: false,
    showList: false,
    showHelp: false,
    showVersion: false,
    watchMode: false,
    lspMode: false,
    configPath: undefined,
    ignorePath: undefined,
    ruleOverrides: {},
    ruleOptionsOverrides: {},
    paths: [],
    whyOff: undefined,
    runInit: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    const boolKey = BOOLEAN_FLAGS[arg]

    if (boolKey) {
      ;(result as unknown as Record<string, unknown>)[boolKey] = true
      continue
    }

    const consumed = parseValueFlag(arg, argv[i + 1], result)
    i += consumed
  }

  return result
}

/** Returns number of extra args consumed (0 or 1). */
function parseValueFlag(arg: string, nextArg: string | undefined, result: CliArgs): number {
  if (arg === '--preset') {
    result.preset = (nextArg ?? 'recommended') as PresetName
    return 1
  }
  if (arg === '--format') {
    result.format = (nextArg ?? 'text') as CliArgs['format']
    return 1
  }
  if (arg === '--config') {
    result.configPath = nextArg
    return 1
  }
  if (arg === '--ignore') {
    result.ignorePath = nextArg
    return 1
  }
  if (arg === '--why-off') {
    result.whyOff = nextArg
    return 1
  }
  if (arg === '--rule') {
    parseRuleOverride(nextArg, result.ruleOverrides)
    return 1
  }
  if (arg === '--rule-options') {
    parseRuleOptionsOverride(nextArg, result.ruleOptionsOverrides)
    return 1
  }
  if (arg) {
    result.paths.push(arg)
  }
  return 0
}

function parseRuleOverride(val: string | undefined, overrides: Record<string, Severity>): void {
  if (!val) return
  const eqIdx = val.lastIndexOf('=')
  if (eqIdx === -1) return
  const ruleId = val.slice(0, eqIdx)
  const severity = val.slice(eqIdx + 1) as Severity
  overrides[ruleId] = severity
}

/** Exported for testing only. */
export function parseRuleOptionsOverride(
  val: string | undefined,
  overrides: Record<string, Record<string, unknown>>,
): void {
  if (!val) return
  const eqIdx = val.indexOf('=')
  if (eqIdx === -1) return
  const ruleId = val.slice(0, eqIdx)
  const json = val.slice(eqIdx + 1)
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      overrides[ruleId] = parsed as Record<string, unknown>
    } else {
      usageProblem(
        `--rule-options ${ruleId}: expected JSON object, got ${typeof parsed}`,
        `pass an object: --rule-options ${ruleId}='{"key":"value"}'`,
      )
    }
  } catch (err) {
    usageProblem(
      `--rule-options ${ruleId}: invalid JSON — ${(err as Error).message}`,
      `quote the JSON for your shell: --rule-options ${ruleId}='{"key":"value"}'`,
    )
  }
}

/**
 * Run the pyreon-lint CLI for a given argv (no `process.exit` — returns an
 * exit code so this is reusable as a library entry point: both the
 * `pyreon-lint` bin AND `pyreon lint` (the unified CLI) call this, sharing ONE
 * implementation instead of duplicating the arg-parsing + reporting.
 *
 * Returns `0` (ok) / `1` (errors), or `null` for the long-running modes
 * (`--watch` / `--lsp`) that must keep the process alive — the caller leaves
 * the process running rather than exiting.
 */
export async function runCli(argv: string[]): Promise<number | null> {
  const args = parseArgs(argv)

  if (args.showHelp) {
    printUsage()
    return 0
  }

  if (args.showVersion) {
    console.log(`pyreon-lint v${VERSION}`)
    return 0
  }

  if (args.runInit) {
    const r = initConfig(resolve('.'))
    console.log(formatInitResult(r))
    return r.status === 'written' ? 0 : 1
  }

  if (args.showList) {
    printList()
    return 0
  }

  if (args.whyOff) {
    const fileConfig = args.configPath
      ? loadConfigFromPath(args.configPath)
      : loadConfig(resolve('.'))
    const config = getPreset(args.preset ?? fileConfig?.preset ?? 'recommended')
    for (const [id, entry] of Object.entries(fileConfig?.rules ?? {})) config.rules[id] = entry
    for (const [id, sev] of Object.entries(args.ruleOverrides)) config.rules[id] = sev
    const state = explainRuleState(args.whyOff, {
      config,
      // A dependency gate is only meaningful relative to a file, so use the
      // first path the user gave (defaulting to cwd) as the probe point.
      filePath: resolve(args.paths[0] ?? '.'),
    })
    console.log(formatRuleState(state))
    return state.found ? 0 : 1
  }

  if (args.lspMode) {
    startLspServer()
    return null // long-running — keep the process alive
  }

  if (args.paths.length === 0) {
    args.paths.push('.')
  }

  if (args.watchMode) {
    watchAndLint({
      paths: args.paths,
      preset: args.preset,
      fix: args.fix,
      quiet: args.quiet,
      ruleOverrides: args.ruleOverrides,
      ruleOptionsOverrides: args.ruleOptionsOverrides,
      config: args.configPath,
      ignore: args.ignorePath,
      format: args.format,
    })
    return null // long-running — keep the process alive
  }

  let result: Awaited<ReturnType<typeof lintAsync>>
  const startedAt = performance.now()
  // Ctrl-C: the last line says the run was stopped, on stderr so a
  // `--format json` stdout stays valid; exit 130.
  const stopInterrupt = onInterrupt(() =>
    interrupted(createTerm({ isTTY: Boolean(process.stderr.isTTY) }), [
      'pyreon-lint',
      formatElapsed(performance.now() - startedAt),
    ]),
  )
  try {
    result = await lintAsync({
      paths: args.paths,
      preset: args.preset,
      fix: args.fix,
      quiet: args.quiet,
      ruleOverrides: args.ruleOverrides,
      ruleOptionsOverrides: args.ruleOptionsOverrides,
      config: args.configPath,
      ignore: args.ignorePath,
    })
  } catch (err) {
    // A run that cannot complete safely — today only a worker failing partway
    // through `--fix`, where other workers may already have written files.
    // Print the guidance the error carries; a stack trace here would bury the
    // one line that tells the user what to do next.
    console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  } finally {
    stopInterrupt()
  }

  if (args.format === 'json') {
    console.log(formatJSON(result))
  } else if (args.format === 'gha') {
    const gha = formatGha(result)
    if (gha) console.log(gha)
  } else if (args.format === 'compact') {
    console.log(formatCompact(result))
  } else {
    const output = formatText(result, {
      elapsedMs: performance.now() - startedAt,
      fixApplied: args.fix,
    })
    if (output) console.log(output)
  }

  return result.totalErrors > 0 ? 1 : 0
}

async function main() {
  const code = await runCli(process.argv.slice(2))
  if (code !== null) process.exit(code)
}

// Only invoke `main()` when this module is the entry point. Importing
// CLI internals (incl. `runCli`) from tests or `@pyreon/cli` must NOT trigger
// a real lint run + `process.exit`. `import.meta.main === true` under Bun when
// the file is the script; `undefined` / `false` under static imports.
if ((import.meta as { main?: boolean }).main === true) {
  main()
}
