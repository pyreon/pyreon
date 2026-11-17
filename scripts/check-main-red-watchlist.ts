#!/usr/bin/env bun
/**
 * check-main-red-watchlist — every workflow that can run on the default branch
 * is watched by `main-red-status.yml`, the sticky-issue alarm for a red run
 * there.
 *
 * `workflow_run` takes a list of workflow NAMES and no wildcard, so the alarm
 * only hears the workflows it names. A workflow added later, or renamed, would
 * drop out without a sound, and a red run of it on the default branch would
 * again have no audience (`Coverage (Full)` was red for two days that way).
 * This gate fails closed:
 *
 *   1. every `.github/workflows/*.yml` is either named in the watch list or
 *      listed in `EXEMPT` below with a reason the gate can verify from the file;
 *   2. every watched name is the `name:` of a workflow file that exists (a
 *      renamed workflow leaves a stale name that matches nothing);
 *   3. an exemption whose file is gone, whose reason no longer holds, or whose
 *      workflow is also watched, fails.
 *
 * Run: `bun scripts/check-main-red-watchlist.ts`
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEntry } from './is-entry'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS_DIR = join(REPO_ROOT, '.github/workflows')

export const ALARM_WORKFLOW = 'main-red-status.yml'

/** Why a workflow may stay off the watch list. Each reason is checked against the file. */
export type ExemptReason =
  /** The alarm cannot watch itself: its own completion would start it again. */
  | 'self'
  /** Triggered only by pull request events, so it never runs on the default branch. */
  | 'pull-request-only'
  /** A `workflow_run` follower whose job acts only on pull request runs. */
  | 'acts-on-pull-request-runs'

export const EXEMPT: Record<string, ExemptReason> = {
  [ALARM_WORKFLOW]: 'self',
  'bundle-size-diff.yml': 'pull-request-only',
  'cache-cleanup.yml': 'pull-request-only',
  'pr-gates.yml': 'pull-request-only',
  'required-check-autoheal.yml': 'acts-on-pull-request-runs',
}

const PULL_REQUEST_EVENTS = new Set(['pull_request', 'pull_request_target', 'merge_group'])

const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, '$2')

/** A line with its `#` comment removed (a `#` inside quotes is kept). */
function stripComment(line: string): string {
  let quote = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i)
  }

  return line
}

/** The workflow's `name:` (top level), or null. */
export function workflowName(text: string): string | null {
  for (const raw of text.split('\n')) {
    const m = /^name:\s*(.+)$/.exec(stripComment(raw).trimEnd())
    if (m) return unquote(m[1]!)
  }

  return null
}

/** The lines of the top-level `on:` block, comments removed, blank lines dropped. */
function onBlock(text: string): string[] {
  const out: string[] = []
  let inside = false
  for (const raw of text.split('\n')) {
    const line = stripComment(raw).trimEnd()
    if (/^(on|'on'|"on"):/.test(line)) {
      inside = true
      const inline = line.replace(/^[^:]+:/, '').trim()
      if (inline) out.push(`  ${inline}`)
      continue
    }
    if (!inside || line === '') continue
    if (/^\S/.test(line)) break
    out.push(line)
  }

  return out
}

/** The events a workflow is triggered by. Throws when the `on:` block has a shape this reader does not know. */
export function workflowTriggers(text: string): string[] {
  const block = onBlock(text)
  if (block.length === 0) throw new Error('no `on:` block')
  const events: string[] = []
  for (const line of block) {
    const key = /^ {2}([a-z_]+):/.exec(line)
    if (key) events.push(key[1]!)
    else if (!/^ {3,}\S/.test(line)) {
      // `on: push` or `on: [push, pull_request]`: a scalar or flow list.
      const flow = line.trim().replace(/^\[|\]$/g, '')
      for (const part of flow.split(',')) {
        const name = unquote(part)
        if (!/^[a-z_]+$/.test(name)) throw new Error(`unreadable trigger line: ${line.trim()}`)
        events.push(name)
      }
    }
  }
  if (events.length === 0) throw new Error('`on:` block names no event')

  return events
}

/** The workflow names under `on.workflow_run.workflows` (block list form). */
export function watchedNames(alarmText: string): string[] {
  const block = onBlock(alarmText)
  const start = block.findIndex((l) => /^ {4}workflows:\s*$/.test(l))
  if (start === -1) throw new Error('the alarm has no `workflows:` block list under `on.workflow_run`')
  const names: string[] = []
  for (const line of block.slice(start + 1)) {
    const item = /^ {6}-\s+(.+)$/.exec(line)
    if (!item) break
    names.push(unquote(item[1]!))
  }

  return names
}

