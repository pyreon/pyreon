#!/usr/bin/env bun
/**
 * check-advisory-comment-steps — assert every ADVISORY workflow step that
 * posts a PR comment is BEST-EFFORT: `retries:` for transient GitHub API
 * 5xx plus a `catch` that downgrades a residual failure to a warning.
 *
 * The failure class this closes (observed twice, most visibly on the
 * 2026-07-16 release PR #2355): `bundle-size-diff.yml` documents itself as
 * "informational" — it reports per-package gzip deltas alongside the STRICT
 * `Check Bundle Budgets` gate in ci.yml — yet a bare `503 Service
 * Unavailable` from `issues.listComments` turned the whole check RED and
 * blocked the release PR. The measurement had already succeeded; only the
 * cosmetic comment delivery failed. An advisory workflow whose failure mode
 * is "blocks the PR" is a design defect, not bad luck: the check must
 * reflect the MEASUREMENT, never the comment transport.
 *
 * The rule (mechanical, both halves required at each site):
 *   1. `retries:` on the github-script step  — transient 5xx are retried
 *      (github-script's retry plugin exempts 4xx by default, so a real
 *      permission error still surfaces promptly).
 *   2. a `catch` AND a `core.warning` in the script body — a residual
 *      failure is DOWNGRADED, not thrown.
 *
 * Why `core.warning` and not just `catch`: a bare-`catch` rule is satisfiable
 * by an UNRELATED try/catch elsewhere in the step (leak-sweep's pre-fix
 * version guarded its `readFileSync` while leaving the comment post
 * unprotected — it would have passed a catch-only gate). Requiring the
 * downgrade signal itself is the property that actually matters.
 *
 * DELIBERATE EXEMPTION — notifier jobs (`NOTIFIER_WORKFLOWS`): when the
 * notification IS the job's deliverable rather than a side-channel next to a
 * real gate (`native-device.yml`'s nightly sticky issue), swallowing the
 * error would let a red nightly vanish silently — the catalogued dead-gate
 * class. Those keep `retries:` but must stay LOUD, so the catch half is not
 * required (and the gate asserts they still carry retries).
 *
 * Run:
 *   bun run check-advisory-comment-steps          # exit non-zero on a gap
 *   bun run check-advisory-comment-steps --json   # machine-readable
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `import.meta.url` (NOT bun's `import.meta.dir`): this module is imported by
// a vitest suite, where `import.meta.dir` is undefined and a module-scope
// `resolve(undefined, '..')` throws at IMPORT time. Same trap the
// check-published-state test documents.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')

/**
 * Workflows whose comment/issue post IS the deliverable — retries required,
 * swallow-all catch deliberately NOT required (see the header rationale).
 */
export const NOTIFIER_WORKFLOWS = new Set(['native-device.yml'])

/** Octokit calls that write a PR comment / issue — the steps this gate covers. */
const COMMENT_CALL_RE = /issues\.(createComment|updateComment|create)\b/

export interface StepFinding {
  workflow: string
  step: string
  missing: Array<'retries' | 'catch' | 'core.warning'>
}

export interface CheckResult {
  ok: boolean
  stepsChecked: number
  findings: StepFinding[]
}

/**
 * Split a workflow's text into `- name: …` step blocks. A deliberately
 * text-level scan (not a YAML parse): the property under test is how the
 * step is WRITTEN — a `retries:` key and a `catch` inside the inline script
 * — and both survive verbatim in the raw text. Keeps the gate dependency-free
 * and immune to YAML-shape churn.
 */
export function splitSteps(text: string): Array<{ name: string; body: string }> {
  const lines = text.split('\n')
  const steps: Array<{ name: string; body: string }> = []
  let current: { name: string; body: string[] } | null = null
  for (const line of lines) {
    const nameMatch = /^\s*-\s+name:\s*(.+?)\s*$/.exec(line)
    if (nameMatch) {
      if (current) steps.push({ name: current.name, body: current.body.join('\n') })
      current = { name: nameMatch[1] as string, body: [line] }
      continue
    }
    if (current) current.body.push(line)
  }
  if (current) steps.push({ name: current.name, body: current.body.join('\n') })
  return steps
}

/** Pure core: classify every comment-posting step in one workflow's text. */
export function checkWorkflowText(file: string, text: string): StepFinding[] {
  const isNotifier = NOTIFIER_WORKFLOWS.has(file)
  const findings: StepFinding[] = []
  for (const step of splitSteps(text)) {
    if (!COMMENT_CALL_RE.test(step.body)) continue
    const missing: Array<'retries' | 'catch' | 'core.warning'> = []
    if (!/^\s*retries:\s*\d+/m.test(step.body)) missing.push('retries')
    if (!isNotifier) {
      if (!/\bcatch\s*[({]/.test(step.body)) missing.push('catch')
      if (!/\bcore\.warning\s*\(/.test(step.body)) missing.push('core.warning')
    }
    if (missing.length > 0) findings.push({ workflow: file, step: step.name, missing })
  }
  return findings
}

export function checkAll(dir: string = WORKFLOWS_DIR): CheckResult {
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  const findings: StepFinding[] = []
  let stepsChecked = 0
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8')
    for (const step of splitSteps(text)) {
      if (COMMENT_CALL_RE.test(step.body)) stepsChecked++
    }
    findings.push(...checkWorkflowText(file, text))
  }
  return { ok: findings.length === 0, stepsChecked, findings }
}

if (import.meta.main) {
  const json = process.argv.includes('--json')
  const result = checkAll()
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    console.log(
      `✔ advisory-comment-steps ok — ${result.stepsChecked} comment-posting step(s), all retry-hardened`,
    )
  } else {
    console.error('✖ advisory PR-comment step(s) can turn a check RED on a transient API error:\n')
    for (const f of result.findings) {
      console.error(`  ${f.workflow} → "${f.step}" is missing: ${f.missing.join(' + ')}`)
    }
    console.error(
      '\nAn advisory workflow must report the MEASUREMENT, never the comment transport.',
    )
    console.error('Add `retries: 3` to the github-script step and wrap the post in a')
    console.error('try/catch that calls `core.warning(...)` on failure. If the post IS the')
    console.error("job's deliverable (a notifier), add the workflow to NOTIFIER_WORKFLOWS")
    console.error(`in ${'scripts/check-advisory-comment-steps.ts'} with a rationale.`)
  }
  process.exit(result.ok ? 0 : 1)
}
