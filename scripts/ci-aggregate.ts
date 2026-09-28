#!/usr/bin/env bun
/**
 * The required `Test` check: summarizes every aggregated job, then decides.
 *
 * The workflow schedules this job after every dynamic matrix is terminal, so
 * it consumes no runner while useful work is running. GitHub's `needs`
 * results determine the verdict, including matrix failure/cancellation.
 * Every selected matrix must succeed, and every selection must be valid.
 * The jobs API is used only to enrich failures with individual job URLs;
 * healthy runs make no requests and no run polls for API propagation.
 */

export interface JobInfo {
  name: string
  status: string // queued | in_progress | completed | waiting | pending
  conclusion: string | null
  runner_name?: string | null
  html_url?: string | null
}

export type AggregateKind = 'install' | 'preflight' | 'typecheck' | 'test' | 'e2e' | 'scaffold'

/** Which aggregated family a job belongs to, or null when it is not aggregated. */
export function aggregateKind(name: string): AggregateKind | null {
  if (name === 'Install') return 'install'
  if (name === 'Fast Gates') return 'preflight'
  if (name.startsWith('typecheck')) return 'typecheck'
  // Case matters: `Test (browser)` / `Test (fallback)` are NOT test cells.
  if (name.startsWith('test (') || name === 'test') return 'test'
  if (name.startsWith('e2e (') || name === 'e2e') return 'e2e'
  if (name.startsWith('Scaffold Smoke')) return 'scaffold'
  return null
}

export interface Verdict {
  ok: boolean
  lines: string[]
}

export function reproductionCommand(name: string): string | null {
  switch (aggregateKind(name)) {
    case 'preflight':
      return 'bun run validate-fast'
    case 'typecheck':
      return 'bun run typecheck'
    case 'test':
      return 'bun run test'
    case 'e2e': {
      const suite = /^e2e \(([a-zA-Z0-9_-]+)\)$/.exec(name)?.[1]
      if (suite === 'core') return 'bun run test:e2e'
      if (suite === 'atlas-workshop') return 'bun run test:e2e:atlas'
      if (suite === 'atlas-verify-browser') return 'bun run test:e2e:atlas-verify'
      if (suite === 'loom-dev') return 'bun run test:e2e:loom'
      return suite ? `bun run test:e2e:${suite}` : 'open the job log for the failing suite command'
    }
    case 'scaffold':
      return 'bun run scaffold-smoke'
    case 'install':
      return 'bun install --frozen-lockfile'
    default:
      return null
  }
}

function failedJobLine(job: JobInfo): string {
  const log = job.html_url ? ` — job log: ${job.html_url}` : ''
  const command = reproductionCommand(job.name)
  const repro = command ? ` — local: \`${command}\`` : ''
  return `${job.name}: ${job.conclusion ?? job.status}${log}${repro}`
}

/** Encode untrusted API text before putting it in a GitHub workflow command. */
export function workflowCommandValue(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

const MATRIX_NEEDS = [
  ['typecheck-cell', 'typecheck'],
  ['test-cell', 'test'],
  ['e2e-suite', 'e2e'],
  ['scaffold-smoke-cell', 'scaffold'],
] as const

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Validate the actual scheduler results, not an eventually consistent jobs
 * listing. Missing output is an error, never permission to skip validation. */
export function decideNeeds(input: unknown): Verdict {
  const needs = record(input)
  const lines: string[] = []
  for (const [id, label] of [
    ['install', 'Install'],
    ['fast-gates', 'Fast Gates'],
  ] as const) {
    const result = record(needs[id]).result
    if (result !== 'success') lines.push(`${label}: ${String(result ?? 'missing')} — must succeed`)
  }
  if (lines.length) return { ok: false, lines }

  const outputs = record(record(needs.install).outputs)
  for (const [id, family] of MATRIX_NEEDS) {
    const selected = outputs[`${family}-has`]
    let matrix: unknown
    try {
      matrix = JSON.parse(String(outputs[`${family}-matrix`]))
    } catch {
      matrix = null
    }
    const validMatrix =
      Array.isArray(matrix) &&
      matrix.every((entry) => {
        const item = record(entry)
        return (
          typeof item.name === 'string' &&
          item.name.length > 0 &&
          typeof item.members === 'string' &&
          /^[a-zA-Z0-9_-]+(?: [a-zA-Z0-9_-]+)*$/.test(item.members)
        )
      })
    if (
      (selected !== 'true' && selected !== 'false') ||
      !validMatrix ||
      (selected === 'true') !== (Array.isArray(matrix) && matrix.length > 0)
    ) {
      lines.push(`${family}: invalid or contradictory selection outputs`)
      continue
    }
    const result = record(needs[id]).result
    if (result !== 'success' && !(selected === 'false' && result === 'skipped')) {
      lines.push(
        `${family}: ${String(result ?? 'missing')} — ${selected === 'true' ? 'selected matrix must succeed' : 'only an unselected matrix may skip'}`,
      )
    }
  }
  return {
    ok: lines.length === 0,
    lines: lines.length
      ? lines
      : ['Preflight and all selected matrices passed; unselected matrices were correctly skipped.'],
  }
}

/** An API outage cannot change the scheduler's verdict in either direction. */
export async function aggregateWithDiagnostics(
  needs: unknown,
  loadJobs: () => Promise<JobInfo[]>,
): Promise<Verdict> {
  const verdict = decideNeeds(needs)
  if (verdict.ok) return verdict
  try {
    const jobs = await loadJobs()
    for (const job of jobs) {
      if (aggregateKind(job.name) && job.conclusion !== 'success' && job.conclusion !== 'skipped')
        verdict.lines.push(failedJobLine(job))
    }
  } catch {
    verdict.lines.push(
      'Detailed job links unavailable — dependency results still require failure. Open this run for logs.',
    )
  }
  return verdict
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
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res
}

async function listJobs(repo: string, runId: string): Promise<JobInfo[]> {
  const out: JobInfo[] = []
  // One deadline for the entire optional diagnostic lookup, including pages.
  const signal = AbortSignal.timeout(10_000)
  for (let page = 1; page < 20; page++) {
    const res = await gh(
      `/repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100&page=${page}`,
      { signal },
    )
    const body = (await res.json()) as { jobs: JobInfo[]; total_count: number }
    out.push(...body.jobs)
    if (out.length >= body.total_count || body.jobs.length === 0) break
  }
  return out
}

async function main(): Promise<number> {
  const env = (k: string): string => {
    const v = process.env[k]
    if (!v) throw new Error(`[ci-aggregate] missing env ${k}`)
    return v
  }
  const v = await aggregateWithDiagnostics(JSON.parse(env('NEEDS_JSON')), () =>
    listJobs(env('GITHUB_REPOSITORY'), env('GITHUB_RUN_ID')),
  )
  for (const line of v.lines) {
    console.log(
      v.ok ? `  ${line}` : `::error title=Aggregated CI failure::${workflowCommandValue(line)}`,
    )
  }
  console.log(`[ci-aggregate] Test = ${v.ok ? 'success' : 'failure'}`)
  return v.ok ? 0 : 1
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // Missing/malformed scheduler data must never produce a green verdict.
      console.log(`::error::[ci-aggregate] ${workflowCommandValue(String(err))}`)
      process.exit(1)
    },
  )
}
