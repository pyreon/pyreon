// Executes the REAL github-script body of required-check-autoheal.yml against
// mocked GitHub responses. The contract: heal a run only when every
// non-successful job never started (runner not acquired); a genuine failure,
// a mixed run, a second attempt and a superseded SHA must never be retried.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKFLOW = resolve(__dirname, '../../../../../.github/workflows/required-check-autoheal.yml')
const text = readFileSync(WORKFLOW, 'utf8')

function extractScript(): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^\s+script: \|\s*$/.test(l))
  expect(start).toBeGreaterThan(-1)
  const body: string[] = []
  for (const l of lines.slice(start + 1)) {
    if (l.trim() !== '' && !l.startsWith('            ')) break
    body.push(l.slice(12))
  }

  return body.join('\n')
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<void>

const heal = new AsyncFunction('github', 'context', 'core', extractScript())

const NOT_ACQUIRED = 'The job was not acquired by Runner of type hosted even after multiple attempts'
type Job = { id: number; name: string; conclusion: string; steps: unknown[] }
const ok = (id: number, name = 'linux'): Job => ({ id, name, conclusion: 'success', steps: [{}] })
const unstarted = (id: number, name = 'macos'): Job => ({ id, name, conclusion: 'cancelled', steps: [] })
const failed = (id: number, name = 'linux'): Job => ({ id, name, conclusion: 'failure', steps: [{}] })

interface Opts {
  conclusion?: string
  jobs?: Job[]
  annotations?: Record<number, string[]>
  prHead?: string
  runHead?: string
  latestRunId?: number
  prs?: { number: number }[]
}

async function run(o: Opts = {}) {
  const calls = { rerun: 0, comments: [] as string[], jobsListed: 0 }
  const runId = 100
  const payload = {
    workflow_run: {
      id: runId,
      name: 'Native Compiler Validation',
      workflow_id: 7,
      conclusion: o.conclusion ?? 'failure',
      head_sha: o.runHead ?? 'sha1',
      head_branch: 'feat/x',
      html_url: 'https://example.test/run/100',
      pull_requests: o.prs ?? [{ number: 5 }],
    },
  }
  const github = {
    paginate: async (fn: (a: unknown) => Promise<{ data: unknown }>, args: unknown) => {
      const r = (await fn(args)) as { data: unknown }
      return r.data as unknown[]
    },
    rest: {
      pulls: { get: async () => ({ data: { state: 'open', head: { sha: o.prHead ?? 'sha1' } } }) },
      actions: {
        listWorkflowRunsForRepo: async () => ({
          data: { workflow_runs: [{ id: o.latestRunId ?? runId, workflow_id: 7 }] },
        }),
        listJobsForWorkflowRun: async () => {
          calls.jobsListed++
          return { data: o.jobs ?? [] }
        },
        reRunWorkflowFailedJobs: async () => {
          calls.rerun++
        },
      },
      checks: {
        listAnnotations: async (a: { check_run_id: number }) => ({
          data: (o.annotations?.[a.check_run_id] ?? []).map((message) => ({ message })),
        }),
      },
      issues: {
        createComment: async (a: { body: string }) => {
          calls.comments.push(a.body)
        },
      },
    },
  }
  const context = { payload, repo: { owner: 'o', repo: 'r' } }
  const core = { notice() {}, warning() {} }
  await heal(github, context, core)

  return calls
}

describe('required-check-autoheal — workflow shape', () => {
  it('listens to both native workflows and both run conclusions, first attempt only', () => {
    expect(text).toMatch(/- Native Device Build/)
    expect(text).toMatch(/- Native Compiler Validation/)
    expect(text).toMatch(/conclusion == 'failure'/)
    expect(text).toMatch(/run_attempt < 2/)
    expect(text).toMatch(/workflow_run\.event == 'pull_request'/)
  })
})

