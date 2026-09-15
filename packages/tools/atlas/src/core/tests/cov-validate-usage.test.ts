/**
 * The remaining arms of the usage guardrail: every control KIND's satisfied
 * case, the kind it has no opinion about, and the bounded edit distance.
 *
 * The satisfied cases matter as much as the rejections. A type check that
 * flagged a correct value would send a reader to change something that was not
 * the problem — the same cost as a wrong suggestion, which the threshold logic
 * exists to avoid.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence, PropControl } from '../types'
import { editDistance, nearest, validateUsage } from '../validate-usage'

const control = (over: Partial<PropControl> & { name: string }): PropControl => ({
  kind: 'text',
  reactive: false,
  required: false,
  ...over,
})

const component = (controls: PropControl[]): ComponentIntelligence =>
  ({ name: 'Widget', controls, axes: [], scenarios: [], tags: [] }) as ComponentIntelligence

describe('every declared kind, satisfied', () => {
  it('accepts a value of each control\'s own type without a finding', () => {
    // The control. A false positive here is as expensive as a missed typo.
    const widget = component([
      control({ name: 'flag', kind: 'boolean' }),
      control({ name: 'count', kind: 'number' }),
      control({ name: 'label', kind: 'text' }),
      control({ name: 'tint', kind: 'color' }),
      control({ name: 'onPick', kind: 'reactive', reactive: true }),
    ])
    const result = validateUsage(widget, {
      flag: false,
      count: 0,
      label: '',
      tint: '#fff',
      onPick: () => {},
    })
    expect(result.ok, result.findings.map((f) => f.message).join('; ')).toBe(true)
  })
})

describe('every declared kind, violated', () => {
  it('names the EXPECTED type and what it got, per kind', () => {
    // `expects X — got Y` is the whole content of the message: a reader who
    // only learns that something is wrong has to go read the source.
    const widget = component([
      control({ name: 'flag', kind: 'boolean' }),
      control({ name: 'count', kind: 'number' }),
      control({ name: 'tint', kind: 'color' }),
    ])
    const result = validateUsage(widget, { flag: 'yes', count: '3', tint: 42 })

    expect(result.ok).toBe(false)
    const byProp = new Map(result.findings.map((f) => [f.prop, f.message]))
    expect(byProp.get('flag')).toContain('expects boolean — got string')
    expect(byProp.get('count')).toContain('expects number — got string')
    expect(byProp.get('tint')).toContain('expects string — got number')
    expect([...byProp.keys()].every((p) => result.findings.some((f) => f.kind === 'wrong-type'))).toBe(true)
  })
})

describe('a kind the contract has no opinion about', () => {
  it('accepts ANY value for an `unknown` control rather than guessing', () => {
    // The static scan could not resolve this prop's type. Inventing a
    // constraint for it would reject correct code with a made-up reason —
    // strictly worse than saying nothing.
    const widget = component([control({ name: 'payload', kind: 'unknown' })])
    for (const value of [1, 'x', true, null, {}, [], () => {}]) {
      expect(validateUsage(widget, { payload: value }).ok, String(value)).toBe(true)
    }
  })
})

describe('a select whose options the scan could not read', () => {
  it('does not reject a value against an EMPTY option list', () => {
    // An empty `options` means "unknown", not "nothing is legal". Rejecting
    // everything would make an unreadable union block every usage of the prop.
    const widget = component([control({ name: 'state', kind: 'select', options: [] })])
    expect(validateUsage(widget, { state: 'anything' }).ok).toBe(true)
  })

  it('does not reject a NON-STRING value against a select', () => {
    // A union is of string literals; a number here is a different mistake and
    // reporting it as "must be one of primary, secondary" is a wrong diagnosis.
    const widget = component([control({ name: 'state', kind: 'select', options: ['a', 'b'] })])
    expect(validateUsage(widget, { state: 3 }).ok).toBe(true)
  })
})

describe('the bounded edit distance', () => {
  it('is symmetric and counts real edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('sitting', 'kitten')).toBe(3)
  })

  it('counts an insertion against the empty string', () => {
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('abc', '')).toBe(3)
  })

  it('is zero for two empty strings', () => {
    expect(editDistance('', '')).toBe(0)
  })

  it('reports over-cap rather than doing quadratic work on a long value', () => {
    // The input is a prop name or a literal value. An unbounded implementation
    // over attacker-supplied text is a quadratic hazard for no benefit.
    expect(editDistance('a', 'a'.repeat(200))).toBe(9)
    expect(editDistance('a', 'b'.repeat(200), 3)).toBe(4)
  })
})

describe('nearest — the threshold that keeps a suggestion honest', () => {
  it('suggests nothing when the single candidate is not close', () => {
    // One candidate always wins the "closest" contest. The threshold is what
    // stops it becoming a suggestion.
    expect(nearest('zzzzzz', ['primary'])).toBeUndefined()
  })

  it('suggests the closest of SEVERAL, not merely the first that is close', () => {
    expect(nearest('secondry', ['primary', 'secondary', 'danger'])).toBe('secondary')
  })
})
