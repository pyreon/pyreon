// The analysis half of `scripts/ci-throughput.ts` (the fetch half is `gh api`
// and is exercised by running the script). These definitions are what the CI
// guide's throughput numbers mean, so a change to one must be deliberate.

import {
  type Job,
  type Run,
  buildReport,
  jobFamily,
  outcome,
  peakConcurrency,
  perPrSha,
  quantile,
  REQUIRED_WORKFLOWS,
  supersededNotCancelled,
  timing,
  workflowFamily,
} from '../../../../../scripts/ci-throughput'

const T = (min: number) => new Date(Date.UTC(2026, 10, 18, 12, 0) + min * 60000).toISOString()

function job(over: Partial<Job> & { run_id: number }): Job {
  return {
    id: Math.floor(Math.random() * 1e9),
    run_attempt: 1,
    name: 'Install',
    status: 'completed',
    conclusion: 'success',
    created_at: T(0),
    started_at: T(10),
    completed_at: T(12),
    labels: ['ubuntu-latest'],
    runner_name: 'GitHub Actions 1',
    steps: [{ name: 'Run', status: 'completed', conclusion: 'success', number: 1 }],
    ...over,
  }
}

function run(over: Partial<Run> & { id: number }): Run {
  return {
    name: 'CI',
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'a',
    head_branch: 'feat/x',
    created_at: T(0),
    run_started_at: T(0),
    updated_at: T(30),
    run_attempt: 1,
    ...over,
  }
}

describe('ci-throughput — job classification', () => {
  it('splits queue (created → started) from work (started → completed)', () => {
    expect(timing(job({ run_id: 1 }))).toEqual({ queue: 10, work: 2 })
  })

  it('a job that never got a runner has no timing and counts as cancelled-queued', () => {
    const j = job({ run_id: 1, conclusion: 'cancelled', runner_name: null, started_at: T(15), completed_at: T(15), steps: [] })
    expect(timing(j)).toBeNull()
    expect(outcome(j)).toBe('cancelled-queued')
  })

  it('tells a real failure from a cancellation that ran, and a skip', () => {
    expect(outcome(job({ run_id: 1, conclusion: 'failure' }))).toBe('failure')
    expect(outcome(job({ run_id: 1, conclusion: 'cancelled' }))).toBe('cancelled-running')
    expect(outcome(job({ run_id: 1, conclusion: 'skipped', runner_name: null }))).toBe('skipped')
  })

  it('collapses matrix cells but keeps fixed names that contain parentheses', () => {
    expect(jobFamily('test (core+ui)')).toBe('test (…)')
    expect(jobFamily('e2e (batch-2)')).toBe('e2e (…)')
    expect(jobFamily('Test (browser)')).toBe('Test (browser)')
    expect(jobFamily('Analyze (javascript-typescript)')).toBe('Analyze (javascript-typescript)')
    expect(jobFamily('Scaffold Smoke  (cpa-1) ')).toBe('Scaffold Smoke (…)')
    expect(jobFamily('test (a) b')).toBe('test (a) b')
    expect(jobFamily('test')).toBe('test')
    expect(workflowFamily('Code Quality: PR #4752')).toBe('Code Quality (dynamic)')
  })

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([], 0.5)).toBeNull()
  })
})

describe('ci-throughput — per pull-request commit', () => {
  const required = REQUIRED_WORKFLOWS.map((path, i) =>
    run({ id: 10 + i, path, name: path, created_at: T(i), updated_at: T(60 + i) }),
  )

  it('time-to-green spans first creation to last completion over the required workflows', () => {
    const [v] = perPrSha(required, new Map())
    expect(v!.minutesToGreen).toBe(64)
  })

  it('reads the NEWEST run per workflow: a superseded label-event run does not block the verdict', () => {
    const stale = run({ id: 99, path: REQUIRED_WORKFLOWS[1]!, conclusion: 'cancelled', created_at: T(-5) })
    expect(perPrSha([...required, stale], new Map())[0]!.minutesToGreen).toBe(64)
  })

  it('no verdict when a required workflow is missing or red', () => {
    expect(perPrSha(required.slice(1), new Map())[0]!.minutesToGreen).toBeNull()
    const red = required.map((r, i) => (i === 0 ? { ...r, conclusion: 'failure' } : r))
    expect(perPrSha(red, new Map())[0]!.minutesToGreen).toBeNull()
  })

  it('names the last-finishing job as the critical path and sums runner minutes by OS', () => {
    const jobs = new Map<number, Job[]>([
      [10, [job({ run_id: 10, name: 'Test', created_at: T(40), started_at: T(70), completed_at: T(71) })]],
      [14, [job({ run_id: 14, name: 'iOS — xcodebuild (Simulator SDK)', labels: ['macos-15'] })]],
    ])
    const [v] = perPrSha(required, jobs)
    expect(v!.critical).toEqual({ job: 'Test', queue: 30, work: 1 })
    expect(v!.linuxMinutes).toBe(1)
    expect(v!.macosMinutes).toBe(2)
  })
})

describe('ci-throughput — runs and concurrency', () => {
  it('flags a superseded PR run that was not cancelled, not one that was', () => {
    const runs = [
      run({ id: 1, head_sha: 'a', created_at: T(0), updated_at: T(40), conclusion: 'success' }),
      run({ id: 2, head_sha: 'b', created_at: T(10), updated_at: T(50) }),
      run({ id: 3, name: 'CodeQL', path: 'codeql.yml', head_sha: 'a', created_at: T(0), updated_at: T(40), conclusion: 'cancelled' }),
      run({ id: 4, name: 'CodeQL', path: 'codeql.yml', head_sha: 'b', created_at: T(10), updated_at: T(50) }),
    ]
    expect(supersededNotCancelled(runs)).toEqual([{ workflow: 'CI', count: 1 }])
  })

  it('peak concurrency per OS is a sweep over started → completed', () => {
    const jobs = [
      job({ run_id: 1, started_at: T(0), completed_at: T(10) }),
      job({ run_id: 1, started_at: T(5), completed_at: T(15) }),
      job({ run_id: 1, started_at: T(10), completed_at: T(20) }),
      job({ run_id: 1, labels: ['macos-15'], started_at: T(0), completed_at: T(1) }),
    ]
    expect(peakConcurrency(jobs).linux!.peak).toBe(2)
    expect(peakConcurrency(jobs).macos!.peak).toBe(1)
  })

  it('the report counts housekeeping workflow_run runs per PR push', () => {
    const runs = [run({ id: 1 }), run({ id: 2, name: 'Required Check Autoheal', event: 'workflow_run', head_sha: 'z' })]
    const r = buildReport({ since: T(0), until: T(60) }, runs, new Map())
    expect(r.housekeeping).toEqual([{ workflow: 'Required Check Autoheal', runs: 1, perPrPush: 1 }])
  })
})