function exemptionHolds(reason: ExemptReason, file: string, text: string): string | null {
  if (reason === 'self') return file === ALARM_WORKFLOW ? null : `only ${ALARM_WORKFLOW} can be exempt as "self"`
  const triggers = workflowTriggers(text)
  if (reason === 'pull-request-only') {
    const other = triggers.filter((t) => !PULL_REQUEST_EVENTS.has(t))
    return other.length === 0 ? null : `it is also triggered by ${other.join(', ')}, which can run on the default branch`
  }
  if (triggers.length !== 1 || triggers[0] !== 'workflow_run') return `its triggers are ${triggers.join(', ')}, not workflow_run alone`
  const jobIfs = text.split('\n').filter((l) => /^ {4}if:/.test(stripComment(l)))
  if (jobIfs.length === 0) return 'it has no job-level `if:`'
  const unbounded = jobIfs.filter((l) => !l.includes("github.event.workflow_run.event == 'pull_request'"))

  return unbounded.length === 0 ? null : 'a job does not require `github.event.workflow_run.event == \'pull_request\'`'
}

/** Pure core: the findings for a set of workflow files (file name → text). */
export function checkWatchlist(
  files: Record<string, string>,
  exempt: Record<string, ExemptReason> = EXEMPT,
): string[] {
  const findings: string[] = []
  const alarm = files[ALARM_WORKFLOW]
  if (alarm === undefined) return [`${ALARM_WORKFLOW} is missing: nothing reports a red run on the default branch`]

  let watched: string[]
  try {
    watched = watchedNames(alarm)
  } catch (error) {
    return [`${ALARM_WORKFLOW}: ${(error as Error).message}`]
  }
  if (watched.length === 0) findings.push(`${ALARM_WORKFLOW} watches no workflow`)
  for (const name of new Set(watched.filter((n, i) => watched.indexOf(n) !== i))) {
    findings.push(`${ALARM_WORKFLOW} lists "${name}" twice`)
  }
  if (!/^ {4}branches: \[main\]\s*$/m.test(alarm)) {
    findings.push(`${ALARM_WORKFLOW}: \`on.workflow_run.branches\` must be \`[main]\`, or every pull request run starts it`)
  }

  const nameToFile = new Map<string, string>()
  for (const [file, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = workflowName(text)
    if (name === null) {
      findings.push(`${file} has no top-level \`name:\`; the alarm can only watch a named workflow`)
      continue
    }
    const clash = nameToFile.get(name)
    if (clash) findings.push(`${file} and ${clash} are both named "${name}": the alarm cannot tell them apart`)
    nameToFile.set(name, file)

    const reason = exempt[file]
    const isWatched = watched.includes(name)
    if (reason === undefined) {
      if (!isWatched) {
        findings.push(
          `${file} ("${name}") is not watched: add \`- ${name}\` to \`on.workflow_run.workflows\` in ${ALARM_WORKFLOW}, ` +
            'or exempt it in scripts/check-main-red-watchlist.ts with a reason the gate can verify',
        )
      }
      continue
    }
    if (isWatched) findings.push(`${file} is exempt ("${reason}") and also watched: remove one`)
    try {
      const broken = exemptionHolds(reason, file, text)
      if (broken) findings.push(`${file} is exempt as "${reason}" but ${broken}`)
    } catch (error) {
      findings.push(`${file}: ${(error as Error).message}`)
    }
  }

  for (const name of watched) {
    if (!nameToFile.has(name)) {
      findings.push(`${ALARM_WORKFLOW} watches "${name}", but no workflow file has that \`name:\` (renamed or removed?)`)
    }
  }
  for (const file of Object.keys(exempt)) {
    if (!(file in files)) findings.push(`${file} is exempt but does not exist: remove the entry`)
  }

  return findings
}

export function readWorkflows(dir = WORKFLOWS_DIR): Record<string, string> {
  const files: Record<string, string> = {}
  for (const file of readdirSync(dir)) {
    if (/\.ya?ml$/.test(file)) files[file] = readFileSync(join(dir, file), 'utf8')
  }

  return files
}

function main(): void {
  const files = readWorkflows()
  const findings = checkWatchlist(files)
  if (findings.length === 0) {
    const watched = watchedNames(files[ALARM_WORKFLOW]!).length
    console.log(
      `[check-main-red-watchlist] OK — ${Object.keys(files).length} workflows: ${watched} watched, ${Object.keys(EXEMPT).length} exempt`,
    )

    return
  }
  console.error('[check-main-red-watchlist] a red run of these on the default branch would reach nobody:')
  for (const finding of findings) console.error(`  - ${finding}`)
  process.exit(1)
}

if (isEntry(import.meta.url)) main()
