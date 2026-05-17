#!/usr/bin/env node

/**
 * @pyreon/cli — Developer tools for Pyreon
 *
 * Commands:
 *   pyreon doctor   — project-wide health audit (score + per-category bars + findings)
 *   pyreon context  — generate .pyreon/context.json for AI tools
 */

import { generateContext } from './context'
import { type DoctorOptions, doctor } from './doctor'
import type { GateName } from './doctor/orchestrator'

const VALID_GATES: GateName[] = [
  'react-patterns',
  'pyreon-patterns',
  'lint',
  'distribution',
  'doc-claims',
  'audit-tests',
  'islands-audit',
  'ssg-audit',
  'audit-types',
  'bundle-budgets',
]

const args = process.argv.slice(2)
const command = args[0]

function printUsage(): void {
  console.log(`
  pyreon <command> [options]

  Commands:
    doctor [options]                 Project-wide health audit with 0-100 score.
                                     Runs 8 fast gates by default; --full enables 2 slow gates.
    context [--out <path>]           Generate .pyreon/context.json for AI tools

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
    Fast: ${VALID_GATES.slice(0, 8).join(', ')}
    Slow: ${VALID_GATES.slice(8).join(', ')} (require --full)

  Legacy doctor flags (still work — map to --only shortcuts):
    --audit-tests                    Equivalent to --only audit-tests
    --check-islands                  Equivalent to --only islands-audit
    --check-ssg                      Equivalent to --only ssg-audit

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
    console.log('0.4.0')
    return
  }

  if (command === 'doctor') {
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
    }
    const exitCode = await doctor(options)
    if (options.ci && exitCode > 0) {
      process.exit(1)
    }
    return
  }

  if (command === 'context') {
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

export type { ContextOptions, ProjectContext } from './context'
export type { DoctorOptions, DoctorReport, GateName } from './doctor'
export { doctor, generateContext }
