#!/usr/bin/env bun
/**
 * Static policy gate for "Light PR CI" (`vars.PR_CI_MODE == 'light'`; design in
 * `.agents/guides/ci/README.md`, section "Light PR CI").
 *
 * In light mode a pull_request skips the heavy jobs and the merge queue / main
 * are the only place they run. That is only sound if every skipped job really
 * runs there, and if every required context is still reported in the queue.
 * This gate fails when:
 *
 *  1. a workflow that owns a required context does not declare `merge_group`
 *     (the queue would wait for a context that is never posted);
 *  2. a required job is missing (renamed without updating this list and the
 *     branch-protection authorities);
 *  3. a job that uses the light-mode condition (`pr-light` output or
 *     `PR_CI_MODE`) is not covered on merge_group AND push: its own `if:`
 *     excludes `merge_group`, or its workflow lacks a `merge_group` or `push`
 *     trigger;
 *  4. a job the queue SKIPS (`queueSkipped`: its only coverage is the PR) uses
 *     the light-mode condition at all, including its helper jobs;
 *  5. a direct `PR_CI_MODE` read is not bounded to `pull_request`, or the
 *     `Install` mode step can set `light=true` on another event.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJobBlocks } from './check-ci-fail-fast'

interface RequiredJob {
  /** The check name branch protection pins. */
  context: string
  file: string
  /** True when the merge queue skips this job today (the PR is its only coverage). */
  queueSkipped?: boolean
}

// `CodeQL` itself is posted by code scanning after the analysis upload, not by a job.
export const REQUIRED_JOBS: RequiredJob[] = [
  { context: 'Install', file: 'ci.yml' },
  { context: 'Fast Gates', file: 'ci.yml' },
  { context: 'Build', file: 'ci.yml' },
  { context: 'Test', file: 'ci.yml' },
  { context: 'Test (browser)', file: 'ci.yml' },
  { context: 'Release Build', file: 'ci.yml' },
  { context: 'bootstrap-exit-codes', file: 'ci.yml' },
  { context: 'Changeset', file: 'pr-gates.yml', queueSkipped: true },
  { context: 'Diagnose Catalog', file: 'pr-gates.yml', queueSkipped: true },
  { context: 'Analyze (javascript-typescript)', file: 'codeql.yml' },
  { context: 'Validate emitted Swift + Kotlin', file: 'native-validate.yml' },
  {
    context: 'Validate emitted Swift (real-SDK typecheck, macOS)',
    file: 'native-validate.yml',
    queueSkipped: true,
  },
  { context: 'iOS — xcodebuild (Simulator SDK)', file: 'native-device.yml', queueSkipped: true },
  { context: 'Android — gradlew assembleDebug', file: 'native-device.yml', queueSkipped: true },
]

/** Jobs (by id) the queue skips that gate a queue-skipped required job. */
const QUEUE_SKIPPED_HELPERS: Record<string, string[]> = {
  'native-device.yml': ['changes', 'fingerprint'],
}

const LIGHT = /pr-light|PR_CI_MODE/

function onBlock(workflow: string): string {
  return /^on:\n((?:[ \t]+[^\n]*\n|\n)*)/m.exec(workflow)?.[1] ?? ''
}

function hasTrigger(workflow: string, trigger: string): boolean {
  // Uncommented key at two-space indent, e.g. `  merge_group:`.
  return new RegExp(`^ {2}${trigger}:`, 'm').test(onBlock(workflow))
}

function jobName(body: string): string | null {
  const m = /^ {4}name:\s*(.+?)\s*$/m.exec(body)
  return m ? m[1]!.replace(/^['"]|['"]$/g, '') : null
}

/** The job-level `if:` (single or folded multi-line), comments excluded. */
function jobIf(body: string): string {
  const lines = body.split('\n')
  const i = lines.findIndex((l) => /^ {4}if:/.test(l))
  if (i < 0) return ''
  const out = [lines[i]!.replace(/^ {4}if:\s*/, '')]
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j]!
    if (/^ {5,}\S/.test(l)) out.push(l.trim())
    else break
  }
  return out.join(' ')
}

