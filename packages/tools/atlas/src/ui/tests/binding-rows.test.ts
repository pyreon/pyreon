/**
 * Named bindings — the mapping from the reactive graph to the panel's rows.
 *
 * Fixture graphs here, because the questions are about the MAPPING: which
 * nodes are the component's, how a binding's sources are named, how re-mounts
 * merge, how rows sort and what each uncovered row tells the reader to do.
 * `binding-rows-live.test.ts` runs the same logic against a real mounted
 * preview, so the fixtures cannot drift from what the framework records.
 */
import type { ReactiveGraph, ReactiveNode } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import type { PreviewScope } from '../model'
import { bindingRows, bindingSummary, componentNodes } from '../binding-rows'

const node = (id: number, over: Partial<ReactiveNode> = {}): ReactiveNode => ({
  id,
  kind: 'effect',
  name: `effect#${id}`,
  value: '',
  subscribers: 0,
  fires: 1,
  lastFire: null,
  ...over,
})
const cell = (id: number) => node(id, { kind: 'derived', name: `derived#${id}` })
const bind = (
  id: number,
  binding: NonNullable<ReactiveNode['binding']>,
  over: Partial<ReactiveNode> = {},
) => node(id, { binding, name: `${binding}#${id}`, ...over })

const scope = (over: Partial<PreviewScope> = {}): PreviewScope => ({
  component: 'button',
  mounts: [{ start: 10, end: 40 }],
  props: new Map(),
  remount: new Set(),
  changed: new Set(),
  ignore: new Set(),
  context: new Map(),
  ...over,
})

const CONTROLS = [
  { key: 'label', label: 'Label' },
  { key: 'variant', label: 'Variant' },
  { key: 'size', label: 'Size' },
  { key: 'loading', label: 'Loading' },
]

/** A Button: class ← variant, size (through the styler's derived); text ← label; aria-busy ← loading. */
function button(fires: { cls?: number; text?: number; busy?: number } = {}): ReactiveGraph {
  return {
    nodes: [
      node(5, { kind: 'signal', name: 'chromeSignal' }),
      bind(6, 'child', { target: 'main' }), // the workbench's own, before the window
      cell(11),
      cell(12),
      cell(13),
      cell(14),
      node(15, { kind: 'derived', name: 'derived#15' }), // styler class computed
      bind(16, 'class', { target: 'button', fires: fires.cls ?? 1 }),
      bind(17, 'text', { target: 'span', fires: fires.text ?? 1 }),
      bind(18, 'attr', { target: 'button', key: 'aria-busy', fires: fires.busy ?? 1 }),
      bind(50, 'text', { target: 'b' }), // workbench chrome after the window, reads chrome state
    ],
    edges: [
      { from: 11, to: 15 },
      { from: 12, to: 15 },
      { from: 15, to: 16 },
      { from: 13, to: 17 },
      { from: 14, to: 18 },
      { from: 5, to: 6 },
      { from: 5, to: 50 },
    ],
  }
}
const buttonScope = (over: Partial<PreviewScope> = {}) =>
  scope({
    props: new Map([
      [11, 'variant'],
      [12, 'size'],
      [13, 'label'],
      [14, 'loading'],
    ]),
    ...over,
  })

