/**
 * `validateUsage` — the catalog as a guardrail rather than a document.
 *
 * The failure it exists for: an AI writing UI code produces a plausible prop
 * value that does not exist. `state="primry"` typechecks in a JS file, renders
 * without throwing, and silently does nothing. Atlas already knew the three
 * legal values; the only thing missing was being able to ask.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence, PropControl } from '../types'
import { editDistance, formatUsage, nearest, validateUsage } from '../validate-usage'

const control = (over: Partial<PropControl> & { name: string }): PropControl => ({
  kind: 'text',
  reactive: false,
  required: false,
  ...over,
})

const Button: ComponentIntelligence = {
  name: 'Button',
  controls: [
    control({ name: 'label', kind: 'text', required: true }),
    control({ name: 'state', kind: 'select', options: ['primary', 'secondary', 'danger'] }),
    control({ name: 'size', kind: 'select', options: ['sm', 'lg'] }),
    control({ name: 'disabled', kind: 'boolean' }),
    control({ name: 'count', kind: 'number' }),
    control({ name: 'onClick', kind: 'reactive', reactive: true }),
  ],
  axes: [],
  scenarios: [],
  tags: [],
}

describe('the value typo — the reason this exists', () => {
  it('rejects a plausible value that does not exist, and suggests the real one', () => {
    const result = validateUsage(Button, { label: 'Save', state: 'primry' })
    expect(result.ok).toBe(false)
    const [finding] = result.findings
    expect(finding?.kind).toBe('invalid-value')
    expect(finding?.suggestion).toBe('primary')
    expect(finding?.message).toContain('`primary`, `secondary`, `danger`')
  })

  it('accepts every legal value', () => {
    for (const state of ['primary', 'secondary', 'danger']) {
      expect(validateUsage(Button, { label: 'x', state }).ok).toBe(true)
    }
  })

  it('offers NO suggestion when nothing is close', () => {
    // A wrong suggestion is worse than none — it sends the reader to change
    // something that was not the problem.
    const [finding] = validateUsage(Button, { label: 'x', state: 'enormous' }).findings
    expect(finding?.kind).toBe('invalid-value')
    expect(finding?.suggestion).toBeUndefined()
  })

  it('does not suggest `sm` for `lg` — short, distinct values are not typos', () => {
    const [finding] = validateUsage(Button, { label: 'x', size: 'md' }).findings
    expect(finding?.suggestion).toBeUndefined()
  })
})

describe('unknown props', () => {
  it('reports a prop the component does not have', () => {
    // Same silent failure as a bad value: the component renders and the prop
    // does nothing.
    const [finding] = validateUsage(Button, { label: 'x', variant: 'solid' }).findings
    expect(finding?.kind).toBe('unknown-prop')
    expect(finding?.message).toContain('not a prop of Button')
  })

  it('suggests the nearest real prop name', () => {
    const [finding] = validateUsage(Button, { label: 'x', stat: 'primary' }).findings
    expect(finding?.suggestion).toBe('state')
  })
})

describe('types', () => {
  it.each([
    ['disabled', 'yes', 'boolean'],
    ['count', '3', 'number'],
    ['label', 42, 'string'],
  ])('%s rejects the wrong type', (prop, value, expected) => {
    const [finding] = validateUsage(Button, { label: 'x', [prop]: value }).findings
    expect(finding?.kind).toBe('wrong-type')
    expect(finding?.message).toContain(expected)
  })

  it('requires a FUNCTION for a reactive prop', () => {
    // The documented footgun: a string here makes the runtime warn on every
    // render and the handler never fires.
    const [finding] = validateUsage(Button, { label: 'x', onClick: '' }).findings
    expect(finding?.kind).toBe('wrong-type')
    expect(finding?.message).toContain('function')
  })

  it('accepts a function for a reactive prop', () => {
    expect(validateUsage(Button, { label: 'x', onClick: () => {} }).ok).toBe(true)
  })
})

describe('required props', () => {
  it('reports one that was not supplied', () => {
    const [finding] = validateUsage(Button, { state: 'primary' }).findings
    expect(finding?.kind).toBe('missing-required')
    expect(finding?.prop).toBe('label')
  })

  it('reports missing-required LAST, after what is wrong', () => {
    // The order a reader works: fix what is broken, then add what is absent.
    const kinds = validateUsage(Button, { state: 'nope' }).findings.map((f) => f.kind)
    expect(kinds).toEqual(['invalid-value', 'missing-required'])
  })

  it('does not complain about an optional prop that is absent', () => {
    expect(validateUsage(Button, { label: 'x' }).ok).toBe(true)
  })
})

describe('editDistance / nearest', () => {
  it('is zero for identical strings', () => {
    expect(editDistance('a', 'a')).toBe(0)
  })

  it('counts single edits', () => {
    expect(editDistance('primry', 'primary')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('bails early on wildly different lengths rather than doing the work', () => {
    expect(editDistance('a', 'x'.repeat(50))).toBeGreaterThan(8)
  })

  it('is case-insensitive when suggesting', () => {
    expect(nearest('PRIMRY', ['primary'])).toBe('primary')
  })

  it('returns undefined against no candidates', () => {
    expect(nearest('x', [])).toBeUndefined()
  })
})

describe('formatUsage', () => {
  it('says so plainly when a usage is valid', () => {
    expect(formatUsage('Button', { ok: true, findings: [] })).toContain('valid')
  })

  it('attaches the suggestion to the problem it fixes', () => {
    const text = formatUsage('Button', validateUsage(Button, { label: 'x', state: 'primry' }))
    expect(text).toContain('did you mean `primary`?')
  })
})