export function findLightPrCiViolations(workflows: Record<string, string>): string[] {
  const violations: string[] = []
  const jobsByFile = new Map<string, ReturnType<typeof parseJobBlocks>>()
  for (const [file, text] of Object.entries(workflows)) jobsByFile.set(file, parseJobBlocks(text))

  for (const req of REQUIRED_JOBS) {
    const text = workflows[req.file]
    if (text === undefined) {
      violations.push(`${req.file}: workflow for required context "${req.context}" not found`)
      continue
    }
    const job = jobsByFile.get(req.file)!.find((j) => jobName(j.body) === req.context)
    if (!job) {
      violations.push(`${req.file}: required context "${req.context}" has no job of that name`)
      continue
    }
    if (!hasTrigger(text, 'merge_group')) {
      violations.push(
        `${req.file}: owns required context "${req.context}" but has no merge_group trigger (the queue would wait for it forever)`,
      )
    }
    if (req.queueSkipped && LIGHT.test(jobIf(job.body))) {
      violations.push(
        `${req.file}: "${req.context}" is skipped in the merge queue, so the PR is its only coverage; it must not use the light-mode condition`,
      )
    }
  }

  for (const [file, text] of Object.entries(workflows)) {
    const helpers = QUEUE_SKIPPED_HELPERS[file] ?? []
    for (const job of jobsByFile.get(file)!) {
      const cond = jobIf(job.body)
      const name = jobName(job.body) ?? job.name
      if (helpers.includes(job.name) && LIGHT.test(cond)) {
        violations.push(
          `${file}: helper job "${job.name}" is skipped in the queue and must not use the light-mode condition`,
        )
      }
      const usesInIf = LIGHT.test(cond)
      const outputsLight = /^ {6}[\w-]+:.*steps\.mode\.outputs\.light/m.test(job.body)
      if (!usesInIf && !outputsLight) continue
      if (/merge_group/.test(cond)) {
        violations.push(
          `${file}: "${name}" uses the light-mode condition but its own if: excludes merge_group, so nothing would ever run it`,
        )
      }
      if (!hasTrigger(text, 'merge_group')) {
        violations.push(
          `${file}: "${name}" uses the light-mode condition but the workflow has no merge_group trigger`,
        )
      }
      if (!hasTrigger(text, 'push')) {
        violations.push(
          `${file}: "${name}" uses the light-mode condition but the workflow has no push trigger (main would never run it)`,
        )
      }
      if (/PR_CI_MODE/.test(cond) && !/pull_request/.test(cond)) {
        violations.push(
          `${file}: "${name}" reads PR_CI_MODE without bounding it to the pull_request event`,
        )
      }
    }
  }

  // The single source of `pr-light`: only a pull_request run may set it.
  const ci = workflows['ci.yml']
  if (ci !== undefined) {
    const install = jobsByFile.get('ci.yml')!.find((j) => j.name === 'install')
    const step = install
      ? /- name: Resolve PR CI mode[\s\S]*?(?=\n {6}(?:- name:|#))/.exec(install.body)?.[0]
      : undefined
    if (!step) {
      violations.push('ci.yml: Install has no "Resolve PR CI mode" step')
    } else if (
      !/github\.event_name \}\}" = "pull_request"/.test(step) ||
      !/= "light"/.test(step)
    ) {
      violations.push(
        'ci.yml: the "Resolve PR CI mode" step must set light=true only for a pull_request with PR_CI_MODE == light',
      )
    }
  }
  return violations
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..')
  const files = ['ci.yml', 'pr-gates.yml', 'codeql.yml', 'native-validate.yml', 'native-device.yml']
  const workflows: Record<string, string> = {}
  for (const f of files) workflows[f] = readFileSync(join(root, '.github/workflows', f), 'utf8')
  const violations = findLightPrCiViolations(workflows)
  if (violations.length > 0) {
    console.error('[check-light-pr-ci] FAILED: light PR CI could skip a job nothing else runs:')
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log(
    `[check-light-pr-ci] ok: ${REQUIRED_JOBS.length} required jobs covered on merge_group; every light-mode skip runs on merge_group and push`,
  )
}
