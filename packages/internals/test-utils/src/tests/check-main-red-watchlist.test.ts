// Contract for `scripts/check-main-red-watchlist.ts`: every workflow that can
// run on the default branch is watched by main-red-status.yml, and the gate
// fails closed when a workflow is added, renamed or loses its exemption's reason.

import {
  ALARM_WORKFLOW,
  checkWatchlist,
  EXEMPT,
  readWorkflows,
  watchedNames,
  workflowName,
  workflowTriggers,
} from '../../../../../scripts/check-main-red-watchlist'
import { NOTIFIER_WORKFLOWS } from '../../../../../scripts/check-advisory-comment-steps'

const alarm = (names: string[]) =>
  [
    'name: Default Branch Status',
    'on:',
    '  workflow_run:',
    '    workflows:',
    ...names.map((n) => `      - ${n}`),
    '    types: [completed]',
    '    branches: [main]',
    'jobs: {}',
  ].join('\n')

const pushWorkflow = (name: string) => `name: ${name}\non:\n  push:\n    branches: [main]\njobs: {}\n`
const prWorkflow = (name: string) => `name: ${name}\non:\n  pull_request:\n    types: [opened]\n  merge_group:\njobs: {}\n`

const follower = (name: string, condition: string) =>
  `name: ${name}\non:\n  workflow_run:\n    workflows:\n      - CI\n    types: [completed]\njobs:\n  heal:\n    if: ${condition}\n    runs-on: ubuntu-latest\n`

const base = {
  [ALARM_WORKFLOW]: alarm(['CI', 'Nightly']),
  'ci.yml': pushWorkflow('CI'),
  'nightly.yml': 'name: Nightly\non:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:\njobs: {}\n',
  'pr-gates.yml': prWorkflow('PR Gates'),
}

const exempt = { [ALARM_WORKFLOW]: 'self', 'pr-gates.yml': 'pull-request-only' } as const

describe('check-main-red-watchlist — the repository', () => {
  const files = readWorkflows()

  it('passes: every workflow is watched or verifiably exempt', () => {
    expect(checkWatchlist(files)).toEqual([])
  })

  it('reads a real watch list and real triggers (the scan is not empty)', () => {
    const watched = watchedNames(files[ALARM_WORKFLOW]!)
    expect(watched).toContain('CI')
    expect(watched).toContain('CI (main)')
    expect(watched.length + Object.keys(EXEMPT).length).toBe(Object.keys(files).length)
    expect(workflowTriggers(files['ci.yml']!)).toEqual(['push', 'pull_request', 'merge_group'])
    expect(workflowName(files['ci-main.yml']!)).toBe('CI (main)')
  })

  it('the alarm is a notifier: its issue write must stay loud', () => {
    expect(NOTIFIER_WORKFLOWS.has(ALARM_WORKFLOW)).toBe(true)
  })
})

