// Executes the REAL github-script body of main-red-status.yml against mocked
// GitHub responses. The contract: one sticky issue per workflow, opened when
// the newest run with a verdict on the default branch is red, one comment per
// further red commit, closed on the next green run. Superseded, skipped and
// in-progress runs carry no verdict; a job cancelled at its own timeout is red.
//
// The recorded shapes are GitHub's: a run superseded while pending has only
// skipped jobs (run 43990147998), and a job that hit `timeout-minutes` reports
// `cancelled` with the annotation below while the run reads `cancelled` too
// (run 42224030939, job 127913036939).

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKFLOW = resolve(__dirname, '../../../../../.github/workflows/main-red-status.yml')
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

const notify = new AsyncFunction('github', 'context', 'core', extractScript())

const DEADLINE = 'The job has exceeded the maximum execution time of 35m0s'

interface Step {
  name: string
  conclusion: string
}
interface Job {
  id: number
  name: string
  conclusion: string
  steps: Step[]
  html_url: string
}
interface Run {
  id: number
  run_number: number
  name: string
  workflow_id: number
  status: string
  conclusion: string | null
  event: string
  head_sha: string
  head_branch: string
  html_url: string
  head_commit: { message: string }
}
interface Issue {
  number: number
  title: string
  body: string
  state: string
  pull_request?: unknown
}

let nextJobId = 1000
const job = (name: string, conclusion: string, steps: Step[] = [{ name: 'Run', conclusion }]): Job => ({
  id: nextJobId++,
  name,
  conclusion,
  steps,
  html_url: `https://example.test/job/${name.replaceAll(' ', '-')}`,
})

/** A run of the watched workflow on the default branch. `n` orders them: higher is newer. */
function runOf(n: number, conclusion: string | null, extra: Partial<Run> = {}): Run {
  return {
    id: 5000 + n,
    run_number: n,
    name: 'CI (main)',
    workflow_id: 7,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    event: 'push',
    head_sha: `${String(n).padStart(4, '0')}abcdef0123456789`,
    head_branch: 'main',
    html_url: `https://example.test/run/${n}`,
    head_commit: { message: `commit ${n} (#${n})\n\nbody` },
    ...extra,
  }
}

interface World {
  /** The run whose completion fired the event. */
  trigger: Run
  /** What the run listing returns (newest first, as the API does). May omit the trigger: the listing lags. */
  history?: Run[]
  jobs?: Record<number, Job[]>
  annotations?: Record<number, string[]>
  issues?: Issue[]
  comments?: Record<number, string[]>
}

async function fire(world: World) {
  const issues: Issue[] = world.issues ?? []
  const comments: Record<number, string[]> = world.comments ?? {}
  const created: Issue[] = []
  const posted: Array<{ issue: number; body: string }> = []
  const closed: number[] = []
  const listArgs: Array<Record<string, unknown>> = []
  const github = {
    paginate: async (fn: (a: unknown) => Promise<{ data: unknown }>, args: unknown) => {
      const r = await fn(args)
      const data = r.data as { jobs?: unknown[] } | unknown[]

      return Array.isArray(data) ? data : (data.jobs ?? [])
    },
    rest: {
      actions: {
        listWorkflowRuns: async (a: Record<string, unknown>) => {
          listArgs.push(a)

          return { data: { workflow_runs: world.history ?? [] } }
        },
        listJobsForWorkflowRun: async (a: { run_id: number }) => ({ data: { jobs: world.jobs?.[a.run_id] ?? [] } }),
      },
      checks: {
        listAnnotations: async (a: { check_run_id: number }) => ({
          data: (world.annotations?.[a.check_run_id] ?? []).map((message) => ({ message })),
        }),
      },
      issues: {
        listForRepo: async (a: { state: string; creator: string }) => {
          expect(a.state).toBe('open')
          expect(a.creator).toBe('github-actions[bot]')

          return { data: issues.filter((i) => i.state === 'open') }
        },
        listComments: async (a: { issue_number: number }) => ({
          data: (comments[a.issue_number] ?? []).map((body) => ({ body })),
        }),
        create: async (a: { title: string; body: string }) => {
          const issue = { number: 900 + created.length, title: a.title, body: a.body, state: 'open' }
          created.push(issue)
          issues.push(issue)
        },
        createComment: async (a: { issue_number: number; body: string }) => {
          posted.push({ issue: a.issue_number, body: a.body })
          comments[a.issue_number] = [...(comments[a.issue_number] ?? []), a.body]
        },
        update: async (a: { issue_number: number; state: string }) => {
          expect(a.state).toBe('closed')
          closed.push(a.issue_number)
          const issue = issues.find((i) => i.number === a.issue_number)
          if (issue) issue.state = 'closed'
        },
      },
    },
  }
  const context = {
    payload: { workflow_run: world.trigger, repository: { default_branch: 'main' } },
    repo: { owner: 'o', repo: 'r' },
  }
  const core = { info() {}, notice() {}, warning() {} }
  await notify(github, context, core)

  return { created, posted, closed, listArgs, issues, comments }
}

