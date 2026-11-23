// Contract for `scripts/check-workflow-triggers.ts`: every pull_request workflow
// cancels superseded runs, merge-group-aware groups have a non-PR fallback, and
// a job that skips drafts is re-triggered when the draft is marked ready.

import { checkAll, checkWorkflow } from '../../../../../scripts/check-workflow-triggers'

const pr = (on: string, extra = '') =>
  `name: X\non:\n${on}\n${extra}jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps: []\n`

const cancelling = 'concurrency:\n  group: x-${{ github.event.pull_request.number || github.ref }}\n  cancel-in-progress: true\n'

describe('check-workflow-triggers — the repository', () => {
  it('passes', () => {
    expect(checkAll()).toEqual([])
  })
})

describe('check-workflow-triggers — superseded-run cancellation', () => {
  it('fails a pull_request workflow with no concurrency', () => {
    expect(checkWorkflow('a.yml', pr('  pull_request:'))[0]).toContain('no workflow-level concurrency')
  })

  it('fails a group that never cancels, accepts one that cancels for pull requests', () => {
    const never = 'concurrency:\n  group: x-${{ github.ref }}\n  cancel-in-progress: false\n'
    expect(checkWorkflow('a.yml', pr('  pull_request:', never))).toHaveLength(1)
    const prOnly = "concurrency:\n  group: x-${{ github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}\n"
    expect(checkWorkflow('a.yml', pr('  pull_request:', prOnly))).toEqual([])
    expect(checkWorkflow('a.yml', pr('  pull_request:', cancelling))).toEqual([])
  })

  it('exempts a closed-only trigger (a PR closes once) and ignores non-PR workflows', () => {
    expect(checkWorkflow('a.yml', pr('  pull_request:\n    types: [closed]'))).toEqual([])
    expect(checkWorkflow('a.yml', pr('  push:\n    branches: [main]'))).toEqual([])
  })

  it('fails a merge-group workflow keyed on the PR number alone', () => {
    const bare = 'concurrency:\n  group: x-${{ github.event.pull_request.number }}\n  cancel-in-progress: true\n'
    expect(checkWorkflow('a.yml', pr('  pull_request:\n  merge_group:', bare))[0]).toContain('empty in a merge group')
    expect(checkWorkflow('a.yml', pr('  pull_request:\n  merge_group:', cancelling))).toEqual([])
  })
})

describe('check-workflow-triggers — draft skips', () => {
  const draftJob = (types: string) =>
    `name: X\non:\n  pull_request:\n    types: ${types}\n${cancelling}jobs:\n  a:\n    if: github.event.pull_request.draft == false\n    runs-on: ubuntu-latest\n    steps: []\n`

  it('fails a draft-skipping job whose trigger misses ready_for_review', () => {
    expect(checkWorkflow('a.yml', draftJob('[opened, synchronize, reopened]'))[0]).toContain('ready_for_review')
  })

  it('accepts it once ready_for_review is listed', () => {
    expect(checkWorkflow('a.yml', draftJob('[opened, synchronize, reopened, ready_for_review]'))).toEqual([])
  })
})
