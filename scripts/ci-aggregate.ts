#!/usr/bin/env bun
/**
 * The required `Test` check, posted by whichever aggregated job finishes LAST.
 *
 * ## Why this exists
 *
 * `Test` used to be its own job: `needs: [install, typecheck-cell, test-cell,
 * e2e-suite, scaffold-smoke-cell]`, three seconds of shell. On a free-plan org
 * (20 concurrent jobs, shared by every open PR) a job that becomes ready LAST
 * queues behind everything other runs enqueued before it. Measured 2026-09-22
 * on 14 PR runs: once its dependencies had finished, the aggregator waited
 * 0-11 min for a runner on a quiet pool and 56-78 min on a busy one — up to
 * half of a 91-192 min run's wall clock, for a verdict that was already known.
 *
 * So every aggregated job ends with an `always()` step running this script.
 * The one that finds every OTHER aggregated job already complete computes the
 * verdict and posts `Test` through the Checks API. A check run posted with the
 * workflow's GITHUB_TOKEN belongs to the `github-actions` app — the app branch
 * protection binds `Test` to — so no protection change is needed.
 *
 * ## Why it cannot weaken the gate
 *
 * - An ABSENT `Test` blocks the merge ("Expected"), exactly like a pending one.
 * - Two jobs finishing in the same instant each see the other still running
 *   and neither posts. The `Test (fallback)` job (the old aggregator, renamed)
 *   still runs after everything with `--force` and posts the same verdict, so
 *   the worst case is today's behaviour, never a missing or wrong verdict.
 * - The rules below are the aggregator's rules, moved rather than rewritten:
 *   Install must succeed; every other aggregated job must be success or
 *   skipped; when e2e suites were selected, the e2e jobs must SUCCEED.
 */

export interface JobInfo {
  name: string
  status: string // queued | in_progress | completed | waiting | pending
  conclusion: string | null
  runner_name?: string | null
}

export type AggregateKind = 'install' | 'typecheck' | 'test' | 'e2e' | 'scaffold'

/** Which aggregated family a job belongs to, or null when it is not aggregated. */
export function aggregateKind(name: string): AggregateKind | null {
  if (name === 'Install') return 'install'
  if (name.startsWith('typecheck')) return 'typecheck'
  // Case matters: `Test (browser)` / `Test (fallback)` are NOT test cells.
  if (name.startsWith('test (') || name === 'test') return 'test'
  if (name.startsWith('e2e (') || name === 'e2e') return 'e2e'
  if (name.startsWith('Scaffold Smoke')) return 'scaffold'
  return null
}

export interface Verdict {
  /** False when another aggregated job is still unfinished — do not post. */
  last: boolean
  ok: boolean
  lines: string[]
}

/**
 * Decide from the run's job list. `self` is the job running this script (it is
 * still `in_progress` while doing so); pass null from a job outside the set.
 */
export function decideAggregate(
  jobs: readonly JobInfo[],
  self: JobInfo | null,
  opts: { e2eSelected: boolean },
): Verdict {
  const members = jobs.filter((j) => aggregateKind(j.name) !== null)
  const others = members.filter((j) => j !== self)
  const pending = others.filter((j) => j.status !== 'completed')
  const lines: string[] = []
  if (pending.length > 0) {
    return { last: false, ok: false, lines: pending.map((j) => `still running: ${j.name} (${j.status})`) }
  }
  // `self` has not reported a conclusion yet; the step runs with `always()`,
  // so its job's own outcome is passed in as SELF_OUTCOME by the caller.
  let ok = true
  const install = members.filter((j) => aggregateKind(j.name) === 'install')
  if (install.length === 0 || install.some((j) => j.conclusion !== 'success')) {
    lines.push(`Install did not succeed (${install.map((j) => j.conclusion).join(',') || 'missing'}) — cell selection is unknown`)
    ok = false
  }
  for (const j of members) {
    const kind = aggregateKind(j.name)
    if (kind === 'install') continue
    const c = j.conclusion
    if (kind === 'e2e' && opts.e2eSelected) {
      if (c !== 'success') {
        lines.push(`${j.name}: ${c} — e2e suites were selected, so they must succeed`)
        ok = false
      }
    } else if (c !== 'success' && c !== 'skipped') {
      lines.push(`${j.name}: ${c}`)
      ok = false
    }
  }
  if (opts.e2eSelected && !members.some((j) => aggregateKind(j.name) === 'e2e')) {
    lines.push('e2e suites were selected but no e2e job ran')
    ok = false
  }
  if (ok) lines.push(`All ${members.length} aggregated jobs passed (or were correctly skipped).`)
  return { last: true, ok, lines }
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res
}