const sha9 = (n: number) => runOf(n, 'success').head_sha.slice(0, 9)

describe('main-red-status — workflow shape', () => {
  it('runs only for default-branch runs that are not pull requests and not skipped', () => {
    expect(text).toMatch(/^ {4}branches: \[main\]$/m)
    expect(text).toMatch(/head_branch == github\.event\.repository\.default_branch/)
    expect(text).toMatch(/workflow_run\.event != 'pull_request'/)
    expect(text).toMatch(/workflow_run\.conclusion != 'skipped'/)
  })

  it('holds exactly the permissions it uses and never cancels an evaluation', () => {
    expect(text).toMatch(/^permissions: \{\}$/m)
    expect(text).toMatch(/actions: read/)
    expect(text).toMatch(/checks: read/)
    expect(text).toMatch(/issues: write/)
    expect(text).not.toMatch(/contents: write|pull-requests: write|actions: write/)
    expect(text).toMatch(/cancel-in-progress: false/)
  })
})

describe('main-red-status — a red run', () => {
  it('opens ONE issue naming the workflow, job, failed step, first red and last green commit', async () => {
    const trigger = runOf(12, 'failure')
    const w = await fire({
      trigger,
      history: [trigger, runOf(11, 'cancelled'), runOf(10, 'failure'), runOf(9, 'success'), runOf(8, 'failure')],
      jobs: {
        [trigger.id]: [
          job('Coverage (Full)', 'failure', [
            { name: 'Set up job', conclusion: 'success' },
            { name: 'Run full per-package coverage', conclusion: 'failure' },
            { name: 'Upload log', conclusion: 'success' },
          ]),
          job('Coverage (Native)', 'success'),
        ],
      },
    })
    expect(w.created).toHaveLength(1)
    expect(w.posted).toHaveLength(0)
    const issue = w.created[0]!
    expect(issue.title).toBe('[main] CI (main) is red')
    expect(issue.body).toContain(`First red commit: \`${sha9(10)}\` \`commit 10 (#10)\` — https://example.test/run/10`)
    expect(issue.body).toContain(`Last green commit: \`${sha9(9)}\` \`commit 9 (#9)\` — https://example.test/run/9`)
    expect(issue.body).toContain(`/compare/${runOf(9, 'success').head_sha}...${runOf(10, 'failure').head_sha}`)
    expect(issue.body).toContain(`Red on \`${sha9(12)}\``)
    expect(issue.body).toContain('job **Coverage (Full)**: failure, step `Run full per-package coverage`')
    expect(issue.body).not.toContain('Coverage (Native)')
    expect(issue.body).not.toContain('Upload log')
    // Both red commits are recorded, so neither gets a comment later.
    expect(issue.body).toContain(`<!-- main-red:${runOf(10, 'failure').head_sha} -->`)
    expect(issue.body).toContain(`<!-- main-red:${trigger.head_sha} -->`)
    // The history query is the workflow's own runs on the default branch.
    expect(w.listArgs[0]).toMatchObject({ workflow_id: 7, branch: 'main' })
  })

  it('adds one comment per new red commit, and none when the commit is already named', async () => {
    const first = runOf(10, 'failure')
    const opened = await fire({ trigger: first, history: [first, runOf(9, 'success')] })
    expect(opened.created).toHaveLength(1)

    const second = runOf(11, 'failure')
    const world = {
      history: [second, first, runOf(9, 'success')],
      issues: opened.issues,
      comments: opened.comments,
      jobs: { [second.id]: [job('Fast Gates', 'failure', [{ name: 'Lint Ratchet', conclusion: 'failure' }])] },
    }
    const again = await fire({ trigger: second, ...world })
    expect(again.created).toHaveLength(0)
    expect(again.posted).toHaveLength(1)
    expect(again.posted[0]!.body).toContain(`Red on \`${sha9(11)}\``)
    expect(again.posted[0]!.body).toContain('job **Fast Gates**: failure, step `Lint Ratchet`')

    // The same commit fails again (a re-run, or a schedule on the same commit): nothing new to say.
    const rerun = await fire({ trigger: second, ...world })
    expect(rerun.created).toHaveLength(0)
    expect(rerun.posted).toHaveLength(0)
    expect(rerun.closed).toHaveLength(0)
  })

  it('names a red commit whose own event was lost, when a later event arrives', async () => {
    const opened = await fire({ trigger: runOf(10, 'failure'), history: [runOf(9, 'success')] })
    const latest = runOf(12, 'failure')
    const w = await fire({
      trigger: latest,
      history: [latest, runOf(11, 'failure'), runOf(10, 'failure'), runOf(9, 'success')],
      issues: opened.issues,
      comments: opened.comments,
    })
    expect(w.posted.map((p) => p.body.split('\n')[0])).toEqual([
      expect.stringContaining(sha9(11)),
      expect.stringContaining(sha9(12)),
    ])
  })

  it('says so when no green run is in the history', async () => {
    const trigger = runOf(3, 'failure')
    const w = await fire({ trigger, history: [trigger, runOf(2, 'failure'), runOf(1, 'timed_out')] })
    expect(w.created[0]!.body).toContain(`First red commit: \`${sha9(1)}\``)
    expect(w.created[0]!.body).toContain('Last green commit: none among the last 100 runs')
    expect(w.created[0]!.body).not.toContain('/compare/')
  })

  it('counts a workflow file that could not start', async () => {
    const trigger = runOf(5, 'startup_failure')
    const w = await fire({ trigger, history: [trigger, runOf(4, 'success')] })
    expect(w.created).toHaveLength(1)
    expect(w.created[0]!.body).toContain('no job reported a failure (run conclusion `startup_failure`)')
  })

  it('names a job that never got a runner inside a failed run', async () => {
    const trigger = runOf(5, 'failure')
    const w = await fire({
      trigger,
      history: [trigger, runOf(4, 'success')],
      jobs: { [trigger.id]: [job('macOS typecheck', 'cancelled', []), job('Linux', 'success')] },
    })
    expect(w.created[0]!.body).toContain('job **macOS typecheck**: cancelled before any step ran (no runner was assigned)')
  })

  it('keeps a commit subject from mentioning anyone or breaking the code span', async () => {
    const trigger = runOf(5, 'failure', { head_commit: { message: 'fix: thanks @someone for `x`' } })
    const w = await fire({ trigger, history: [trigger] })
    expect(w.created[0]!.body).toContain("`fix: thanks @someone for 'x'`")
  })
})

