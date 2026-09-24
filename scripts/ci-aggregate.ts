#!/usr/bin/env bun
/**
 * The required `Test` check: waits for every aggregated job, then decides.
 *
 * ## Why it WAITS instead of being scheduled last
 *
 * `Test` used to be a job that `needs:` every matrix — three seconds of shell
 * that became READY last, so on a busy free-plan pool it queued behind
 * everything other PRs had enqueued: measured 2026-09-22, 56-78 min AFTER its
 * dependencies had finished. So the job now `needs: install` only, starts
 * alongside the cells, and polls this run's job list until every aggregated
 * job is complete. It still reports its OWN conclusion as the check, so it
 * needs nothing beyond `actions: read`.
 *
 * ## Why not "the last cell posts `Test`" (the version this replaced)
 *
 * That shipped first (#3573) and was faster still, but it gave every cell
 * `checks: write` — and cells run repo tests and npm dependencies. A token
 * that can create check runs can create ANY check name bound to the
 * github-actions app, i.e. nearly every required check (`Build`, `Install`,
 * `Fast Gates`, the device lanes…). A compromised dependency executing in a
 * test cell could then forge merge-gating checks, where before it could at
 * most fake its own job's result. OpenSSF Scorecard flagged all six grants
 * (TokenPermissionsID); least privilege wins over the remaining minutes.
 *
 * ## Poll budget
 *
 * GITHUB_TOKEN is limited to 1,000 API requests/hour PER REPOSITORY, shared by
 * every workflow. One request per poll (`per_page=100` covers the run's ~30
 * jobs), every 90 s: ~40/hour per in-flight run.
 *
 * The rules are the old aggregator's, unchanged: Install must succeed; every
 * other aggregated job must be success or skipped; when e2e suites were
 * selected, the e2e jobs must SUCCEED.
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

const POLL_MS = 90_000

async function main(): Promise<number> {
  const env = (k: string): string => {
    const v = process.env[k]
    if (!v) throw new Error(`[ci-aggregate] missing env ${k}`)
    return v
  }
  const repo = env('GITHUB_REPOSITORY')
  const runId = env('GITHUB_RUN_ID')
  const e2eSelected = process.env.E2E_SELECTED === 'true'
  let lastPending = ''
  let apiFailures = 0
  for (;;) {
    let jobs: JobInfo[]
    try {
      jobs = await listJobs(repo, runId)
      apiFailures = 0
    } catch (err) {
      // A transient 5xx must not turn a green run red; five in a row (~7 min)
      // is an outage, and then failing closed is right.
      if (++apiFailures >= 5) throw err
      console.log(`::warning::[ci-aggregate] listing jobs failed (${apiFailures}/5): ${String(err)}`)
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    const v = decideAggregate(jobs, null, { e2eSelected })
    if (v.last) {
      for (const l of v.lines) console.log('  ' + l)
      console.log(`[ci-aggregate] Test = ${v.ok ? 'success' : 'failure'}`)
      return v.ok ? 0 : 1
    }
    const pending = v.lines.join('\n')
    if (pending !== lastPending) {
      console.log(`[ci-aggregate] waiting (${new Date().toISOString()}):\n  ${v.lines.join('\n  ')}`)
      lastPending = pending
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // An API error must FAIL the check (fail-closed): a green `Test` that
      // never saw the cells would be the worst outcome.
      console.log(`::error::[ci-aggregate] ${String(err)}`)
      process.exit(1)
    },
  )
}