describe('componentNodes', () => {
  it('is the mount window plus the live control values plus what they drive — never the workbench', () => {
    const ids = componentNodes(button(), buttonScope())
    expect([...ids].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('takes in a binding created after the mount that reads the component (a <Show> opening)', () => {
    const g = button()
    g.nodes.push(bind(60, 'child', { target: 'span' }))
    g.edges.push({ from: 13, to: 60 })
    expect(componentNodes(g, buttonScope()).has(60)).toBe(true)
  })

  it('never enters or walks through an ignored node (the remount watcher)', () => {
    const g = button()
    g.nodes.push(node(61, { name: 'effect#61' }), bind(62, 'child', { target: 'div' }))
    g.edges.push({ from: 13, to: 61 }, { from: 61, to: 62 })
    const ids = componentNodes(g, buttonScope({ ignore: new Set([61]) }))
    expect(ids.has(61)).toBe(false)
    expect(ids.has(62)).toBe(false)
  })

  it('ignores an edge to a node the graph no longer holds', () => {
    const g = button()
    g.edges.push({ from: 13, to: 999 })
    expect(componentNodes(g, buttonScope()).has(999)).toBe(false)
  })

  it('is empty until the preview has mounted in the recording', () => {
    expect(componentNodes(button(), buttonScope({ mounts: [] })).size).toBe(0)
    expect(bindingRows(button(), buttonScope({ mounts: [] }))).toEqual([])
  })
})

describe('bindingRows — names', () => {
  it('names each binding by what it writes and the controls it reads, through derived values', () => {
    const rows = bindingRows(button(), buttonScope(), CONTROLS)
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(Object.keys(byName).sort()).toEqual([
      'aria-busy ← loading',
      'class ← variant, size',
      'text ← label',
    ])
    expect(byName['class ← variant, size']).toMatchObject({
      kind: 'class',
      kindLabel: 'class',
      element: '<button>',
    })
    expect(byName['text ← label']).toMatchObject({
      kind: 'text',
      kindLabel: 'text node',
      element: '<span>',
    })
    expect(byName['aria-busy ← loading']).toMatchObject({
      kind: 'attr',
      kindLabel: 'attribute',
      what: 'aria-busy',
    })
  })

  it('orders control sources by the control list, then named signals, then workbench state', () => {
    const g: ReactiveGraph = {
      nodes: [
        cell(11),
        cell(12),
        node(13, { kind: 'signal', name: 'open' }),
        node(14, { kind: 'derived', name: 'derived#14' }),
        bind(15, 'class', { target: 'div' }),
      ],
      edges: [
        { from: 12, to: 15 },
        { from: 11, to: 15 },
        { from: 13, to: 15 },
        { from: 14, to: 15 },
      ],
    }
    const s = scope({
      props: new Map([
        [11, 'size'],
        [12, 'variant'],
      ]),
      context: new Map([[14, 'theme']]),
    })
    expect(bindingRows(g, s, CONTROLS)[0]?.name).toBe('class ← variant, size, open, theme')
  })

  it('a key no control lists still sorts, after the listed ones, alphabetically', () => {
    const g: ReactiveGraph = {
      nodes: [cell(11), cell(12), cell(13), bind(15, 'class', { target: 'div' })],
      edges: [
        { from: 13, to: 15 },
        { from: 12, to: 15 },
        { from: 11, to: 15 },
      ],
    }
    const s = scope({
      props: new Map([
        [11, 'zeta'],
        [12, 'alpha'],
        [13, 'size'],
      ]),
    })
    expect(bindingRows(g, s, CONTROLS)[0]?.sources).toEqual(['size', 'alpha', 'zeta'])
  })

  it('an unlabelled DOM write gets an honest generic name and kind', () => {
    const g: ReactiveGraph = { nodes: [cell(11), bind(15, 'dom')], edges: [{ from: 11, to: 15 }] }
    const [row] = bindingRows(g, scope({ props: new Map([[11, 'value']]) }))
    expect(row).toMatchObject({ name: 'DOM write ← value', kindLabel: 'direct write', element: '' })
  })

  it('every other kind has a word for what it writes', () => {
    const kinds = ['style', 'prop', 'child', 'list'] as const
    const g: ReactiveGraph = {
      nodes: [cell(11), ...kinds.map((k, i) => bind(20 + i, k))],
      edges: kinds.map((_, i) => ({ from: 11, to: 20 + i })),
    }
    const rows = bindingRows(g, scope({ props: new Map([[11, 'x']]) }))
    expect(rows.map((r) => [r.what, r.kindLabel])).toEqual([
      ['style', 'style'],
      ['property', 'property'],
      ['content', 'child'],
      ['list', 'list'],
    ])
  })

  it('an anonymous signal is "component state"; no recorded source at all is said so', () => {
    const g: ReactiveGraph = {
      nodes: [
        node(11, { kind: 'signal', name: 'signal#11' }),
        bind(15, 'text', { target: 'p' }),
        bind(16, 'child', { target: 'div' }),
      ],
      edges: [{ from: 11, to: 15 }],
    }
    const rows = bindingRows(g, scope())
    expect(rows.map((r) => r.name)).toEqual([
      'text ← component state',
      'content ← pre-recording state',
    ])
    expect(rows[0]?.unnamed).toBe(1)
  })

  it('a derived with no recorded parents is a source by its own name', () => {
    const g: ReactiveGraph = {
      nodes: [
        node(11, { kind: 'derived', name: 'total' }),
        node(12, { kind: 'derived', name: 'derived#12' }),
        bind(15, 'text', { target: 'p' }),
      ],
      edges: [
        { from: 11, to: 15 },
        { from: 12, to: 15 },
      ],
    }
    expect(bindingRows(g, scope())[0]?.name).toBe('text ← total')
  })

  it('a source that points at a node the graph no longer holds is skipped', () => {
    const g: ReactiveGraph = {
      nodes: [cell(11), bind(15, 'text', { target: 'p' })],
      edges: [
        { from: 11, to: 15 },
        { from: 77, to: 15 },
      ],
    }
    expect(bindingRows(g, scope({ props: new Map([[11, 'label']]) }))[0]?.name).toBe('text ← label')
  })

  it('walks through ignored nodes no further and does not loop on a cycle', () => {
    const g: ReactiveGraph = {
      nodes: [
        cell(11),
        node(12, { kind: 'derived', name: 'derived#12' }),
        node(13, { kind: 'derived', name: 'derived#13' }),
        bind(15, 'text', { target: 'p' }),
      ],
      edges: [
        { from: 12, to: 15 },
        { from: 13, to: 12 },
        { from: 12, to: 13 },
        { from: 11, to: 13 },
      ],
    }
    expect(bindingRows(g, scope({ props: new Map([[11, 'label']]) }))[0]?.sources).toEqual([
      'label',
    ])
    expect(
      bindingRows(g, scope({ props: new Map([[11, 'label']]), ignore: new Set([13]) }))[0]?.sources,
    ).toEqual([])
  })
})

describe('bindingRows — coverage', () => {
  it('fires count updates after the mount run; a binding is covered once it updated', () => {
    const rows = bindingRows(button({ cls: 3, text: 2 }), buttonScope(), CONTROLS)
    const fires = Object.fromEntries(rows.map((r) => [r.name, [r.fires, r.status]]))
    expect(fires).toEqual({
      'class ← variant, size': [2, 'covered'],
      'text ← label': [1, 'covered'],
      'aria-busy ← loading': [0, 'never'],
    })
  })

  it('never-fired rows come first, then rebuilt, then covered — in creation order within a group', () => {
    const rows = bindingRows(button({ text: 2 }), buttonScope(), CONTROLS)
    expect(rows.map((r) => r.status)).toEqual(['never', 'never', 'covered'])
    expect(rows.map((r) => r.name)).toEqual([
      'class ← variant, size',
      'aria-busy ← loading',
      'text ← label',
    ])
  })

  it('within a group a row a control drives comes before one only the preview can drive', () => {
    const g: ReactiveGraph = {
      nodes: [
        node(11, { kind: 'signal', name: 'open' }),
        cell(12),
        bind(15, 'child', { target: 'div' }),
        bind(16, 'text', { target: 'p' }),
        bind(17, 'child', { target: 'i' }),
      ],
      edges: [
        { from: 11, to: 15 },
        { from: 12, to: 16 },
      ],
    }
    const rows = bindingRows(g, scope({ props: new Map([[12, 'label']]) }))
    expect(rows.map((r) => r.name)).toEqual([
      'text ← label',
      'content ← open',
      'content ← pre-recording state',
    ])
  })

  it('merges the same binding across re-mounts: an update in any mount counts, the mounts add up', () => {
    const g: ReactiveGraph = {
      nodes: [
        cell(11),
        bind(15, 'text', { target: 'p', fires: 2 }),
        bind(25, 'text', { target: 'p', fires: 1 }),
      ],
      edges: [{ from: 11, to: 25 }], // the first mount's binding is disposed: no edges left
    }
    const s = scope({
      mounts: [
        { start: 10, end: 20 },
        { start: 20, end: 30 },
      ],
      props: new Map([[11, 'label']]),
    })
    const rows = bindingRows(g, s)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'text ← label', fires: 1, mounts: 2, status: 'covered' })
  })

  it('two same-named bindings in one mount stay two rows', () => {
    const g: ReactiveGraph = {
      nodes: [
        cell(11),
        bind(15, 'class', { target: 'span' }),
        bind(16, 'class', { target: 'span' }),
      ],
      edges: [
        { from: 11, to: 15 },
        { from: 11, to: 16 },
      ],
    }
    expect(bindingRows(g, scope({ props: new Map([[11, 'on']]) }))).toHaveLength(2)
  })

  it('a binding of a remount key that only ever got rebuilt says so', () => {
    const g: ReactiveGraph = {
      nodes: [
        cell(11),
        bind(15, 'class', { target: 'div', fires: 1 }),
        bind(25, 'class', { target: 'div', fires: 1 }),
      ],
      edges: [{ from: 11, to: 25 }],
    }
    const s = scope({
      mounts: [
        { start: 10, end: 20 },
        { start: 20, end: 30 },
      ],
      props: new Map([[11, 'state']]),
      remount: new Set(['state']),
      changed: new Set(['state']),
    })
    const [row] = bindingRows(g, s, CONTROLS)
    expect(row).toMatchObject({ status: 'rebuilt', mounts: 2, fires: 0 })
    expect(row?.hint).toContain('Changing `state` re-mounts the preview')
  })
})

describe('bindingRows — what to do about an uncovered binding', () => {
  const one = (g: ReactiveGraph, s: PreviewScope) => bindingRows(g, s, CONTROLS)[0]?.hint

  it('names the control to change', () => {
    expect(one(button(), buttonScope())).toBe('Change “Variant” in Controls to exercise it.')
  })

  it('a key no control drives says so', () => {
    const g: ReactiveGraph = {
      nodes: [cell(11), bind(15, 'text', { target: 'p' })],
      edges: [{ from: 11, to: 15 }],
    }
    expect(one(g, scope({ props: new Map([[11, 'items']]) }))).toContain(
      'Nothing in Controls drives `items`',
    )
  })

  it('a control that changed without the binding re-running points at a value read once', () => {
    const g: ReactiveGraph = {
      nodes: [cell(11), bind(15, 'text', { target: 'p' })],
      edges: [{ from: 11, to: 15 }],
    }
    expect(
      one(g, scope({ props: new Map([[11, 'label']]), changed: new Set(['label']) })),
    ).toContain('Open Lens')
  })

  it('named component state asks for an interaction with that state', () => {
    const g: ReactiveGraph = {
      nodes: [node(11, { kind: 'signal', name: 'open' }), bind(15, 'child', { target: 'div' })],
      edges: [{ from: 11, to: 15 }],
    }
    expect(one(g, scope())).toBe('Interact with the preview so `open` changes.')
  })

  it('theme-driven bindings point at the theme switch', () => {
    const g: ReactiveGraph = {
      nodes: [cell(11), bind(15, 'class', { target: 'div' })],
      edges: [{ from: 11, to: 15 }],
    }
    const row = bindingRows(g, scope({ context: new Map([[11, 'mode']]) }))[0]
    expect(row?.name).toBe('class ← mode')
    expect(row?.workbench).toEqual(['mode'])
    expect(row?.hint).toContain('flip light/dark')
  })

  it('anonymous state asks for a name; nothing recorded explains why it cannot be covered', () => {
    const anon: ReactiveGraph = {
      nodes: [
        node(11, { kind: 'signal', name: 'signal#11' }),
        bind(15, 'child', { target: 'div' }),
      ],
      edges: [{ from: 11, to: 15 }],
    }
    expect(one(anon, scope())).toContain('give it a `name`')
    const none: ReactiveGraph = { nodes: [bind(15, 'child', { target: 'div' })], edges: [] }
    expect(one(none, scope())).toContain('created before this recording started')
  })

  it('a covered row carries no hint', () => {
    expect(
      bindingRows(button({ cls: 2, text: 2, busy: 2 }), buttonScope(), CONTROLS).every(
        (r) => r.hint === '',
      ),
    ).toBe(true)
  })
})

describe('bindingSummary', () => {
  it('reads from the same rows as the list, so the bar and the list agree', () => {
    const rows = bindingRows(button({ text: 2 }), buttonScope(), CONTROLS)
    expect(bindingSummary(rows)).toEqual({
      total: 3,
      covered: 1,
      never: 2,
      rebuilt: 0,
      percent: 33,
    })
  })

  it('counts rebuilt rows apart', () => {
    expect(
      bindingSummary([{ status: 'rebuilt' } as never, { status: 'covered' } as never]),
    ).toMatchObject({ rebuilt: 1, covered: 1, never: 0, percent: 50 })
  })

  it('nothing to measure is null, never a vacuous 100%', () => {
    expect(bindingSummary([]).percent).toBeNull()
  })
})
