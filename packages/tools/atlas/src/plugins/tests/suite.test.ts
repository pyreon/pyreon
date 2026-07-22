import type { ComponentIntelligence, PropControl } from '../../core'
import { createCatalogGraph, makeScenario } from '../../core'
import type { AtlasPlugin } from '../types'
import { fillDefaultsPlugin } from '../fill-defaults'
import { recommendedPlugins } from '../recommended'
import {
  defaultScenarioPlugin,
  edgeCasesPlugin,
  statesPlugin,
  themePlugin,
} from '../scenarios'
import { tagsPlugin } from '../tags'
import { usageDocsPlugin } from '../usage-docs'

const control = (over: Partial<PropControl> & { name: string }): PropControl => ({
  kind: 'text',
  reactive: false,
  required: false,
  ...over,
})

const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  reactivity: [],
  scenarios: [],
  tags: [],
  ...over,
})

const dec = (plugin: AtlasPlugin, input: ComponentIntelligence) =>
  Promise.resolve(plugin.decorate!(input, { cwd: '.' }))

describe('defaultScenarioPlugin', () => {
  it('adds a Default scenario when a component has none', async () => {
    const out = await dec(defaultScenarioPlugin(), ci())
    expect(out.scenarios).toHaveLength(1)
    expect(out.scenarios[0]!.source).toBe('auto-default')
  })
  it('leaves a component with scenarios unchanged', async () => {
    const input = ci({ scenarios: [makeScenario({ component: 'Button', name: 'p' })] })
    expect(await dec(defaultScenarioPlugin(), input)).toBe(input)
  })
})

describe('statesPlugin', () => {
  it('adds one scenario per boolean state prop', async () => {
    const out = await dec(statesPlugin(), ci({ controls: [control({ name: 'disabled', kind: 'boolean' })] }))
    expect(out.scenarios.map((s) => s.name)).toEqual(['disabled'])
    expect(out.scenarios[0]!.args).toEqual({ disabled: true })
  })
  it('ignores non-boolean and unwatched props', async () => {
    const input = ci({ controls: [control({ name: 'disabled', kind: 'text' }), control({ name: 'foo', kind: 'boolean' })] })
    expect(await dec(statesPlugin(), input)).toBe(input)
  })
  it('honors a custom prop list', async () => {
    const out = await dec(statesPlugin({ props: ['foo'] }), ci({ controls: [control({ name: 'foo', kind: 'boolean' })] }))
    expect(out.scenarios.map((s) => s.name)).toEqual(['foo'])
  })
  it('dedupes against an existing scenario id', async () => {
    const input = ci({
      controls: [control({ name: 'disabled', kind: 'boolean' })],
      scenarios: [makeScenario({ component: 'Button', name: 'disabled', source: 'authored' })],
    })
    expect(await dec(statesPlugin(), input)).toBe(input)
  })
})

describe('edgeCasesPlugin', () => {
  it('adds Empty + Long content for the primary text prop', async () => {
    const out = await dec(edgeCasesPlugin(), ci({ controls: [control({ name: 'label', kind: 'text' })] }))
    expect(out.scenarios.map((s) => s.name)).toEqual(['Empty', 'Long content'])
    expect(out.scenarios[0]!.args).toEqual({ label: '' })
    expect(out.scenarios[1]!.args.label).toContain('quick brown fox')
  })
  it('honors a custom longText', async () => {
    const out = await dec(edgeCasesPlugin({ longText: 'LONG' }), ci({ controls: [control({ name: 'label', kind: 'text' })] }))
    expect(out.scenarios[1]!.args.label).toBe('LONG')
  })
  it('is a no-op without a text prop', async () => {
    const input = ci({ controls: [control({ name: 'n', kind: 'number' })] })
    expect(await dec(edgeCasesPlugin(), input)).toBe(input)
  })
})

describe('themePlugin', () => {
  it('adds a scenario per mode (default dark)', async () => {
    const out = await dec(themePlugin(), ci())
    expect(out.scenarios.map((s) => s.name)).toEqual(['Theme dark'])
    expect(out.scenarios[0]!.variant).toEqual({ theme: 'dark' })
  })
  it('honors custom modes', async () => {
    const out = await dec(themePlugin({ modes: ['dark', 'high-contrast'] }), ci())
    expect(out.scenarios.map((s) => s.name)).toEqual(['Theme dark', 'Theme high-contrast'])
  })
  it('dedupes an already-present mode', async () => {
    const input = ci({ scenarios: [makeScenario({ component: 'Button', name: 'Theme dark' })] })
    expect(await dec(themePlugin(), input)).toBe(input)
  })
})