async function listJobs(repo: string, runId: string): Promise<JobInfo[]> {
  const out: JobInfo[] = []
  for (let page = 1; page < 20; page++) {
    const res = await gh(`/repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`)
    const body = (await res.json()) as { jobs: JobInfo[]; total_count: number }
    out.push(...body.jobs)
    if (out.length >= body.total_count || body.jobs.length === 0) break
  }
  return out
}

async function main(): Promise<number> {
  const force = process.argv.includes('--force')
  const env = (k: string): string => {
    const v = process.env[k]
    if (!v) throw new Error(`[ci-aggregate] missing env ${k}`)
    return v
  }
  const repo = env('GITHUB_REPOSITORY')
  const runId = env('GITHUB_RUN_ID')
  const headSha = env('HEAD_SHA')
  const e2eSelected = process.env.E2E_SELECTED === 'true'
  const jobs = await listJobs(repo, runId)

  let self: JobInfo | null = null
  if (!force) {
    const runner = process.env.RUNNER_NAME
    const mine = jobs.filter((j) => j.status === 'in_progress' && j.runner_name === runner)
    self = mine.find((j) => aggregateKind(j.name) !== null) ?? null
    if (!self) {
      console.log(`[ci-aggregate] could not identify this job (runner ${runner}); leaving Test to the fallback`)
      return 0
    }
    // This job's own outcome, which the API cannot report while it runs.
    self = { ...self, status: 'completed', conclusion: process.env.SELF_OUTCOME ?? 'failure' }
  }
  const list = self ? jobs.map((j) => (j.runner_name === self!.runner_name && j.status === 'in_progress' ? self! : j)) : jobs
  const v = decideAggregate(list, self, { e2eSelected })
  for (const l of v.lines) console.log('  ' + l)
  if (!v.last && !force) {
    console.log('[ci-aggregate] not the last aggregated job — Test is posted by whichever finishes last')
    return 0
  }
  if (process.env.NO_POST === '1') {
    console.log(`[ci-aggregate] verdict ${v.ok ? 'success' : 'failure'} (not posting: NO_POST=1)`)
    return v.ok ? 0 : 1
  }
  await gh(`/repos/${repo}/check-runs`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test',
      head_sha: headSha,
      status: 'completed',
      conclusion: v.ok ? 'success' : 'failure',
      details_url: `https://github.com/${repo}/actions/runs/${runId}`,
      output: {
        title: v.ok ? 'All aggregated CI jobs passed' : 'Aggregated CI jobs failed',
        summary: v.lines.join('\n'),
      },
    }),
  })
  console.log(`[ci-aggregate] posted Test = ${v.ok ? 'success' : 'failure'} on ${headSha}`)
  // The poster reports the verdict in its own check as well only in --force
  // mode (the fallback job); a cell must not fail because a SIBLING failed.
  return force && !v.ok ? 1 : 0
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // Never fail a cell over a posting problem: an absent Test blocks the
      // merge, and the fallback job re-derives and posts it.
      console.log(`::warning::[ci-aggregate] ${String(err)}`)
      process.exit(process.argv.includes('--force') ? 1 : 0)
    },
  )
}
