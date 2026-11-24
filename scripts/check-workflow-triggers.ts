#!/usr/bin/env bun
/**
 * check-workflow-triggers — pull-request trigger hygiene for every workflow.
 *
 * The runner pool (20 concurrent Linux jobs org-wide) is shared by every open
 * pull request, so a run that keeps going after a newer push, or a run that
 * never happens when it should, costs every other PR. This gate fails when:
 *
 *  1. a workflow triggered by `pull_request` or `pull_request_target` has no
 *     workflow-level `concurrency` that cancels a superseded run of the SAME
 *     pull request: the group must contain a per-PR or per-ref part
 *     (`github.ref`, `github.head_ref`, `github.event.pull_request.number`,
 *     …; a constant group such as `lint` would cancel OTHER PRs' runs), and
 *     `cancel-in-progress` must evaluate to true for that event (it is
 *     evaluated, not pattern-matched: `${{ github.event_name !=
 *     'pull_request' }}` is false for a PR; an expression the gate cannot
 *     decide fails closed). Exempt a workflow
 *     whose pull_request `types:` leave out `synchronize` (`[closed]`,
 *     `[opened]`, `[labeled]`): no push supersedes its run, and cancelling a
 *     label-driven run on the next label would drop work.
 *  2. a workflow with `merge_group` keys its concurrency group on
 *     `github.event.pull_request.number` without a `|| …` fallback: the number
 *     is empty in a merge group, so every group would share one key and cancel
 *     or queue behind each other.
 *  3. a job's or a step's `if:` reads `github.event.pull_request.draft`, but
 *     the pull_request trigger does not list `ready_for_review`: the default types
 *     (opened, synchronize, reopened) never fire when a draft is marked ready,
 *     so the job skipped on the draft stays skipped until the next push.
 *
 * The files are read structurally (`scripts/workflow-yaml.ts`), so flow and
 * block lists, comments and quoting do not change the verdict.
 *
 * Run: `bun scripts/check-workflow-triggers.ts`
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type YamlValue,
  evaluate,
  isMap,
  parseWorkflowYaml,
  stringList,
  triggersOf,
  truthOf,
  UNKNOWN,
} from './workflow-yaml'

const WORKFLOWS_DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.github/workflows')

const PR_EVENTS = ['pull_request', 'pull_request_target'] as const

/** A context path that differs between pull requests (and between refs). */
const PER_PR_OR_REF =
  /\$\{\{[^}]*\bgithub\.(ref|ref_name|head_ref|event\.number|event\.pull_request\.(number|head\.ref))\b/

/** Every `if:` of every job and step. */
function conditions(doc: YamlValue): string[] {
  const out: string[] = []
  const jobs = isMap(doc) ? doc.jobs : undefined
  if (!isMap(jobs)) return out
  for (const job of Object.values(jobs)) {
    if (!isMap(job)) continue
    if (typeof job.if === 'string') out.push(job.if)
    for (const step of Array.isArray(job.steps) ? job.steps : []) {
      if (isMap(step) && typeof step.if === 'string') out.push(step.if)
    }
  }
  return out
}

const FIX =
  'add `concurrency: { group: <name>-${{ github.event.pull_request.number || github.ref }}, cancel-in-progress: true }`'

/** Rule 1 for one pull-request event: a per-PR group that cancels for that event. */
function concurrencyFindings(file: string, event: string, group: string, cancel: string): string[] {
  if (!group) return [`${file}: triggered by ${event} but has no workflow-level concurrency group (${FIX})`]
  if (!PER_PR_OR_REF.test(group)) {
    return [
      `${file}: the concurrency group "${group}" has no per-PR or per-ref part, so one PR's run cancels or queues behind every other PR's (${FIX})`,
    ]
  }
  let verdict: boolean | typeof UNKNOWN
  try {
    // A pull request's ref is `refs/pull/<n>/merge`, so a
    // `github.ref != 'refs/heads/main'` condition decides too.
    verdict = truthOf(evaluate(cancel, { 'github.event_name': event, 'github.ref': 'refs/pull/1/merge' }))
  } catch (error) {
    return [`${file}: cannot read cancel-in-progress "${cancel}": ${(error as Error).message}`]
  }
  if (verdict === false) {
    return [`${file}: cancel-in-progress "${cancel}" is false for ${event}, so a superseded PR run holds its runners to the end (${FIX})`]
  }
  if (verdict === UNKNOWN) {
    return [`${file}: cannot decide cancel-in-progress "${cancel}" for ${event}; write it as \`true\` or in terms of github.event_name`]
  }
  return []
}

/** Findings for one workflow file (pure: tested on fixtures). */
export function checkWorkflow(file: string, text: string): string[] {
  let doc: YamlValue
  try {
    doc = parseWorkflowYaml(text)
  } catch (error) {
    return [`${file}: cannot be read: ${(error as Error).message}`]
  }
  const on = triggersOf(doc)
  const findings: string[] = []
  const concurrency = isMap(doc) ? doc.concurrency : undefined
  const group = typeof concurrency === 'string' ? concurrency : isMap(concurrency) && typeof concurrency.group === 'string' ? concurrency.group : ''
  const cancel = isMap(concurrency) && typeof concurrency['cancel-in-progress'] === 'string' ? concurrency['cancel-in-progress'] : 'false'
  for (const event of PR_EVENTS) {
    if (!(event in on)) continue
    const config = on[event]
    const types = isMap(config) ? stringList(config.types) : null
    // Only a push to the PR (`synchronize`, part of the default types) makes an
    // earlier run stale. A trigger that lists types without it (`[closed]`,
    // `[opened]`, `[labeled]`) has nothing to supersede, and cancelling there
    // would be wrong: a second label would cancel the first label's run.
    const pushDriven = types === null || types.includes('synchronize')
    if (pushDriven) findings.push(...concurrencyFindings(file, event, group, cancel))
    if (conditions(doc).some((c) => /pull_request\.draft/.test(c)) && !(types ?? []).includes('ready_for_review')) {
      findings.push(
        `${file}: an if: reads pull_request.draft, but the ${event} trigger does not list ready_for_review, ` +
          'so a draft marked ready never runs it until the next push',
      )
    }
  }
  if ('merge_group' in on && /github\.event\.pull_request\.number/.test(group) && !/pull_request\.number\s*\|\|/.test(group)) {
    findings.push(
      `${file}: the concurrency group uses github.event.pull_request.number with no \`|| github.ref\` fallback; it is empty in a merge group`,
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