describe('main-red-status — runs that carry no verdict', () => {
  it('a run cancelled because a newer push superseded it neither opens nor closes', async () => {
    const trigger = runOf(12, 'cancelled')
    const superseded = { [trigger.id]: [job('Coverage (Full)', 'skipped', [])] }
    // Newest verdict behind it is green: no issue.
    const quiet = await fire({ trigger, history: [trigger, runOf(11, 'success')], jobs: superseded })
    expect(quiet.created).toHaveLength(0)

    // Newest verdict behind it is red and the issue is open: it stays open, with no new comment.
    const red = runOf(11, 'failure')
    const opened = await fire({ trigger: red, history: [red, runOf(10, 'success')] })
    const still = await fire({
      trigger,
      history: [trigger, red, runOf(10, 'success')],
      jobs: superseded,
      issues: opened.issues,
      comments: opened.comments,
    })
    expect(still.closed).toHaveLength(0)
    expect(still.posted).toHaveLength(0)
    expect(still.created).toHaveLength(0)
  })

  it('a run cancelled by hand mid-flight is not a failure', async () => {
    const trigger = runOf(12, 'cancelled')
    const w = await fire({
      trigger,
      history: [trigger, runOf(11, 'success')],
      jobs: { [trigger.id]: [job('Build', 'cancelled', [{ name: 'Verify Modes', conclusion: 'cancelled' }])] },
      annotations: {},
    })
    expect(w.created).toHaveLength(0)
  })

  it('a job cancelled at its own timeout IS a failure, and the step in flight is named', async () => {
    const trigger = runOf(12, 'cancelled')
    const timedOut = job('Coverage (Full)', 'cancelled', [
      { name: 'Set up job', conclusion: 'success' },
      { name: 'Run full per-package coverage', conclusion: 'cancelled' },
    ])
    const w = await fire({
      trigger,
      history: [trigger, runOf(11, 'success')],
      jobs: { [trigger.id]: [timedOut] },
      annotations: { [timedOut.id]: [DEADLINE, 'The operation was canceled.'] },
    })
    expect(w.created).toHaveLength(1)
    expect(w.created[0]!.body).toContain(
      'job **Coverage (Full)**: cancelled at its `timeout-minutes`, step `Run full per-package coverage`',
    )
  })

  it('an earlier timeout keeps the issue open when a superseded run completes after it', async () => {
    const deadline = runOf(11, 'cancelled')
    const timedOut = job('Coverage (Full)', 'cancelled', [{ name: 'Run', conclusion: 'cancelled' }])
    const jobs = { [deadline.id]: [timedOut] }
    const annotations = { [timedOut.id]: [DEADLINE] }
    const opened = await fire({ trigger: deadline, history: [deadline, runOf(10, 'success')], jobs, annotations })
    expect(opened.created).toHaveLength(1)

    const superseded = runOf(12, 'cancelled')
    const w = await fire({
      trigger: superseded,
      history: [superseded, deadline, runOf(10, 'success')],
      jobs,
      annotations,
      issues: opened.issues,
      comments: opened.comments,
    })
    expect(w.closed).toHaveLength(0)
  })

  it('an in-progress newer run does not hide a red older one', async () => {
    const trigger = runOf(11, 'failure')
    const w = await fire({ trigger, history: [runOf(12, null), trigger, runOf(10, 'success')] })
    expect(w.created).toHaveLength(1)
  })

  it('a workflow with no verdict at all does nothing', async () => {
    const trigger = runOf(2, 'cancelled')
    const w = await fire({ trigger, history: [trigger, runOf(1, 'skipped')] })
    expect(w.created).toHaveLength(0)
    expect(w.closed).toHaveLength(0)
  })
})