describe('required-check-autoheal — decision', () => {
  it('heals a failure run whose only bad job never got a runner, and names the cause', async () => {
    const c = await run({ jobs: [ok(1), unstarted(2)], annotations: { 2: [NOT_ACQUIRED] } })
    expect(c.rerun).toBe(1)
    expect(c.comments).toHaveLength(1)
    expect(c.comments[0]).toContain('Native Compiler Validation')
    expect(c.comments[0]).toContain('not acquired by Runner')
    expect(c.comments[0]).toContain('`macos`')
  })

  it('still heals a run that concluded cancelled without listing jobs (original contract)', async () => {
    const c = await run({ conclusion: 'cancelled' })
    expect(c.rerun).toBe(1)
    expect(c.jobsListed).toBe(0)
    expect(c.comments[0]).toContain('cancelled from outside the workflow')
  })

  it('does not heal a genuine failure', async () => {
    const c = await run({ jobs: [failed(1)] })
    expect(c.rerun).toBe(0)
    expect(c.comments).toHaveLength(0)
  })

  it('does not heal a mixed run (one real failure + one not-acquired)', async () => {
    const c = await run({
      jobs: [failed(1), unstarted(2)],
      annotations: { 2: [NOT_ACQUIRED] },
    })
    expect(c.rerun).toBe(0)
  })

  it('does not heal a cancelled job that ran steps', async () => {
    const c = await run({ jobs: [{ id: 2, name: 'macos', conclusion: 'cancelled', steps: [{}] }] })
    expect(c.rerun).toBe(0)
  })

  it('does not heal an unstarted job without the not-acquired annotation', async () => {
    const c = await run({ jobs: [ok(1), unstarted(2)], annotations: { 2: ['Canceled by user'] } })
    expect(c.rerun).toBe(0)
  })

  it('does nothing when a failure run has no non-successful job', async () => {
    const c = await run({ jobs: [ok(1)] })
    expect(c.rerun).toBe(0)
  })

  it('does not heal when the PR head moved on (stale SHA)', async () => {
    const c = await run({
      jobs: [unstarted(2)],
      annotations: { 2: [NOT_ACQUIRED] },
      prHead: 'sha2',
    })
    expect(c.rerun).toBe(0)
  })

  it('does not heal when a newer run exists', async () => {
    const c = await run({
      jobs: [unstarted(2)],
      annotations: { 2: [NOT_ACQUIRED] },
      latestRunId: 101,
    })
    expect(c.rerun).toBe(0)
  })

  it('does not heal a run with no associated PR', async () => {
    const c = await run({ jobs: [unstarted(2)], annotations: { 2: [NOT_ACQUIRED] }, prs: [] })
    expect(c.rerun).toBe(0)
  })
})

// The job-level `if:` decides without a runner. Evaluate the REAL expression:
// translate GitHub's expression syntax to JavaScript (property access on a
// missing array element yields null in GitHub, undefined with `?.` here; both
// are falsy, which is all the expression relies on).
function jobIf(): (wr: Record<string, unknown>) => boolean {
  const line = text.split('\n').find((l) => /^ {4}if: /.test(l))
  expect(line).toBeDefined()
  const js = line!
    .replace(/^ {4}if: /, '')
    .replaceAll('github.event.workflow_run', 'wr')
    .replaceAll('[0].head.sha', '?.[0]?.head?.sha')
    .replaceAll(' == ', ' === ')
    .replaceAll(' != ', ' !== ')

  return new Function('wr', `return Boolean(${js})`) as (wr: Record<string, unknown>) => boolean
}

describe('required-check-autoheal — runner-free skip of superseded runs', () => {
  const base = { conclusion: 'cancelled', event: 'pull_request', run_attempt: 1, head_sha: 'old' }

  it('skips a run whose PR head (from the event payload) is a newer commit', () => {
    expect(jobIf()({ ...base, pull_requests: [{ number: 5, head: { sha: 'new' } }] })).toBe(false)
  })

  it('runs for the current head, and fails safe (runs) when the payload names no PR', () => {
    expect(jobIf()({ ...base, pull_requests: [{ number: 5, head: { sha: 'old' } }] })).toBe(true)
    expect(jobIf()({ ...base, pull_requests: [] })).toBe(true)
    expect(jobIf()({ ...base, conclusion: 'failure', pull_requests: [{ number: 5, head: {} }] })).toBe(true)
  })

  it('keeps the other bounds: success, a non-PR event and a second attempt never run', () => {
    const pr = [{ number: 5, head: { sha: 'old' } }]
    expect(jobIf()({ ...base, conclusion: 'success', pull_requests: pr })).toBe(false)
    expect(jobIf()({ ...base, event: 'push', pull_requests: pr })).toBe(false)
    expect(jobIf()({ ...base, run_attempt: 2, pull_requests: pr })).toBe(false)
  })
})

describe('required-check-autoheal — attempt bound', () => {
  it('is gated off for attempt 2 at the job level', () => {
    // The `if:` expression is the bound; a rerun of a rerun never reaches the script.
    expect(text).toMatch(/if: .*run_attempt < 2/)
  })
})