describe('check-main-red-watchlist — fails closed', () => {
  it('accepts the fixture as written', () => {
    expect(checkWatchlist(base, exempt)).toEqual([])
  })

  it('a NEW workflow that is not listed fails, with the line to add', () => {
    const findings = checkWatchlist({ ...base, 'deploy.yml': pushWorkflow('Deploy') }, exempt)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('deploy.yml ("Deploy") is not watched')
    expect(findings[0]).toContain('- Deploy')
  })

  it('a RENAMED workflow fails twice: the file is unwatched and the old name matches nothing', () => {
    const findings = checkWatchlist({ ...base, 'ci.yml': pushWorkflow('Continuous Integration') }, exempt)
    expect(findings.join('\n')).toContain('ci.yml ("Continuous Integration") is not watched')
    expect(findings.join('\n')).toContain('watches "CI", but no workflow file has that `name:`')
  })

  it('a pull-request-only exemption stops holding when the workflow gains a default-branch trigger', () => {
    const findings = checkWatchlist(
      { ...base, 'pr-gates.yml': 'name: PR Gates\non:\n  pull_request:\n  push:\n    branches: [main]\njobs: {}\n' },
      exempt,
    )
    expect(findings).toEqual([
      'pr-gates.yml is exempt as "pull-request-only" but it is also triggered by push, which can run on the default branch',
    ])
  })

  it('a workflow_dispatch trigger is not pull-request-only (it can be dispatched on the default branch)', () => {
    const findings = checkWatchlist(
      { ...base, 'pr-gates.yml': 'name: PR Gates\non:\n  pull_request:\n  workflow_dispatch:\njobs: {}\n' },
      exempt,
    )
    expect(findings[0]).toContain('also triggered by workflow_dispatch')
  })

  it('a workflow_run follower is exempt only while every job is bounded to pull request runs', () => {
    const bounded = follower('Autoheal', "github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.run_attempt < 2")
    const withFollower = { ...exempt, 'autoheal.yml': 'acts-on-pull-request-runs' } as const
    expect(checkWatchlist({ ...base, 'autoheal.yml': bounded }, withFollower)).toEqual([])
    const unbounded = follower('Autoheal', "github.event.workflow_run.conclusion == 'failure'")
    expect(checkWatchlist({ ...base, 'autoheal.yml': unbounded }, withFollower)[0]).toContain(
      "a job does not require `github.event.workflow_run.event == 'pull_request'`",
    )
  })

  it('a watched workflow_run follower must filter its trigger to the default branch', () => {
    const files = { ...base, [ALARM_WORKFLOW]: alarm(['CI', 'Nightly', 'Size']) }
    const unfiltered = follower('Size', "github.event.workflow_run.event == 'push'")
    expect(checkWatchlist({ ...files, 'size.yml': unfiltered }, exempt)).toEqual([
      'size.yml: a `workflow_run` follower must declare `branches: [main]` under `on.workflow_run`, ' +
        'or every pull request run of the workflows it follows starts a run here',
    ])
    const filtered = unfiltered.replace('    types: [completed]\n', '    types: [completed]\n    branches: [main]\n')
    expect(checkWatchlist({ ...files, 'size.yml': filtered }, exempt)).toEqual([])
    // A `push: branches: [main]` beside it filters a different event.
    const pushFiltered = unfiltered.replace('on:\n', 'on:\n  push:\n    branches: [main]\n')
    expect(pushFiltered).not.toBe(unfiltered)
    expect(checkWatchlist({ ...files, 'size.yml': pushFiltered }, exempt)[0]).toContain('must declare `branches: [main]`')
  })

  it('only the alarm itself can be exempt as "self"', () => {
    const findings = checkWatchlist(base, { ...exempt, 'ci.yml': 'self' })
    expect(findings.join('\n')).toContain('ci.yml is exempt ("self") and also watched')
    expect(findings.join('\n')).toContain('only main-red-status.yml can be exempt as "self"')
  })

  it('a stale exemption, a duplicate entry and a duplicate name each fail', () => {
    expect(checkWatchlist(base, { ...exempt, 'gone.yml': 'pull-request-only' })).toEqual([
      'gone.yml is exempt but does not exist: remove the entry',
    ])
    expect(checkWatchlist({ ...base, [ALARM_WORKFLOW]: alarm(['CI', 'Nightly', 'CI']) }, exempt)).toEqual([
      'main-red-status.yml lists "CI" twice',
    ])
    expect(checkWatchlist({ ...base, 'ci-copy.yml': pushWorkflow('CI') }, exempt).join('\n')).toContain(
      'are both named "CI"',
    )
  })

  it('a missing alarm, an empty list and a missing branch filter each fail', () => {
    const { [ALARM_WORKFLOW]: _alarm, ...withoutAlarm } = base
    expect(checkWatchlist(withoutAlarm, exempt)[0]).toContain('main-red-status.yml is missing')
    expect(checkWatchlist({ ...base, [ALARM_WORKFLOW]: alarm([]) }, exempt).join('\n')).toContain('watches no workflow')
    const unfiltered = alarm(['CI', 'Nightly']).replace('    branches: [main]\n', '')
    expect(checkWatchlist({ ...base, [ALARM_WORKFLOW]: unfiltered }, exempt)[0]).toContain('must be `[main]`')
  })

  it('a workflow without a name, or with an unreadable trigger block, fails instead of passing unseen', () => {
    expect(checkWatchlist({ ...base, 'anon.yml': 'on:\n  push:\njobs: {}\n' }, exempt)[0]).toContain(
      'anon.yml has no top-level `name:`',
    )
    expect(checkWatchlist({ ...base, 'pr-gates.yml': 'name: PR Gates\njobs: {}\n' }, exempt)[0]).toContain('no `on:` block')
  })
})

describe('check-main-red-watchlist — readers', () => {
  it('reads quoted names, commented lines and the scalar and flow trigger forms', () => {
    expect(workflowName('# name: Wrong\nname: "Quoted Name" # trailing\non: push\n')).toBe('Quoted Name')
    expect(workflowTriggers('name: A\non: push\njobs: {}\n')).toEqual(['push'])
    expect(workflowTriggers('name: A\non: [push, pull_request]\njobs: {}\n')).toEqual(['push', 'pull_request'])
    expect(workflowTriggers('name: A\non:\n  # schedule:\n  push:\n    branches:\n      - main\n  workflow_dispatch: # manual\njobs: {}\n')).toEqual([
      'push',
      'workflow_dispatch',
    ])
  })

  it('reads a watch list with a commented-out and a quoted entry', () => {
    const text = alarm(['CI']).replace('      - CI', "      - CI\n      # - Old One\n      - 'CI (main)'")
    expect(watchedNames(text)).toEqual(['CI', 'CI (main)'])
  })
})
