import { makeScenario, scenarioId, slugify } from '../scenario'

describe('slugify', () => {
  it('lowercases, hyphenates, and collapses non-alphanumeric runs', () => {
    expect(slugify('Primary State!')).toBe('primary-state')
    expect(slugify('  a  b  ')).toBe('a-b')
    expect(slugify('a---b')).toBe('a-b')
    expect(slugify('UPPER')).toBe('upper')
  })

  it('produces an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('scenarioId', () => {
  it('joins component + name', () => {
    expect(scenarioId('Button', 'Primary')).toBe('button--primary')
  })

  it('falls back to just the component when the name slug is empty', () => {
    expect(scenarioId('Button', '!!!')).toBe('button')
  })
})

describe('makeScenario', () => {
  it('fills id + defaults and omits an absent variant', () => {
    const s = makeScenario({ component: 'Button', name: 'Primary' })
    expect(s).toMatchObject({
      id: 'button--primary',
      component: 'Button',
      name: 'Primary',
      args: {},
      source: 'authored',
    })
    expect(s.variant).toBeUndefined()
  })

  it('carries args, variant, and an explicit source', () => {
    const s = makeScenario({
      component: 'Button',
      name: 'P',
      args: { x: 1 },
      variant: { state: 'primary' },
      source: 'auto-variant',
    })
    expect(s.args).toEqual({ x: 1 })
    expect(s.variant).toEqual({ state: 'primary' })
    expect(s.source).toBe('auto-variant')
  })
})
