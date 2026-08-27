#!/usr/bin/env node
import { resolve } from 'node:path'
import { loadConfig, loadConfigFromPath } from './config/loader'
import { getPreset } from './config/presets'
import { lint, listRules } from './lint'
import { startLspServer } from './lsp/index'
import { formatCompact, formatJSON, formatText } from './reporter'
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
    --format <fmt>     Output: text (default), json, compact
    --quiet            Only show errors
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
  a11y: 'accessibility — standard markup plus Pyreon\u2019s own surfaces',
  pkg: 'per-library — each self-activates on a declared dependency',
  internal: 'encodes the Pyreon repo itself — never on in a shipped preset',
}
const GROUP_ORDER: RuleGroup[] = ['pyreon', 'a11y', 'pkg', 'internal']

function printList() {
  const rules = listRules()
  const maxId = Math.max(...rules.map((r) => r.id.length))
  const maxCat = Math.max(...rules.map((r) => r.category.length))

  for (const group of GROUP_ORDER) {
    const inGroup = rules.filter((r) => groupOf(r) === group)
    if (inGroup.length === 0) continue
    console.log(`\n  ${group.toUpperCase()}  (${inGroup.length})  \u2014 ${GROUP_BLURB[group]}`)
    for (const rule of inGroup) {
      const fixLabel = rule.fixable ? ' [fixable]' : ''
      const id = rule.id.padEnd(maxId)
      const cat = rule.category.padEnd(maxCat)
      const sev = rule.severity.padEnd(5)
      console.log(`    ${id}  ${cat}  ${sev}  ${rule.description}${fixLabel}`)
    }
  }

  console.log(`\n  ${rules.length} rules total`)
}

interface CliArgs {
  preset: PresetName
  fix: boolean
  format: 'text' | 'json' | 'compact'
  quiet: boolean
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
    result.format = (nextArg ?? 'text') as 'text' | 'json' | 'compact'
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
      // oxlint-disable-next-line no-console
      console.error(
        `[pyreon-lint] --rule-options ${ruleId}: expected JSON object, got ${typeof parsed}`,
      )
    }
  } catch (err) {
    // oxlint-disable-next-line no-console
    console.error(`[pyreon-lint] --rule-options ${ruleId}: invalid JSON — ${(err as Error).message}`)
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
export function runCli(argv: string[]): number | null {
  const args = parseArgs(argv)

  if (args.showHelp) {
    printUsage()
    return 0
  }

  if (args.showVersion) {
    console.log(`pyreon-lint v${VERSION}`)
    return 0
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

  const result = lint({
    paths: args.paths,
    preset: args.preset,
    fix: args.fix,
    quiet: args.quiet,
    ruleOverrides: args.ruleOverrides,
    ruleOptionsOverrides: args.ruleOptionsOverrides,
    config: args.configPath,
    ignore: args.ignorePath,
  })

  if (args.format === 'json') {
    console.log(formatJSON(result))
  } else if (args.format === 'compact') {
    console.log(formatCompact(result))
  } else {
    const output = formatText(result)
    if (output) console.log(output)
  }

  return result.totalErrors > 0 ? 1 : 0
}

function main() {
  const code = runCli(process.argv.slice(2))
  if (code !== null) process.exit(code)
}

// Only invoke `main()` when this module is the entry point. Importing
// CLI internals (incl. `runCli`) from tests or `@pyreon/cli` must NOT trigger
// a real lint run + `process.exit`. `import.meta.main === true` under Bun when
// the file is the script; `undefined` / `false` under static imports.
if ((import.meta as { main?: boolean }).main === true) {
  main()
}
