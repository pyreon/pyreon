#!/usr/bin/env node
import { resolve } from 'node:path'
import { createTerm, formatElapsed, interrupted, onInterrupt } from '@pyreon/ansi'
import { formatInitResult, formatRuleList, parsePresetList, parseRuleOptionsOverride } from './cli-helpers'
import { loadConfig, loadConfigFromPath } from './config/loader'
import { initConfig } from './init'
import { resolveLintConfig } from './lint'
import { lintAsync } from './parallel'
import { startLspServer } from './lsp/index'
import { formatCompact, formatGha, formatJSON, formatText } from './reporter'
import type { PresetName, Severity } from './types'
import { watchAndLint } from './watcher'
import { explainRuleState, formatRuleState } from './why-off'

// Read version from package.json at build time; fallback for dev
const VERSION = '0.11.4'

function printUsage() {
  console.log(`
  pyreon-lint [options] [path...]

  Options:
    --preset <names>   Preset, or a comma list composed left to right (overrides the config file):
                       recommended (default), strict, app, lib, best-practices,
                       readable, readable-strict — e.g. --preset recommended,readable
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

function printList() {
  console.log(formatRuleList())
}

interface CliArgs {
  /** `undefined` = use the config file's preset (or `recommended`). */
  preset: PresetName[] | undefined
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
    preset: undefined,
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
    result.preset = parsePresetList(nextArg)
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
    const config = resolveLintConfig(fileConfig, {
      preset: args.preset,
      ruleOverrides: args.ruleOverrides,
      ruleOptionsOverrides: args.ruleOptionsOverrides,
    })
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
