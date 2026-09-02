#!/usr/bin/env bun
/**
 * Cancel in-flight CI for pull requests that CANNOT MERGE (conflicting).
 *
 * ## Why
 *
 * GitHub already refuses to DISPATCH a `pull_request` workflow for a
 * conflicting PR — those workflows run against `refs/pull/N/merge`, and when
 * that merge commit cannot be built nothing is queued at all (the
 * "checks never started" shape in `.claude/rules/anti-patterns.md`). What it
 * does NOT do is stop a run that was already in flight when a merge to main
 * created the conflict. That run tests `old-main + head`; the PR cannot merge
 * on it, and resolving the conflict requires a push, which dispatches a fresh
 * run against the new merge ref. So the in-flight work is superseded the
 * moment the conflict appears.
 *
 * Measured 2026-09-02 on this repo: 58 of 60 open PRs were conflicting, and
 * **169 of 254 in-flight runs (66%) belonged to them** — a sampled ~189 jobs
 * queued or running for PRs that could not merge, against an org-wide cap of
 * 20 concurrent jobs. That is the queue, essentially in full. Every one of
 * those slots is one a mergeable PR is waiting behind.
 *
 * ## Fail-safe direction
 *
 * This script CANCELS work, so every uncertainty must resolve to "cancel
 * nothing":
 *
 *   - A PR is cancelled against only on a DEFINITIVE `CONFLICTING`. GitHub
 *     computes mergeability lazily and answers `UNKNOWN` while it does — most
 *     visibly right after a push to the base branch, which is exactly when
 *     this runs. `UNKNOWN` is never treated as conflicting; the caller polls
 *     and anything still unknown is skipped.
 *   - A failed or empty PR listing aborts with a non-zero exit rather than
 *     proceeding with an empty conflict set (an empty result must never be
 *     read as "nothing to do" — see
 *     `feedback_watcher_that_gates_an_irreversible_action_must_fail_closed`).
 *   - Only runs whose `head_sha` is in the conflicting set are touched, so a
 *     run on `main`, a release run, or a mergeable PR's run can never match.
 *
 * The cost of a wrong cancel is one CI round on a PR that was going to need
 * one anyway; the cost of a wrong skip is nothing. That asymmetry is why the
 * checks lean this way and not the other.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'

export interface PullRequest {
  number: number
  /** GitHub's computed mergeability. Only `CONFLICTING` is actionable. */
  mergeable: Mergeable
  /** The PR's head commit — what a `pull_request` run reports as `head_sha`. */
  headSha: string
}

export interface WorkflowRun {
  id: number
  headSha: string
  /** Workflow name, for the summary only. */
  name: string
}

export interface Cancellation {
  runId: number
  prNumber: number
  workflow: string
}

/**
 * Pick the runs to cancel: those whose head commit belongs to a PR GitHub has
 * DEFINITIVELY reported as conflicting.
 *
 * Pure — unit-tested. Note what is deliberately absent: there is no branch for
 * `UNKNOWN`, and no fallback that treats a PR missing from the list as
 * anything. A run only ever gets cancelled by being positively matched.
 */
export function selectRunsToCancel(
  prs: readonly PullRequest[],
  runs: readonly WorkflowRun[],
): Cancellation[] {
  const conflicting = new Map<string, number>()
  for (const pr of prs) {
    if (pr.mergeable !== 'CONFLICTING') continue
    // A head sha maps to at most one open PR in practice; if two PRs somehow
    // share one, either number is a truthful attribution for the summary.
    conflicting.set(pr.headSha, pr.number)
  }
  const out: Cancellation[] = []
  for (const run of runs) {
    const prNumber = conflicting.get(run.headSha)
    if (prNumber === undefined) continue
    out.push({ runId: run.id, prNumber, workflow: run.name })
  }
  return out.sort((a, b) => b.prNumber - a.prNumber || a.runId - b.runId)
}

/** Group cancellations per PR, for a readable summary. */
export function summarize(cancellations: readonly Cancellation[]): string[] {
  const byPr = new Map<number, string[]>()
  for (const c of cancellations) {
    const list = byPr.get(c.prNumber) ?? []
    list.push(c.workflow)
    byPr.set(c.prNumber, list)
  }
  return [...byPr.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([pr, workflows]) => `#${pr}: ${workflows.sort().join(', ')}`)
}

// ─── I/O ───────────────────────────────────────────────────────────────────

const REPO = process.env.GITHUB_REPOSITORY ?? 'pyreon/pyreon'
const DRY_RUN = process.argv.includes('--dry-run')
/** How many times to re-ask GitHub for a mergeability it hasn't computed yet. */
const MERGEABILITY_ROUNDS = Number(process.env.PYREON_MERGEABILITY_ROUNDS ?? 4)
const ROUND_DELAY_MS = Number(process.env.PYREON_MERGEABILITY_DELAY_MS ?? 5000)

// node:child_process, not `Bun.spawn` — this module is IMPORTED by
// `@pyreon/test-utils`' unit test for the pure selector, and that package
// typechecks without bun types in scope (`error TS2868: Cannot find name
// 'Bun'`). Every sibling CI script here is written against node APIs for the
// same reason; the runtime is still bun.
function ghRaw(args: string[]): string {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      // The paginated run listing is ~250 short JSON lines today, but a busy
      // repo can multiply that; the 1 MB default would truncate silently.
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (err) {
    const e = err as { status?: number; stderr?: string }
    throw new Error(
      `gh ${args.slice(0, 2).join(' ')} failed (${e.status ?? '?'}): ${(e.stderr ?? '').trim()}`,
    )
  }
}

