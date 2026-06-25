#!/usr/bin/env node

/**
 * @pyreon/cli — Developer tools for Pyreon
 *
 * Commands:
 *   pyreon doctor   — project-wide health audit (score + per-category bars + findings)
 *   pyreon context  — generate .pyreon/context.json for AI tools
 *   pyreon info      — environment + installed @pyreon versions + version-skew check
 *   pyreon upgrade   — align all @pyreon/* dependencies to one version
 *   pyreon lint      — run @pyreon/lint (thin shell over the pyreon-lint CLI)
 */

import cliPkg from '../package.json' with { type: 'json' }
import { FAST_GATES, type GateName, SLOW_GATES } from './doctor/orchestrator'
// Command handlers are lazy-imported in `main()` (below) so each loads only
// when its command runs — the bin stays a slim dispatcher and a new command
// never grows the main-entry bundle. (FAST_GATES/SLOW_GATES are kept static:
// tiny string arrays the synchronous usage/validation paths need.)
import type { DoctorOptions } from './doctor'

// Single-sourced from the orchestrator so the CLI's valid-gate set can
// NEVER drift from the gates that actually run. (Previously a hand-kept
// duplicate list — it had silently dropped `check-dedup`, so a gate that
// ran by default was rejected by `--only`/`--skip`.)
const VALID_GATES: GateName[] = [...FAST_GATES, ...SLOW_GATES]

const args = process.argv.slice(2)
const command = args[0]

function printUsage(): void {
  console.log(`
  pyreon <command> [options]

  Commands:
    doctor [options]                 Project-wide health audit with 0-100 score.
                                     Runs ${FAST_GATES.length} fast gates by default; --full enables ${SLOW_GATES.length} slow gates.
    context [--out <path>]           Generate .pyreon/context.json for AI tools
    info [--json]                    Environment + installed @pyreon versions + skew check
    upgrade [--to <v>] [--write]     Align all @pyreon/* deps to one version (--exact pins; dry-run default)
    lint [paths] [--fix] [--watch]   Run @pyreon/lint (forwards all pyreon-lint flags: --preset/--format/--lsp/…)

  doctor options:
    --fix                            Auto-fix what we can (lint + react-patterns).
    --full                           Include slow gates (audit-types, bundle-budgets).
    --only <gates>                   Run ONLY these gates (comma-separated).
    --skip <gates>                   Skip these gates (comma-separated).
    --format text|json|gha           Output format (default: text).
    --json                           Shortcut for --format=json.
    --gha                            Shortcut for --format=gha (GitHub Actions annotations).
    --ci                             Exit non-zero on error findings only.
    --audit-min-risk high|medium|low Minimum risk for test-env audit (default: medium).

  doctor gates:
    Fast: ${FAST_GATES.join(', ')}
    Slow: ${SLOW_GATES.join(', ')} (require --full)

  Legacy doctor flags (still work — map to --only shortcuts):
    --audit-tests                    Equivalent to --only audit-tests
    --check-islands                  Equivalent to --only islands-audit
    --check-ssg                      Equivalent to --only ssg-audit
    --check-content                  Equivalent to --only content-audit
    --check-native                   Equivalent to --only native-audit (multiplatform PMTC hazards)

  Options:
    --help                           Show this help message
    --version                        Show version
`)
}

const parseGateList = (raw: string | undefined): GateName[] | undefined => {
  if (!raw) return undefined
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const invalid = names.filter((n) => !VALID_GATES.includes(n as GateName))
  if (invalid.length > 0) {
    console.error(
      `Unknown gate(s): ${invalid.join(', ')}. Valid: ${VALID_GATES.join(', ')}`,
    )
    process.exit(1)
  }
  return names as GateName[]
}

const getFlagValue = (flag: string): string | undefined => {
  const idx = args.indexOf(flag)
  if (idx < 0) return undefined
  return args[idx + 1]
}

const parseFormat = (raw: string | undefined): DoctorOptions['format'] => {
  if (!raw) return undefined
  if (raw === 'text' || raw === 'json' || raw === 'gha') return raw
  console.error(`--format must be text|json|gha, got '${raw}'`)
  process.exit(1)
}

const parseMinRisk = (raw: string | undefined): DoctorOptions['auditMinRisk'] => {
  if (!raw) return undefined
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  console.error(`--audit-min-risk must be high|medium|low, got '${raw}'`)
  process.exit(1)
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command === '--version' || command === '-v') {
    console.log(cliPkg.version)
    return
  }

  if (command === 'info') {
    const { info } = await import('./info')
    info({ cwd: process.cwd(), json: args.includes('--json') })
    return
  }

  if (command === 'upgrade') {
    const { upgrade } = await import('./upgrade')
    const exitCode = upgrade({
      cwd: process.cwd(),
      to: getFlagValue('--to'),
      exact: args.includes('--exact'),
      write: args.includes('--write'),
      json: args.includes('--json'),
    })
    if (exitCode > 0) process.exit(exitCode)
    return
  }

  if (command === 'lint') {
    // Thin shell over @pyreon/lint's CLI — ONE implementation, shared with the
    // `pyreon-lint` bin. Forward every flag after `lint` verbatim (--fix,
    // --preset, --format, --watch, --lsp, paths, …). `runCli` returns null for
    // the long-running --watch/--lsp modes (keep the process alive).
    const { runCli } = await import('@pyreon/lint')
    const code = runCli(args.slice(1))
    if (code !== null) process.exit(code)
    return
  }

  if (command === 'doctor') {
    const { doctor } = await import('./doctor')
    const format = args.includes('--gha')
      ? ('gha' as const)
      : parseFormat(getFlagValue('--format'))

    const options: DoctorOptions = {
      fix: args.includes('--fix'),
      json: args.includes('--json'),
      ci: args.includes('--ci'),
      cwd: process.cwd(),
      format,
      full: args.includes('--full'),
      only: parseGateList(getFlagValue('--only')),
      skip: parseGateList(getFlagValue('--skip')),
      auditTests: args.includes('--audit-tests'),
      auditMinRisk: parseMinRisk(getFlagValue('--audit-min-risk')),
      checkIslands: args.includes('--check-islands'),
      checkSsg: args.includes('--check-ssg'),
      checkContent: args.includes('--check-content'),
      checkNative: args.includes('--check-native'),
    }
    const exitCode = await doctor(options)
    if (options.ci && exitCode > 0) {
      process.exit(1)
    }
    return
  }

  if (command === 'context') {
    const { generateContext } = await import('./context')
    const outIdx = args.indexOf('--out')
    const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined
    await generateContext({ cwd: process.cwd(), outPath })
    return
  }

  console.error(`Unknown command: ${command}`)
  printUsage()
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// Library API — the programmatic surface (unchanged baseline). CLI-only
// command handlers (info/upgrade/…) are intentionally NOT re-exported here:
// keeping them out of the main entry's static graph means a new command is a
// lazy-loaded chunk, never main-entry bundle weight. They're reachable via
// their own module path for tests, and could get a `/info` subpath export if
// programmatic access is ever needed.
export type { ContextOptions, ProjectContext } from './context'
export { generateContext } from './context'
export type { DoctorOptions, DoctorReport, GateName } from './doctor'
export { doctor } from './doctor'
