import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import type { ComponentIntelligence } from '../../core'
import { catalogReplacer } from '../../core'
import { generateCatalogModule, linkableArgs } from '../catalog-module'

const ci = (name: string, over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name,
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...over,
})

describe('parts — a part renders as its parent\'s opening scenario', () => {
  const entries = [
    { component: ci('Tabs', { scenarios: [{ id: 'tabs--default', component: 'Tabs', name: 'Default', args: { defaultValue: 'a' }, source: 'auto-default' as const }] }), file: '/p/src/Tabs.tsx' },
    { component: ci('TabPanel'), file: '/p/src/Tabs.tsx' },
  ]

  it('emits a post-pass that points the part at the parent and rewrites its render', () => {
    const code = generateCatalogModule(entries, { root: '/p/src', parts: { TabPanel: 'Tabs' } })
    expect(code).toContain('const __parts = {"TabPanel":"Tabs"}')
    expect(code).toContain('p.partOf = par.id')
    expect(code).toContain('p.render = (_props, ctx) => par.render(__opening(par), ctx)')
    // The parent's OPENING scenario — Default first, else the first one.
    expect(code).toContain('c.scenarios?.find((s) => s.name === "Default") ?? c.scenarios?.[0]')
  })

  it('emits no post-pass when no parts are declared', () => {
    expect(generateCatalogModule(entries, { root: '/p/src' })).not.toContain('__parts')
    expect(generateCatalogModule(entries, { root: '/p/src', parts: {} })).not.toContain('__parts')
  })
})

describe('linkableArgs — what a derived scenario\'s JSON copy may carry', () => {
  it('drops a function and a vnode, keeps JSON', () => {
    const out = linkableArgs({ size: 'm', data: [{ id: 1 }], children: () => 'x', tree: h('div', {}, 'x') })
    expect(out).toEqual({ size: 'm', data: [{ id: 1 }] })
  })

  it('the file-side twin MARKS the same values instead', () => {
    const json = JSON.stringify({ children: () => 'x', tree: h('div', {}, 'x'), size: 'm' }, catalogReplacer)
    expect(JSON.parse(json)).toEqual({
      children: '[atlas: function — see atlas.config.ts]',
      tree: '[atlas: vnode — see atlas.config.ts]',
      size: 'm',
    })
  })
})

describe('authored args stay LIVE in the module', () => {
  it('reads an authored scenario\'s args from the config module, with the JSON copy as fallback', () => {
    const code = generateCatalogModule(
      [
        {
          component: ci('Spoiler', {
            scenarios: [
              { id: 'spoiler--default', component: 'Spoiler', name: 'Default', args: { maxHeight: 48, children: () => 'x' }, source: 'authored' },
              { id: 'spoiler--empty', component: 'Spoiler', name: 'Empty', args: { children: '', maxHeight: 48 }, source: 'auto-edge' },
            ],
          }),
          file: '/p/src/Spoiler.tsx',
        },
      ],
      { root: '/p/src', configPath: '/p/atlas.config.ts' },
    )
    expect(code).toContain('args: __authored("Spoiler", "Spoiler", "Default", {"maxHeight":48,"children":"[atlas: function — see atlas.config.ts]"})')
    // A derived scenario's copy carries only JSON; the render's base supplies
    // the rest from the authored Default.
    expect(code).toContain('name: "Empty", source: "auto-edge", args: {"children":"","maxHeight":48}')
    expect(code).toContain('...__authored("Spoiler", "Spoiler", "Default", {}), ...props')
  })

  it('drops non-JSON values from a derived scenario rather than shipping a marker string as a prop', () => {
    const code = generateCatalogModule(
      [
        {
          component: ci('Spoiler', {
            scenarios: [
              { id: 'spoiler--size-m', component: 'Spoiler', name: 'size=m', args: { size: 'm', children: () => 'x' }, source: 'auto-variant' },
            ],
          }),
          file: '/p/src/Spoiler.tsx',
        },
      ],
      { root: '/p/src', configPath: '/p/atlas.config.ts' },
    )
    expect(code).toContain('name: "size=m", source: "auto-variant", args: {"size":"m"}')
    expect(code).not.toContain('[atlas: function')
  })
})

describe('an opened overlay closes back into its control', () => {
  it('wires onClose to setValue(open, false) only when an open control exists', () => {
    const withOpen = generateCatalogModule(
      [{ component: ci('Dialog', { controls: [{ name: 'open', kind: 'boolean', defaultValue: true, reactive: false, required: false }] }), file: '/p/src/Dialog.tsx' }],
      { root: '/p/src' },
    )
    expect(withOpen).toContain("ctx.setValue('open', false)")
    const without = generateCatalogModule([{ component: ci('Button'), file: '/p/src/Button.tsx' }], { root: '/p/src' })
    expect(without).not.toContain("setValue('open'")
  })
})
