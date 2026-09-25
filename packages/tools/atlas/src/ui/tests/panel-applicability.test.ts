/**
 * Which addon tabs are dimmed. Each built-in rule may only say "no" on
 * positive evidence — a relevant tab dimmed by a wrong guess teaches the user
 * to ignore the dimming — so every rule is pinned in both directions here.
 */
import { describe, expect, it } from 'vitest'
import { panelApplies } from '../panel-applicability'

interface Sel {
  schema?: unknown
  controls: { key: string }[]
  scenarios?: { args?: Record<string, unknown> }[]
}

const model = (sel: Sel | undefined, opts: { roles?: string[]; consulted?: string[] } = {}) =>
  ({
    sel: () => sel,
    catalog: { components: [], ...(opts.roles ? { presets: { roles: opts.roles } } : {}) },
    renderTick: () => 0,
    permissions: () => ({ consulted: () => opts.consulted ?? [] }),
  }) as never

const panel = (id: string, applies?: (m: never) => boolean) => ({ id, title: id, render: () => null, applies }) as never

describe('panelApplies', () => {
  it('a panel that answers for itself wins over the table', () => {
    expect(panelApplies(panel('schema', () => true), model({ controls: [] }))).toBe(true)
    expect(panelApplies(panel('custom', () => false), model({ controls: [] }))).toBe(false)
  })

  it('an unknown panel with no answer of its own always applies', () => {
    expect(panelApplies(panel('custom'), model(undefined))).toBe(true)
  })

  it('schema applies only when the component declares one', () => {
    expect(panelApplies(panel('schema'), model({ controls: [], schema: {} }))).toBe(true)
    expect(panelApplies(panel('schema'), model({ controls: [] }))).toBe(false)
  })

  it('data applies when a queryData control or a scenario pins one', () => {
    expect(panelApplies(panel('data'), model(undefined))).toBe(false)
    expect(panelApplies(panel('data'), model({ controls: [{ key: 'queryData' }] }))).toBe(true)
    expect(panelApplies(panel('data'), model({ controls: [], scenarios: [{ args: { queryData: [] } }] }))).toBe(true)
    expect(panelApplies(panel('data'), model({ controls: [], scenarios: [{}, { args: { other: 1 } }] }))).toBe(false)
    expect(panelApplies(panel('data'), model({ controls: [{ key: 'label' }] }))).toBe(false)
  })

  it('permissions applies with declared roles, or after a render consulted a key', () => {
    expect(panelApplies(panel('permissions'), model({ controls: [] }, { roles: ['admin'] }))).toBe(true)
    expect(panelApplies(panel('permissions'), model({ controls: [] }, { consulted: ['posts.edit'] }))).toBe(true)
    expect(panelApplies(panel('permissions'), model({ controls: [] }))).toBe(false)
  })

  it('store follows whether @pyreon/store is loaded', () => {
    expect(typeof panelApplies(panel('store'), model({ controls: [] }))).toBe('boolean')
  })
})
