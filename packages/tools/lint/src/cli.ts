#!/usr/bin/env node
import { lint, listRules } from './lint'
import { formatCompact, formatJSON, formatText } from './reporter'
import type { PresetName, Severity } from './types'
import { watchAndLint } from './watcher'

// Read version from package.json at build time; fallback for dev
const VERSION = '0.11.4'

function printUsage() {
  console.log(`
  pyreon-lint [options] [path...]

  Options:
    --preset <name>    Preset: recommended (default), strict, app, lib
    --fix              Auto-fix fixable issues
    --format <fmt>     Output: text (default), json, compact
    --quiet            Only show errors
    --list             List all available rules
    --rule <id>=<sev>  Override rule severity
    --config <path>    Config file path
    --ignore <path>    Ignore file path
    --watch            Watch mode — re-lint on file changes
    --help, -h         Show this help
    --version, -v      Show version
`)
}

function printList() {
  const rules = listRules()
  const maxId = Math.max(...rules.map((r) => r.id.length))
  const maxCat = Math.max(...rules.map((r) => r.category.length))

  for (const rule of rules) {
    const fixLabel = rule.fixable ? ' [fixable]' : ''
    const id = rule.id.padEnd(maxId)
    const cat = rule.category.padEnd(maxCat)
    const sev = rule.severity.padEnd(5)
    console.log(`  ${id}  ${cat}  ${sev}  ${rule.description}${fixLabel}`)
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
  configPath: string | undefined
  ignorePath: string | undefined
  ruleOverrides: Record<string, Severity>
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
    configPath: undefined,
    ignorePath: undefined,
    ruleOverrides: {},
    paths: [],
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
  if (arg === '--rule') {
    parseRuleOverride(nextArg, result.ruleOverrides)
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

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.showHelp) {
    printUsage()
    process.exit(0)
  }

  if (args.showVersion) {
    console.log(`pyreon-lint v${VERSION}`)
    process.exit(0)
  }

  if (args.showList) {
    printList()
    process.exit(0)
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
      config: args.configPath,
      ignore: args.ignorePath,
      format: args.format,
    })
    return
  }

  const result = lint({
    paths: args.paths,
    preset: args.preset,
    fix: args.fix,
    quiet: args.quiet,
    ruleOverrides: args.ruleOverrides,
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

  if (result.totalErrors > 0) {
    process.exit(1)
  }
}

main()