describe('main-red-status — a green run', () => {
  it('closes the open issue with a comment naming the green commit', async () => {
    const red = runOf(10, 'failure')
    const opened = await fire({ trigger: red, history: [red, runOf(9, 'success')] })
    const green = runOf(11, 'success')
    const w = await fire({ trigger: green, history: [green, red], issues: opened.issues, comments: opened.comments })
    expect(w.closed).toEqual([opened.created[0]!.number])
    expect(w.posted).toHaveLength(1)
    expect(w.posted[0]!.body).toContain(`Green again on \`${sha9(11)}\`: https://example.test/run/11`)
    expect(w.created).toHaveLength(0)
  })

  it('does nothing when no issue is open', async () => {
    const green = runOf(11, 'success')
    const w = await fire({ trigger: green, history: [green, runOf(10, 'failure')] })
    expect(w.created).toHaveLength(0)
    expect(w.posted).toHaveLength(0)
    expect(w.closed).toHaveLength(0)
  })

  it('a re-run that turns the red commit green closes it (the listing may still show the old conclusion)', async () => {
    const red = runOf(10, 'failure')
    const opened = await fire({ trigger: red, history: [red, runOf(9, 'success')] })
    const rerun = runOf(10, 'success')
    const w = await fire({ trigger: rerun, history: [red, runOf(9, 'success')], issues: opened.issues, comments: opened.comments })
    expect(w.closed).toHaveLength(1)
  })

  it('an OLD run finishing red after a newer run went green opens nothing', async () => {
    const late = runOf(10, 'failure')
    const w = await fire({ trigger: late, history: [runOf(11, 'success'), late] })
    expect(w.created).toHaveLength(0)
  })

  it('an OLD run finishing green does not close an issue the newer red run opened', async () => {
    const red = runOf(11, 'failure')
    const opened = await fire({ trigger: red, history: [red, runOf(9, 'success')] })
    const late = runOf(10, 'success')
    const w = await fire({ trigger: late, history: [red, late, runOf(9, 'success')], issues: opened.issues, comments: opened.comments })
    expect(w.closed).toHaveLength(0)
    expect(w.posted).toHaveLength(0)
  })
})

describe('main-red-status — whose runs and whose issue', () => {
  it('ignores pull request runs that share the branch name (a fork PR from its own main)', async () => {
    const trigger = runOf(12, 'success')
    const forkPr = runOf(13, 'failure', { event: 'pull_request' })
    const w = await fire({ trigger, history: [forkPr, trigger], issues: [] })
    expect(w.created).toHaveLength(0)
  })

  it('keeps one issue per workflow: another workflow has its own', async () => {
    const other: Issue = { number: 50, title: '[main] CI is red', body: '', state: 'open' }
    const trigger = runOf(10, 'failure')
    const w = await fire({ trigger, history: [trigger, runOf(9, 'success')], issues: [other] })
    expect(w.created).toHaveLength(1)
    expect(w.posted).toHaveLength(0)

    const green = runOf(11, 'success')
    const closed = await fire({ trigger: green, history: [green, trigger], issues: w.issues, comments: w.comments })
    expect(closed.closed).toEqual([w.created[0]!.number])
    expect(other.state).toBe('open')
  })

  it('never treats a pull request with the same title as the issue', async () => {
    const pr: Issue = { number: 60, title: '[main] CI (main) is red', body: '', state: 'open', pull_request: {} }
    const trigger = runOf(10, 'failure')
    const w = await fire({ trigger, history: [trigger], issues: [pr] })
    expect(w.created).toHaveLength(1)
    expect(w.posted).toHaveLength(0)
  })
})