describe('fillDefaultsPlugin', () => {
  it('fills unset required non-reactive props by kind and leaves set / optional / reactive alone', async () => {
    const input = ci({
      controls: [
        control({ name: 'label', kind: 'text', required: true }),
        control({ name: 'bg', kind: 'color', required: true }),
        control({ name: 'count', kind: 'number', required: true }),
        control({ name: 'on', kind: 'boolean', required: true }),
        control({ name: 'size', kind: 'select', required: true, options: ['sm', 'lg'] }),
        control({ name: 'empty', kind: 'select', required: true }), // no options -> skipped
        control({ name: 'raw', kind: 'unknown', required: true }), // no placeholder -> skipped
        control({ name: 'value', kind: 'reactive', reactive: true, required: true }), // reactive -> excluded
        control({ name: 'note', kind: 'text', required: false }), // optional -> not filled
      ],
      scenarios: [makeScenario({ component: 'Button', name: 's', args: { label: 'Kept' } })],
    })
    const out = await dec(fillDefaultsPlugin(), input)
    const args = out.scenarios[0]!.args
    expect(args).toMatchObject({ label: 'Kept', bg: '#3b82f6', count: 0, on: false, size: 'sm' })
    expect(args).not.toHaveProperty('empty')
    expect(args).not.toHaveProperty('raw')
    expect(args).not.toHaveProperty('value')
    expect(args).not.toHaveProperty('note')
  })
  it('is a no-op when nothing required needs filling', async () => {
    const input = ci({
      controls: [control({ name: 'x', kind: 'text', required: true })],
      scenarios: [makeScenario({ component: 'Button', name: 's', args: { x: 'set' } })],
    })
    const out = await dec(fillDefaultsPlugin(), input)
    expect(out.scenarios[0]!).toBe(input.scenarios[0]) // scenario ref unchanged
  })
  it('is a no-op with no required non-reactive controls', async () => {
    const input = ci({ controls: [control({ name: 'x', kind: 'text', required: false })] })
    expect(await dec(fillDefaultsPlugin(), input)).toBe(input)
  })
})

describe('tagsPlugin', () => {
  it('categorizes by name', async () => {
    expect((await dec(tagsPlugin(), ci({ name: 'Button' }))).tags).toContain('form')
    expect((await dec(tagsPlugin(), ci({ name: 'ModalDialog' }))).tags).toContain('overlay')
  })
  it('is a no-op when the name matches no rule', async () => {
    const input = ci({ name: 'Xyzzy' })
    expect(await dec(tagsPlugin(), input)).toBe(input)
  })
  it('is a no-op when the discovered tag is already present', async () => {
    const input = ci({ name: 'Button', tags: ['form'] })
    expect(await dec(tagsPlugin(), input)).toBe(input)
  })
})

describe('usageDocsPlugin (graph stage)', () => {
  it('writes a summary from props + scenarios for components lacking one', async () => {
    const graph = createCatalogGraph([
      ci({
        name: 'Button',
        controls: [control({ name: 'label' })],
        scenarios: [
          makeScenario({ component: 'Button', name: 'ok' }),
          {
            ...makeScenario({ component: 'Button', name: 'bad' }),
            verify: {
              ok: false,
              a11y: { status: 'fail' },
              interaction: { status: 'skip' },
              reactivityCoverage: { status: 'skip' },
              leak: { status: 'skip' },
              snapshot: { status: 'skip' },
            },
          },
        ],
      }),
      ci({ name: 'Spacer' }), // no controls -> no "Props:" clause
    ])
    await usageDocsPlugin().graph!({ graph })
    expect(graph.get('Button')!.summary).toBe('Button — 2 scenario(s), 1 passing. Props: label.')
    expect(graph.get('Spacer')!.summary).toBe('Spacer — 0 scenario(s), 0 passing.')
  })
  it('leaves an existing summary untouched', async () => {
    const graph = createCatalogGraph([ci({ name: 'Button', summary: 'kept' })])
    await usageDocsPlugin().graph!({ graph })
    expect(graph.get('Button')!.summary).toBe('kept')
  })
})

describe('recommendedPlugins', () => {
  it('returns the curated, ordered bundle', () => {
    const names = recommendedPlugins().map((p) => p.name)
    expect(names).toEqual([
      'atlas:tags',
      'atlas:variant-matrix',
      'atlas:states',
      'atlas:edge-cases',
      'atlas:default-scenario',
      'atlas:fill-defaults',
      'atlas:a11y-static',
      'atlas:usage-docs',
    ])
  })
  it('threads baseArgs into the variant-matrix plugin', () => {
    expect(recommendedPlugins({ baseArgs: { x: 1 } })).toHaveLength(8)
  })
})
