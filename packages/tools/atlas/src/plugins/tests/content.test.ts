import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../core'
import type { ComponentIntelligence } from '../../core'
import { contentPlugin } from '../content'

const ci = (over: Partial<ComponentIntelligence>): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  scenarios: [
    makeScenario({ component: 'Button', name: 'Default', source: 'auto-default' }),
    makeScenario({ component: 'Button', name: 'Empty', args: { children: '' }, source: 'auto-variant' }),
  ],
  tags: [],
  ...over,
})

describe('contentPlugin', () => {
  it('seeds every scenario, and lets the scenario keep its own value', async () => {
    const out = await contentPlugin().decorate!(ci({ content: { children: 'Button' } }), { cwd: '/' })
    expect(out.scenarios.map((s) => s.args)).toEqual([{ children: 'Button' }, { children: '' }])
  })
  it('is the identity for a component with no seed', async () => {
    const input = ci({})
    expect(await contentPlugin().decorate!(input, { cwd: '/' })).toBe(input)
  })
})
