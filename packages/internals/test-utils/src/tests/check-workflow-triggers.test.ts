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

  it('exempts a trigger no push supersedes (types without synchronize) and ignores non-PR workflows', () => {
    expect(checkWorkflow('a.yml', pr('  pull_request:\n    types: [closed]'))).toEqual([])
    expect(checkWorkflow('a.yml', pr('  pull_request:\n    types: [opened]'))).toEqual([])
    expect(checkWorkflow('a.yml', pr('  pull_request:\n    types: [labeled, unlabeled]'))).toEqual([])
    expect(checkWorkflow('a.yml', pr('  pull_request:\n    types: [opened, synchronize]'))[0]).toContain('no workflow-level concurrency')
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

describe('check-workflow-triggers — read structurally, evaluated', () => {
  const conc = (group: string, cancel: string) => `concurrency:\n  group: ${group}\n  cancel-in-progress: ${cancel}\n`

  it('fails a constant group: it would cancel OTHER pull requests\' runs', () => {
    expect(checkWorkflow('a.yml', pr('  pull_request:', conc('lint', 'true')))[0]).toContain('no per-PR or per-ref part')
    expect(checkWorkflow('a.yml', pr('  pull_request:', conc('lint-${{ github.workflow }}', 'true')))[0]).toContain(
      'no per-PR or per-ref part',
    )
    expect(checkWorkflow('a.yml', pr('  pull_request:', conc('lint-${{ github.head_ref || github.run_id }}', 'true')))).toEqual([])
  })

  it('evaluates cancel-in-progress instead of matching its text', () => {
    const inverted = conc('x-${{ github.ref }}', "${{ github.event_name != 'pull_request' }}")
    expect(checkWorkflow('a.yml', pr('  pull_request:', inverted))[0]).toContain('is false for pull_request')
    const notMain = conc('x-${{ github.ref }}', "${{ github.ref != 'refs/heads/main' }}")
    expect(checkWorkflow('a.yml', pr('  pull_request:', notMain))).toEqual([])
    const undecidable = conc('x-${{ github.ref }}', '${{ vars.CANCEL }}')
    expect(checkWorkflow('a.yml', pr('  pull_request:', undecidable))[0]).toContain('cannot decide')
  })

  it('checks pull_request_target like pull_request', () => {
    expect(checkWorkflow('a.yml', pr('  pull_request_target:'))[0]).toContain('pull_request_target')
    expect(checkWorkflow('a.yml', pr('  pull_request_target:', cancelling))).toEqual([])
  })

  it('sees a draft check in a step-level if:', () => {
    const stepDraft = `name: X\non:\n  pull_request:\n    types: [opened, synchronize]\n${cancelling}jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - if: \${{ !github.event.pull_request.draft }}\n        run: echo\n`
    expect(checkWorkflow('a.yml', stepDraft)[0]).toContain('ready_for_review')
  })

  it('reads block-list types (no false positive) and inline comments', () => {
    const blockTypes = `name: X\non:\n  pull_request:\n    types:\n      - opened\n      - synchronize # pushes\n      - ready_for_review\n${cancelling}jobs:\n  a:\n    if: github.event.pull_request.draft == false\n    runs-on: ubuntu-latest\n    steps: []\n`
    expect(checkWorkflow('a.yml', blockTypes)).toEqual([])
  })
})
