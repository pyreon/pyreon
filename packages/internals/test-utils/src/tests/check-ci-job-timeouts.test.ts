// The bootstrap-restore timeout gate.
//
// `setup-pyreon` defaults `restore-bootstrap: 'true'`, and restoring the lib/
// cache measured 5.9-6.0 min across twelve jobs of run 30840261671. Four
// REQUIRED gates were budgeted at `timeout-minutes: 5`, so setup ate the whole
// budget and the check step never ran.
//
// The failure mode is why this is gated rather than merely fixed: a timed-out
// job reports `cancelled`, `cancelled` satisfies no required status check, and
// it is not a red X. The PR sits at BLOCKED with nothing failing, nothing
// pending, and no explanation — which reads as "CI is slow today", not as a
// broken gate. #2642 was permanently unmergeable this way.

import { describe, expect, it } from 'vitest'
import {
  MIN_BOOTSTRAP_TIMEOUT,
  findTimeoutViolations,
  parseJobTimeouts,
} from '../../../../../scripts/check-ci-job-timeouts'

const wf = (body: string) => `name: CI\njobs:\n${body}`

describe('parseJobTimeouts', () => {
  it('reads a job that restores bootstrap by DEFAULT (no explicit input)', () => {
    const out = parseJobTimeouts(
      wf(`  budgets:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: ./.github/actions/setup-pyreon
`),
    )
    expect(out).toEqual([
      { job: 'budgets', timeout: 5, usesSetup: true, restoresBootstrap: true },
    ])
  })

  it("treats an explicit restore-bootstrap: 'false' as opting OUT", () => {
    const out = parseJobTimeouts(
      wf(`  ratchet:
    timeout-minutes: 3
    steps:
      - uses: ./.github/actions/setup-pyreon
        with:
          restore-bootstrap: 'false'
`),
    )
    expect(out[0]!.restoresBootstrap).toBe(false)
  })

  it('does not treat a job without setup-pyreon as restoring anything', () => {
    const out = parseJobTimeouts(
      wf(`  docs:
    timeout-minutes: 2
    steps:
      - uses: actions/checkout@v7
`),
    )
    expect(out[0]).toMatchObject({ usesSetup: false, restoresBootstrap: false })
  })

  it('records a null timeout when the job declares none', () => {
    const out = parseJobTimeouts(
      wf(`  nobudget:
    steps:
      - uses: ./.github/actions/setup-pyreon
`),
    )
    expect(out[0]!.timeout).toBeNull()
  })

  it('separates consecutive jobs', () => {
    const out = parseJobTimeouts(
      wf(`  first:
    timeout-minutes: 5
    steps:
      - uses: ./.github/actions/setup-pyreon
  second:
    timeout-minutes: 30
    steps:
      - uses: ./.github/actions/setup-pyreon
`),
    )
    expect(out.map((j) => [j.job, j.timeout])).toEqual([
      ['first', 5],
      ['second', 30],
    ])
  })

  it('ignores a deeper-indented timeout-minutes (a step-level one)', () => {
    // Only the JOB budget can strand a required context; a step timeout fails
    // the step loudly instead.
    const out = parseJobTimeouts(
      wf(`  job:
    timeout-minutes: 20
    steps:
      - uses: ./.github/actions/setup-pyreon
      - name: slow thing
        timeout-minutes: 5
`),
    )
    expect(out[0]!.timeout).toBe(20)
  })
})

describe('findTimeoutViolations', () => {
  const j = (over: Partial<ReturnType<typeof parseJobTimeouts>[number]>) => ({
    job: 'x',
    timeout: 5,
    usesSetup: true,
    restoresBootstrap: true,
    ...over,
  })

  it('flags a bootstrap-restoring job under the floor', () => {
    expect(findTimeoutViolations([j({ job: 'budgets', timeout: 5 })], 12)).toEqual([
      { job: 'budgets', timeout: 5 },
    ])
  })

  it('flags one exactly at the boundary minus one, not at the floor', () => {
    expect(findTimeoutViolations([j({ timeout: 11 })], 12)).toHaveLength(1)
    expect(findTimeoutViolations([j({ timeout: 12 })], 12)).toHaveLength(0)
  })

  it('does NOT flag a lib-free job with a small budget', () => {
    // The fast gates finish in ~0.3 min; their 2-3 min budgets are correct and
    // must stay that way, or this gate becomes a blanket timeout inflator.
    expect(findTimeoutViolations([j({ timeout: 2, restoresBootstrap: false })], 12)).toEqual([])
  })

  it('does NOT flag a job with no declared timeout', () => {
    // GitHub's 360-min default is wasteful on a hang but never produces the
    // silent-unmergeable failure this gate exists to prevent.
    expect(findTimeoutViolations([j({ timeout: null })], 12)).toEqual([])
  })

  it('sorts violations by job name', () => {
    const out = findTimeoutViolations([j({ job: 'zeta' }), j({ job: 'alpha' })], 12)
    expect(out.map((v) => v.job)).toEqual(['alpha', 'zeta'])
  })

  it('keeps the floor above the measured ~6 min restore', () => {
    // A floor at or below the restore cost would let the original bug back in.
    expect(MIN_BOOTSTRAP_TIMEOUT).toBeGreaterThan(6)
  })
})

describe('comments are not uses (regression: a prose mention tripped the gate)', () => {
  it('a job that only MENTIONS setup-pyreon in a comment is not flagged', () => {
    // The `changes` job uses setup-bun directly and never restores lib/. A
    // comment explaining what a matrix cell's fixed cost consists of made the
    // substring scan think otherwise, failing an 8-minute budget that is
    // correct.
    const wf = [
      'jobs:',
      '  changes:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 8',
      '    steps:',
      '      - uses: oven-sh/setup-bun@abc',
      '      - name: Decide',
      '        run: |',
      '          # cost per cell = queue + checkout + setup-pyreon + browsers',
      '          echo hi',
    ].join('\n')
    const [job] = parseJobTimeouts(wf)
    expect(job!.usesSetup).toBe(false)
    expect(job!.restoresBootstrap).toBe(false)
    expect(findTimeoutViolations(parseJobTimeouts(wf), MIN_BOOTSTRAP_TIMEOUT)).toEqual([])
  })

  it('a REAL setup-pyreon use is still flagged under budget', () => {
    const wf = [
      'jobs:',
      '  real:',
      '    timeout-minutes: 8',
      '    steps:',
      '      - uses: ./.github/actions/setup-pyreon',
    ].join('\n')
    expect(findTimeoutViolations(parseJobTimeouts(wf), MIN_BOOTSTRAP_TIMEOUT)).toEqual([
      { job: 'real', timeout: 8 },
    ])
  })

  it('a COMMENTED-OUT opt-out does not exempt a real user', () => {
    const wf = [
      'jobs:',
      '  sneaky:',
      '    timeout-minutes: 8',
      '    steps:',
      '      - uses: ./.github/actions/setup-pyreon',
      "        # restore-bootstrap: 'false'  <- commented out, not in effect",
    ].join('\n')
    expect(findTimeoutViolations(parseJobTimeouts(wf), MIN_BOOTSTRAP_TIMEOUT)).toEqual([
      { job: 'sneaky', timeout: 8 },
    ])
  })
})
