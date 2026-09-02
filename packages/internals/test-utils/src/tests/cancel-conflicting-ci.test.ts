// The conflicting-PR CI sweep.
//
// It CANCELS work, so the whole contract is about which uncertainties resolve
// to "cancel nothing". GitHub computes mergeability lazily and answers
// `UNKNOWN` while it does — most visibly right after a push to the base
// branch, which is exactly when this runs. Treating `UNKNOWN` as conflicting
// would cancel every PR's CI on every merge to main.
//
// Measured 2026-09-02, the reason it exists: 58 of 60 open PRs conflicting,
// 169 of 254 in-flight runs theirs, ~189 jobs queued or running for PRs that
// could not merge against a 20-slot org-wide cap.

import { describe, expect, it } from 'vitest'
import {
  type Mergeable,
  type PullRequest,
  type WorkflowRun,
  selectRunsToCancel,
  summarize,
} from '../../../../../scripts/cancel-conflicting-ci'

const pr = (number: number, mergeable: Mergeable, headSha: string): PullRequest => ({
  number,
  mergeable,
  headSha,
})
const run = (id: number, headSha: string, name = 'CI'): WorkflowRun => ({ id, headSha, name })

describe('selectRunsToCancel — what it cancels', () => {
  it('cancels a run whose head belongs to a conflicting PR', () => {
    expect(selectRunsToCancel([pr(1, 'CONFLICTING', 'aaa')], [run(10, 'aaa')])).toEqual([
      { runId: 10, prNumber: 1, workflow: 'CI' },
    ])
  })

  // Every workflow on the head is superseded, not just CI — a conflicting PR's
  // native device build and CodeQL run are just as unmergeable. Order within a
  // PR is by run id (the selector sorts PR-then-id; only `summarize` sorts by
  // workflow name).
  it('cancels every workflow on that head, not just CI', () => {
    const out = selectRunsToCancel(
      [pr(7, 'CONFLICTING', 'aaa')],
      [run(10, 'aaa', 'CI'), run(11, 'aaa', 'Native Device Build'), run(12, 'aaa', 'CodeQL')],
    )
    expect(out.map((c) => c.workflow)).toEqual(['CI', 'Native Device Build', 'CodeQL'])
    expect(out.map((c) => c.runId)).toEqual([10, 11, 12])
  })

  it('handles several conflicting PRs at once, newest PR first', () => {
    const out = selectRunsToCancel(
      [pr(1, 'CONFLICTING', 'aaa'), pr(2, 'CONFLICTING', 'bbb')],
      [run(10, 'aaa'), run(20, 'bbb')],
    )
    expect(out.map((c) => c.prNumber)).toEqual([2, 1])
  })
})

describe('selectRunsToCancel — what it must NEVER cancel', () => {
  it('skips UNKNOWN — the state every PR is in right after a push to main', () => {
    expect(selectRunsToCancel([pr(1, 'UNKNOWN', 'aaa')], [run(10, 'aaa')])).toEqual([])
  })

  it('skips MERGEABLE', () => {
    expect(selectRunsToCancel([pr(1, 'MERGEABLE', 'aaa')], [run(10, 'aaa')])).toEqual([])
  })

  it('cancels nothing when the PR list is empty — an empty result is not a licence to act', () => {
    expect(selectRunsToCancel([], [run(10, 'aaa'), run(11, 'bbb')])).toEqual([])
  })

  it('leaves a run whose head matches no open PR — main, a release, a tag build', () => {
    expect(selectRunsToCancel([pr(1, 'CONFLICTING', 'aaa')], [run(10, 'main-sha')])).toEqual([])
  })

  it('leaves a mergeable PR untouched while cancelling a conflicting sibling', () => {
    const out = selectRunsToCancel(
      [pr(1, 'CONFLICTING', 'aaa'), pr(2, 'MERGEABLE', 'bbb'), pr(3, 'UNKNOWN', 'ccc')],
      [run(10, 'aaa'), run(20, 'bbb'), run(30, 'ccc')],
    )
    expect(out).toEqual([{ runId: 10, prNumber: 1, workflow: 'CI' }])
  })

  it('matches on the exact head sha, never a prefix', () => {
    expect(selectRunsToCancel([pr(1, 'CONFLICTING', 'aaabbb')], [run(10, 'aaa')])).toEqual([])
  })
})

describe('summarize', () => {
  it('groups per PR with workflows sorted, newest PR first', () => {
    expect(
      summarize([
        { runId: 1, prNumber: 5, workflow: 'CI' },
        { runId: 2, prNumber: 5, workflow: 'CodeQL' },
        { runId: 3, prNumber: 9, workflow: 'CI' },
      ]),
    ).toEqual(['#9: CI', '#5: CI, CodeQL'])
  })

  it('renders nothing for no cancellations', () => {
    expect(summarize([])).toEqual([])
  })
})
