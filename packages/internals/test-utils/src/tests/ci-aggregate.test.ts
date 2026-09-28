import { describe, expect, it } from 'vitest'
import {
  aggregateKind,
  decideAggregate,
  reproductionCommand,
  workflowCommandValue,
  type JobInfo,
} from '../../../../../scripts/ci-aggregate'

const done = (name: string, conclusion = 'success'): JobInfo => ({
  name,
  status: 'completed',
  conclusion,
})
const running = (name: string): JobInfo => ({ name, status: 'in_progress', conclusion: null })

describe('aggregateKind', () => {
  it('classifies the aggregated families and nothing else', () => {
    expect(aggregateKind('Install')).toBe('install')
    expect(aggregateKind('Fast Gates')).toBe('preflight')
    expect(aggregateKind('typecheck (core+tools)')).toBe('typecheck')
    expect(aggregateKind('test (batch-a)')).toBe('test')
    expect(aggregateKind('e2e (core+5 more)')).toBe('e2e')
    expect(aggregateKind('Scaffold Smoke (cpa-smoke-app-static+1 more)')).toBe('scaffold')
    // Case-sensitive on purpose — these are separate required checks.
    expect(aggregateKind('Test (browser)')).toBeNull()
    expect(aggregateKind('Test (fallback)')).toBeNull()
    expect(aggregateKind('Build')).toBeNull()
  })
})

describe('failure diagnostics', () => {
  it('maps job families to local reproduction commands', () => {
    expect(reproductionCommand('Fast Gates')).toBe('bun run validate-fast')
    expect(reproductionCommand('e2e (docs)')).toBe('bun run test:e2e:docs')
    expect(reproductionCommand('e2e (docs+2 more)')).toContain('job log')
  })

  it('puts job URLs and reproduction commands in the verdict', () => {
    const failed = { ...done('test (core)', 'failure'), html_url: 'https://github.test/job/42' }
    const verdict = decideAggregate([done('Install'), done('Fast Gates'), failed], null, {
      e2eSelected: false,
    })
    expect(verdict.lines.join('\n')).toContain('job log: https://github.test/job/42')
    expect(verdict.lines.join('\n')).toContain('`bun run test`')
  })

  it('escapes API-derived text before emitting a workflow command', () => {
    expect(workflowCommandValue('bad%name\r\n::warning::')).toBe('bad%25name%0D%0A::warning::')
  })
})

describe('decideAggregate', () => {
  const self = { ...done('test (batch-b)') }
  it('does not post while another aggregated job is still running', () => {
    const v = decideAggregate(
      [done('Install'), done('Fast Gates'), running('e2e (core)'), self, done('Build')],
      self,
      { e2eSelected: true },
    )
    expect(v.last).toBe(false)
  })
  it('ignores non-aggregated jobs that are still running', () => {
    const v = decideAggregate(
      [
        done('Install'),
        done('Fast Gates'),
        self,
        running('Test (browser)'),
        running('Release Build'),
      ],
      self,
      { e2eSelected: false },
    )
    expect(v).toMatchObject({ last: true, ok: true })
  })
  it('passes when everything succeeded or was skipped', () => {
    const v = decideAggregate(
      [
        done('Install'),
        done('Fast Gates'),
        done('typecheck (core)'),
        done('e2e (x)', 'skipped'),
        self,
      ],
      self,
      { e2eSelected: false },
    )
    expect(v).toMatchObject({ last: true, ok: true })
  })
  it('fails on a failed or cancelled cell — including this job itself', () => {
    expect(
      decideAggregate(
        [done('Install'), done('Fast Gates'), done('typecheck (core)', 'failure'), self],
        self,
        { e2eSelected: false },
      ).ok,
    ).toBe(false)
    expect(
      decideAggregate(
        [done('Install'), done('Fast Gates'), done('Scaffold Smoke (a)', 'cancelled'), self],
        self,
        { e2eSelected: false },
      ).ok,
    ).toBe(false)
    const failedSelf = done('test (batch-b)', 'failure')
    expect(
      decideAggregate([done('Install'), done('Fast Gates'), failedSelf], failedSelf, {
        e2eSelected: false,
      }).ok,
    ).toBe(false)
  })
  it('fails when Install did not succeed', () => {
    expect(
      decideAggregate([done('Install', 'failure'), done('Fast Gates', 'skipped'), self], self, {
        e2eSelected: false,
      }).ok,
    ).toBe(false)
  })
  it('waits for Fast Gates and fails closed if preflight is missing or red', () => {
    expect(
      decideAggregate([done('Install'), running('Fast Gates'), self], self, { e2eSelected: false })
        .last,
    ).toBe(false)
    expect(decideAggregate([done('Install'), self], self, { e2eSelected: false }).ok).toBe(false)
    expect(
      decideAggregate([done('Install'), done('Fast Gates', 'failure'), self], self, {
        e2eSelected: false,
      }).ok,
    ).toBe(false)
  })
  it('requires SUCCESS (not skip) from selected e2e suites, and at least one', () => {
    expect(
      decideAggregate(
        [done('Install'), done('Fast Gates'), done('e2e (x)', 'skipped'), self],
        self,
        { e2eSelected: true },
      ).ok,
    ).toBe(false)
    expect(
      decideAggregate([done('Install'), done('Fast Gates'), self], self, { e2eSelected: true }).ok,
    ).toBe(false)
    expect(
      decideAggregate([done('Install'), done('Fast Gates'), done('e2e (x)'), self], self, {
        e2eSelected: true,
      }).ok,
    ).toBe(true)
  })
  it('in --force mode (no self) decides over the finished set', () => {
    expect(
      decideAggregate([done('Install'), done('Fast Gates'), done('test (a)')], null, {
        e2eSelected: false,
      }),
    ).toMatchObject({ last: true, ok: true })
  })
})
