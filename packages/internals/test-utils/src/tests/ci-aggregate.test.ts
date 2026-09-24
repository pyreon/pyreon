import { describe, expect, it } from 'vitest'
import {
  aggregateKind,
  decideAggregate,
  type JobInfo,
} from '../../../../../scripts/ci-aggregate'

const done = (name: string, conclusion = 'success'): JobInfo => ({ name, status: 'completed', conclusion })
const running = (name: string): JobInfo => ({ name, status: 'in_progress', conclusion: null })

describe('aggregateKind', () => {
  it('classifies the aggregated families and nothing else', () => {
    expect(aggregateKind('Install')).toBe('install')
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

describe('decideAggregate', () => {
  const self = { ...done('test (batch-b)') }
  it('does not post while another aggregated job is still running', () => {
    const v = decideAggregate([done('Install'), running('e2e (core)'), self, done('Build')], self, { e2eSelected: true })
    expect(v.last).toBe(false)
  })
  it('ignores non-aggregated jobs that are still running', () => {
    const v = decideAggregate([done('Install'), self, running('Test (browser)'), running('Release Build')], self, { e2eSelected: false })
    expect(v).toMatchObject({ last: true, ok: true })
  })
  it('passes when everything succeeded or was skipped', () => {
    const v = decideAggregate([done('Install'), done('typecheck (core)'), done('e2e (x)', 'skipped'), self], self, { e2eSelected: false })
    expect(v).toMatchObject({ last: true, ok: true })
  })
  it('fails on a failed or cancelled cell — including this job itself', () => {
    expect(decideAggregate([done('Install'), done('typecheck (core)', 'failure'), self], self, { e2eSelected: false }).ok).toBe(false)
    expect(decideAggregate([done('Install'), done('Scaffold Smoke (a)', 'cancelled'), self], self, { e2eSelected: false }).ok).toBe(false)
    const failedSelf = done('test (batch-b)', 'failure')
    expect(decideAggregate([done('Install'), failedSelf], failedSelf, { e2eSelected: false }).ok).toBe(false)
  })
  it('fails when Install did not succeed', () => {
    expect(decideAggregate([done('Install', 'failure'), self], self, { e2eSelected: false }).ok).toBe(false)
  })
  it('requires SUCCESS (not skip) from selected e2e suites, and at least one', () => {
    expect(decideAggregate([done('Install'), done('e2e (x)', 'skipped'), self], self, { e2eSelected: true }).ok).toBe(false)
    expect(decideAggregate([done('Install'), self], self, { e2eSelected: true }).ok).toBe(false)
    expect(decideAggregate([done('Install'), done('e2e (x)'), self], self, { e2eSelected: true }).ok).toBe(true)
  })
  it('in --force mode (no self) decides over the finished set', () => {
    expect(decideAggregate([done('Install'), done('test (a)')], null, { e2eSelected: false })).toMatchObject({ last: true, ok: true })
  })
})