function gh<T>(args: string[]): T {
  return JSON.parse(ghRaw(args)) as T
}

/**
 * `gh api --paginate` concatenates one JSON OBJECT per page — valid JSONL, not
 * a JSON array — so `JSON.parse` on the whole stdout throws the moment a
 * listing spans two pages. (Found by the dry run: 82 open PRs, ~250 in-flight
 * runs, three pages.) Ask for a `--jq` projection instead and read the result
 * line by line, which is page-count independent.
 */
function ghJsonLines<T>(args: string[]): T[] {
  return ghRaw(args)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T)
}

/**
 * Ask for each open PR's mergeability, re-asking for the ones GitHub has not
 * finished computing. Requesting the field is itself what triggers the
 * computation, so a second pass usually resolves what the first could not.
 */
async function resolveMergeability(numbers: readonly number[]): Promise<PullRequest[]> {
  const resolved = new Map<number, PullRequest>()
  let pending = [...numbers]
  for (let round = 0; round < MERGEABILITY_ROUNDS && pending.length > 0; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, ROUND_DELAY_MS))
    const stillPending: number[] = []
    for (const n of pending) {
      try {
        const pr = gh<{ number: number; mergeable: Mergeable; headRefOid: string }>([
          'pr',
          'view',
          String(n),
          '--repo',
          REPO,
          '--json',
          'number,mergeable,headRefOid',
        ])
        if (pr.mergeable === 'UNKNOWN') stillPending.push(n)
        else resolved.set(n, { number: n, mergeable: pr.mergeable, headSha: pr.headRefOid })
      } catch {
        // A per-PR failure must not widen the blast radius: skip it. It stays
        // out of `resolved`, so nothing of its is ever cancelled.
        stillPending.push(n)
      }
    }
    pending = stillPending
  }
  if (pending.length > 0) {
    console.log(
      `  mergeability still UNKNOWN for ${pending.length} PR(s) after ${MERGEABILITY_ROUNDS} round(s) — skipped (never treated as conflicting): ${pending.join(', ')}`,
    )
  }
  return [...resolved.values()]
}

async function main(): Promise<void> {
  const open = gh<Array<{ number: number }>>([
    'pr',
    'list',
    '--repo',
    REPO,
    '--state',
    'open',
    '--limit',
    '200',
    '--json',
    'number',
  ])
  if (open.length === 0) {
    // Distinguish "no open PRs" from "the query failed": the throw above
    // covers failure, so an empty list here is genuine.
    console.log('[cancel-conflicting-ci] no open PRs — nothing to do.')
    return
  }
  console.log(`[cancel-conflicting-ci] ${open.length} open PR(s); resolving mergeability…`)
  const prs = await resolveMergeability(open.map((p) => p.number))
  const conflicting = prs.filter((p) => p.mergeable === 'CONFLICTING')
  console.log(
    `  ${conflicting.length} conflicting, ${prs.length - conflicting.length} mergeable (of ${prs.length} resolved)`,
  )
  if (conflicting.length === 0) {
    console.log('[cancel-conflicting-ci] nothing conflicting — no runs cancelled.')
    return
  }

  const runs: WorkflowRun[] = []
  for (const status of ['in_progress', 'queued'] as const) {
    const rows = ghJsonLines<{ id: number; head_sha: string; name: string }>([
      'api',
      '--paginate',
      `repos/${REPO}/actions/runs?status=${status}&per_page=100`,
      '--jq',
      '.workflow_runs[] | {id, head_sha, name}',
    ])
    for (const r of rows) runs.push({ id: r.id, headSha: r.head_sha, name: r.name })
  }

  const cancellations = selectRunsToCancel(prs, runs)
  if (cancellations.length === 0) {
    console.log(
      `[cancel-conflicting-ci] ${conflicting.length} conflicting PR(s), but none has an in-flight run — nothing to cancel.`,
    )
    return
  }

  console.log(
    `[cancel-conflicting-ci] cancelling ${cancellations.length} run(s) across ${new Set(cancellations.map((c) => c.prNumber)).size} conflicting PR(s)${DRY_RUN ? ' (DRY RUN)' : ''}:`,
  )
  for (const line of summarize(cancellations)) console.log(`  ${line}`)

  let cancelled = 0
  if (!DRY_RUN) {
    for (const c of cancellations) {
      try {
        gh<unknown>([
          'api',
          '--method',
          'POST',
          `repos/${REPO}/actions/runs/${c.runId}/cancel`,
        ])
        cancelled++
      } catch (err) {
        // A run that completed between the listing and the cancel returns 409.
        // That is the expected race, not a failure of this job.
        console.log(`  (run ${c.runId} could not be cancelled — ${(err as Error).message.slice(0, 80)})`)
      }
    }
  }

  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) {
    const lines = [
      `### Cancelled CI on ${new Set(cancellations.map((c) => c.prNumber)).size} conflicting PR(s)`,
      '',
      `${cancelled} run(s) cancelled. A conflicting PR cannot merge, and resolving the conflict pushes a new commit that dispatches a fresh run — so the in-flight work was already superseded.`,
      '',
      ...summarize(cancellations).map((l) => `- ${l}`),
    ]
    appendFileSync(summary, `${lines.join('\n')}\n`)
  }
  console.log(`[cancel-conflicting-ci] done — ${cancelled} run(s) cancelled.`)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[cancel-conflicting-ci] FAILED: ${(err as Error).message}`)
    process.exit(1)
  })
}
