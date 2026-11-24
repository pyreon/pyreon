#!/usr/bin/env bun
/**
 * check-workflow-triggers — pull-request trigger hygiene for every workflow.
 *
 * The runner pool (20 concurrent Linux jobs org-wide) is shared by every open
 * pull request, so a run that keeps going after a newer push, or a run that
 * never happens when it should, costs every other PR. This gate fails when:
 *
 *  1. a workflow triggered by `pull_request` has no workflow-level
 *     `concurrency` whose `cancel-in-progress` can be true for a pull request
 *     (a superseded run would hold its runners to the end). Exempt a workflow
 *     whose pull_request `types:` leave out `synchronize` (`[closed]`,
 *     `[opened]`, `[labeled]`): no push supersedes its run, and cancelling a
 *     label-driven run on the next label would drop work.
 *  2. a workflow with `merge_group` keys its concurrency group on
 *     `github.event.pull_request.number` without a `|| …` fallback: the number
 *     is empty in a merge group, so every group would share one key and cancel
 *     or queue behind each other.
 *  3. a job's `if:` reads `github.event.pull_request.draft`, but the
 *     pull_request trigger does not list `ready_for_review`: the default types
 *     (opened, synchronize, reopened) never fire when a draft is marked ready,
 *     so the job skipped on the draft stays skipped until the next push.
 *
 * Run: `bun scripts/check-workflow-triggers.ts`
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { workflowTriggers } from './check-main-red-watchlist'

const WORKFLOWS_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.github/workflows')

/** Lines of a top-level block (`on:`, `concurrency:`), comments and blank lines dropped. */
function topBlock(text: string, key: string): string[] {
  const out: string[] = []
  let inside = false
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd()
    if (new RegExp(`^${key}:`).test(line)) {
      inside = true
      const inline = line.slice(key.length + 1).trim()
      if (inline) out.push(`  group: ${inline}`)
      continue
    }
    if (!inside || line.trim() === '' || /^\s*#/.test(line)) continue
    if (/^\S/.test(line)) break
    out.push(line)
  }
  return out
}

/** `types:` of the pull_request trigger (flow list form), or null when absent. */
function pullRequestTypes(text: string): string[] | null {
  const on = topBlock(text, 'on')
  const i = on.findIndex((l) => /^ {2}pull_request:/.test(l))
  if (i < 0) return null
  for (const line of on.slice(i + 1)) {
    if (/^ {2}\S/.test(line)) break
    const m = /^ {4}types:\s*\[(.*)\]/.exec(line)
    if (m) return m[1]!.split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
  }
  return null
}

/** Every job-level `if:` (single line or folded continuation lines). */
function jobIfs(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^ {4}if:/.test(lines[i]!)) continue
    const parts = [lines[i]!.replace(/^ {4}if:\s*/, '')]
    for (let j = i + 1; j < lines.length && /^ {6,}\S/.test(lines[j]!); j++) parts.push(lines[j]!.trim())
    out.push(parts.join(' '))
  }
  return out
}

/** Findings for one workflow file (pure: tested on fixtures). */
export function checkWorkflow(file: string, text: string): string[] {
  let on: string[]
  try {
    on = workflowTriggers(text)
  } catch (error) {
    return [`${file}: ${(error as Error).message}`]
  }
  const findings: string[] = []
  if (!on.includes('pull_request')) return findings
  const types = pullRequestTypes(text)

  const conc = topBlock(text, 'concurrency')
  const group = conc.find((l) => /^ {2}group:/.test(l))?.replace(/^ {2}group:\s*/, '') ?? ''
  const cancel = conc.find((l) => /^ {2}cancel-in-progress:/.test(l))?.replace(/^ {2}cancel-in-progress:\s*/, '') ?? ''
  // Only a push to the PR (`synchronize`, part of the default types) makes an
  // earlier run stale. A trigger that lists types without it (`[closed]`,
  // `[opened]`, `[labeled]`) has nothing to supersede, and cancelling there
  // would be wrong: a second label would cancel the first label's run.
  const pushDriven = types === null || types.includes('synchronize')
  if (pushDriven && (!group || !/true|pull_request/.test(cancel))) {
    findings.push(
      `${file}: triggered by pull_request but has no workflow-level concurrency that cancels a superseded PR run ` +
        '(add `concurrency: { group: <name>-${{ github.event.pull_request.number || github.ref }}, cancel-in-progress: true }`)',
    )
  }
  if (on.includes('merge_group') && /github\.event\.pull_request\.number/.test(group) && !/pull_request\.number\s*\|\|/.test(group)) {
    findings.push(
      `${file}: the concurrency group uses github.event.pull_request.number with no \`|| github.ref\` fallback; it is empty in a merge group`,
    )
  }
  if (jobIfs(text).some((c) => /pull_request\.draft/.test(c)) && !(types ?? []).includes('ready_for_review')) {
    findings.push(
      `${file}: a job's if: reads pull_request.draft, but the pull_request trigger does not list ready_for_review, ` +
        'so a draft marked ready never runs it until the next push',
    )
  }
  return findings
}

export function checkAll(dir = WORKFLOWS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => checkWorkflow(f, readFileSync(join(dir, f), 'utf8')))
}

if (import.meta.main) {
  const findings = checkAll()
  if (findings.length > 0) {
    console.error('[check-workflow-triggers] pull-request trigger hygiene:')
    for (const f of findings) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('[check-workflow-triggers] OK')
}
