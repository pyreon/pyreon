/**
 * Compiled DOM bindings are reactive-graph nodes (#4470).
 *
 * The source goes through the REAL `transformJSX` (the native backend when it
 * loads, else the JS one — they are byte-identical), so the bindings under test
 * are exactly what the compiler emits: `_bindText` and `_bindDirect` on the
 * `direct()` tier, `_bind` for multi-read expressions, `renderEffect` for prop
 * reads, `bindPolymorphicText`, `_mountSlot`, plus `<For>` rows and the h()
 * path's `applyProp` binding.
 *
 * Before the fix none of the `direct()` bindings were graph nodes, `_bind`
 * never registered, and `renderEffect` counted no re-run as a fire — so
 * Reactive Coverage reported every DOM binding as absent or never-ran.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, h } from '@pyreon/core'
import * as jsxRuntime from '@pyreon/core/jsx-runtime'
import * as reactivity from '@pyreon/reactivity'
import {
  __resetReactiveDevtoolsForTesting,
  _rdRegistrySize,
  activateReactiveDevtools,
  describeReactiveGraph,
  getReactiveGraph,
  getUpdateCause,
  type ReactiveNode,
  signal,
} from '@pyreon/reactivity'
import {
  computeReactiveCoverage,
  startReactiveCoverage,
  stopReactiveCoverage,
  takeReactiveCoverage,
} from '@pyreon/reactivity/coverage'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as runtimeDom from '../index'
import { mount } from '../index'

const MODULES: Record<string, Record<string, unknown>> = {
  '@pyreon/runtime-dom': runtimeDom as never,
  '@pyreon/reactivity': reactivity as never,
  '@pyreon/core': core as never,
  '@pyreon/core/jsx-runtime': jsxRuntime as never,
}

/** Compile `source` with the real compiler and return its named export. */
function compile<T>(source: string, exportName: string): T {
  // The compiler leaves component JSX (`<For>`) for the automatic runtime,
  // exactly as the Vite pipeline does; lower that with esbuild.
  const code = transformSync(transformJSX(source, 'binding-graph.tsx').code, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
    format: 'esm',
  }).code
  const names: string[] = []
  const values: unknown[] = []
  const body = code.replace(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm, (_m, list: string, from: string) => {
    const mod = MODULES[from]
    if (!mod) throw new Error(`unexpected import from ${from}`)
    for (const raw of list.split(',')) {
      const [imported, local] = raw.trim().split(/\s+as\s+/)
      if (!imported) continue
      names.push((local ?? imported).trim())
      values.push(mod[imported.trim()])
    }
    return ''
  })
  const js = body.replace(/^export\s+/gm, '')
  // oxlint-disable-next-line no-new-func
  return new Function(...names, `${js}\nreturn ${exportName}`)(...values) as T
}

const SOURCE = `
import { signal } from '@pyreon/reactivity'
export const loading = signal(false, { name: 'loading' })
export const label = signal('a', { name: 'label' })
export const count = signal(0, { name: 'count' })
export function Card(props) {
  return (
    <div class={label()} aria-busy={loading()} title={label() + count()} data-x={props.x}>
      <span>{count()}</span>
      <b>{count() + 1}</b>
      <i>{props.note}</i>
      <input value={label()} />
    </div>
  )
}
`

type Mod = {
  Card: (p: Record<string, unknown>) => unknown
  loading: ReturnType<typeof signal<boolean>>
  label: ReturnType<typeof signal<string>>
  count: ReturnType<typeof signal<number>>
}

function newNodes(before: Set<number>): ReactiveNode[] {
  return getReactiveGraph().nodes.filter((n) => !before.has(n.id))
}

afterEach(() => {
  stopReactiveCoverage()
  __resetReactiveDevtoolsForTesting()
  document.body.innerHTML = ''
})

describe('compiled bindings in the reactive graph', () => {
  it('every live binding is a labelled effect node with an edge from its signal', () => {
    activateReactiveDevtools()
    const m = compile<Mod>(SOURCE, '{ Card, loading, label, count }')
    const x = signal('x0', { name: 'x' })
    const note = signal('n0', { name: 'note' })
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    const el = document.createElement('div')
    document.body.appendChild(el)
    mount(
      h(m.Card as never, {
        get x() {
          return x()
        },
        get note() {
          return note()
        },
      } as never),
      el,
    )
    const bindings = newNodes(before).filter((n) => n.binding !== undefined)
    const names = bindings.map((n) => n.name).sort()
    expect(names).toEqual(
      [
        'aria-busy on <div>', // _bindDirect → _setAttr
        'class on <div>', // _bindDirect → _setClass
        'data-x on <div>', // renderEffect → _setAttr
        'text in <b>', // bindPolymorphicText
        'text in <i>', // _bindProp
        'text in <span>', // _bindText
        'title on <div>', // _bind → _setAttr
        'value on <input>', // _bindDirect → _setValue
      ].sort(),
    )
    for (const b of bindings) expect(b.kind).toBe('effect')
    // Mounted, never updated: every binding has run exactly once.
    expect(bindings.every((b) => b.fires === 1)).toBe(true)

    const { edges } = getReactiveGraph()
    const id = (name: string) => getReactiveGraph().nodes.find((n) => n.name === name)!.id
    expect(edges).toContainEqual({ from: id('loading'), to: id('aria-busy on <div>') })
    expect(edges).toContainEqual({ from: id('count'), to: id('text in <span>') })
    expect(edges).toContainEqual({ from: id('count'), to: id('title on <div>') })

    m.loading.set(true)
    expect(el.querySelector('div')!.getAttribute('aria-busy')).toBe('true')
    const busy = getReactiveGraph().nodes.find((n) => n.name === 'aria-busy on <div>')!
    expect(busy.fires).toBe(2)
    const cause = getUpdateCause(busy.id)!
    expect(cause.chain.map((l) => l.name)).toEqual(['loading'])
  })

  it('coverage: a DOM binding moves from ran-once to covered when its signal changes', () => {
    const m = compile<Mod>(SOURCE, '{ Card, loading, label, count }')
    startReactiveCoverage()
    const el = document.createElement('div')
    mount(h(m.Card as never, { x: 1, note: 'static' } as never), el)
    const entry = (name: string) => takeReactiveCoverage().entries.find((e) => e.name === name)!
    expect(entry('text in <span>')).toMatchObject({ reason: 'ran-once', binding: 'text', target: 'span' })
    expect(entry('aria-busy on <div>')).toMatchObject({ reason: 'ran-once', key: 'aria-busy' })
    m.count.set(1)
    expect(entry('text in <span>')).toMatchObject({ reason: 'covered', fires: 2 })
    expect(entry('aria-busy on <div>').reason).toBe('ran-once')
    const report = takeReactiveCoverage()
    // class, aria-busy, title (_bind), text in <span>, text in <b>, value on
    // <input>; `data-x` and `text in <i>` read static props, so they are dead.
    expect(report.bindings.total).toBe(6)
    // Static props (`x: 1`, `note: 'static'`) make dead bindings — not reactive
    // edges, so not in the denominator.
    expect(report.entries.some((e) => e.name === 'data-x on <div>')).toBe(false)
    expect(report.entries.some((e) => e.reason === 'never-ran')).toBe(false)
  })

  it('describeReactiveGraph: signals shown only through the DOM are not orphans', () => {
    const m = compile<Mod>(SOURCE, '{ Card, loading, label, count }')
    activateReactiveDevtools()
    const el = document.createElement('div')
    mount(h(m.Card as never, { x: 1, note: 'n' } as never), el)
    const desc = describeReactiveGraph()
    const orphans = desc.insights.filter((i) => i.kind === 'orphan-signal').map((i) => i.name)
    expect(orphans).not.toContain('loading')
    expect(orphans).not.toContain('count')
    expect(desc.nodes.find((n) => n.name === 'loading')!.behavior).toBe('changing it updates 1 DOM binding')
    expect(desc.summary.bindings).toBe(6)
  })

  it('<For> rows and the list itself are nodes; the h() path names its prop bindings', () => {
    activateReactiveDevtools()
    const rows = signal([{ id: 1, n: signal(0) }], { name: 'rows' })
    const cls = signal('c', { name: 'cls' })
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    const el = document.createElement('div')
    mount(
      h(
        'ul',
        { class: () => cls() },
        h(For as never, { each: rows, by: (r: { id: number }) => r.id }, ((r: { n: () => number }) =>
          h('li', null, () => r.n())) as never,
        ),
      ),
      el,
    )
    const names = newNodes(before)
      .filter((n) => n.binding !== undefined)
      .map((n) => n.name)
      .sort()
    expect(names).toEqual(['class on <ul>', 'list of <ul>', 'text in <li>'])
    // Framework-created bindings carry no creation site pointing into runtime-dom.
    for (const n of newNodes(before)) expect(n.loc?.file ?? '').not.toMatch(/runtime-dom\/src\/(nodes|props|mount)\.ts/)
  })
})

describe('no leak: unmounted bindings leave the registry', () => {
  const hasGc = typeof globalThis.gc === 'function'

  async function collectGarbage(): Promise<void> {
    // The finalizer runs after the collection that found the node dead.
    for (let i = 0; i < 6; i++) {
      globalThis.gc!()
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  it('the GC harness is present, so the spec below runs rather than skips', () => {
    expect(hasGc, 'run with --expose-gc (see vitest.config.ts)').toBe(true)
  })

  it.runIf(hasGc)('mount/unmount 200× (compiled direct bindings, _bind, For rows) does not grow the registry', async () => {
    const m = compile<Mod>(SOURCE, '{ Card, loading, label, count }')
    activateReactiveDevtools()
    const cycle = () => {
      const el = document.createElement('div')
      const rows = signal(
        Array.from({ length: 5 }, (_, i) => ({ id: i, n: signal(i) })),
      )
      const x = signal('x')
      const dispose = mount(
        h(
          'section',
          null,
          h(m.Card as never, {
            get x() {
              return x()
            },
            note: 'n',
          } as never),
          h(For as never, { each: rows, by: (r: { id: number }) => r.id }, ((r: { n: () => number }) =>
            h('li', null, () => r.n())) as never,
          ),
        ),
        el,
      )
      // exercise re-runs on both tiers before unmounting
      m.count.update((c) => c + 1)
      dispose()
    }
    // Warm up (module-level signals register once), then measure.
    for (let i = 0; i < 20; i++) cycle()
    await collectGarbage()
    const baseline = _rdRegistrySize()
    for (let i = 0; i < 200; i++) cycle()
    await collectGarbage()
    // 200 cycles × ~20 nodes each would be ~4,000 records if any leaked.
    expect(_rdRegistrySize() - baseline).toBeLessThan(20)
    // The module-level signals' direct slots are empty again (the `_d1`
    // single-subscriber path released its wrapper on dispose).
    const live = getReactiveGraph().nodes.find((n) => n.name === 'count')!
    expect(live.subscribers).toBe(0)
  })

  it('a coverage session pins nodes until it stops, then releases them', async () => {
    const m = compile<Mod>(SOURCE, '{ Card, loading, label, count }')
    startReactiveCoverage()
    for (let i = 0; i < 50; i++) {
      const el = document.createElement('div')
      mount(h(m.Card as never, { x: 1, note: 'n' } as never), el)()
    }
    if (hasGc) await collectGarbage()
    const pinned = takeReactiveCoverage().bindings.total
    expect(pinned).toBe(50 * 6)
    stopReactiveCoverage()
    if (!hasGc) return
    await collectGarbage()
    expect(_rdRegistrySize()).toBeLessThan(20)
  })
})

describe('review follow-ups (#4472)', () => {
  it('getUpdateCause survives a cascade larger than the fire buffer (600 compiled rows)', () => {
    activateReactiveDevtools()
    const m = compile<{ Row: () => unknown; locale: ReturnType<typeof signal<string>> }>(
      `
import { signal } from '@pyreon/reactivity'
export const locale = signal('en', { name: 'locale' })
export function Row() { return <li>{locale()}</li> }
`,
      '{ Row, locale }',
    )
    const el = document.createElement('div')
    const seen: string[] = []
    const e = reactivity.effect(() => {
      seen.push(m.locale())
    })
    mount(h('ul', null, ...Array.from({ length: 600 }, () => h(m.Row as never, null))), el)
    // One write → 600 binding re-runs + 1 effect run: more fires than the
    // 512-entry buffer holds, so the signal's own entry is evicted.
    m.locale.set('fr')
    expect(el.textContent!.startsWith('frfr')).toBe(true)
    const effCause = getUpdateCause(reactivity._rdNodeId(e)!)
    expect(effCause?.chain.map((l) => l.name)).toEqual(['locale'])
    expect(effCause?.rootReached).toBe(true)
    const rows = getReactiveGraph().nodes.filter((n) => n.binding === 'text')
    expect(rows).toHaveLength(600)
    for (const row of [rows[0]!, rows[599]!]) {
      const c = getUpdateCause(row.id)!
      expect(c.chain.map((l) => l.name)).toEqual(['locale'])
      expect(c.rootReached).toBe(true)
    }
  })

  it('compiled updaters that write the DOM without a setter are still DOM bindings', () => {
    activateReactiveDevtools()
    const m = compile<{ B: () => unknown; busy: ReturnType<typeof signal<boolean>>; n: ReturnType<typeof signal<number>> }>(
      `
import { signal } from '@pyreon/reactivity'
export const busy = signal(false, { name: 'busy' })
export const n = signal(1.5, { name: 'n' })
export function B() {
  return <span><button disabled={busy()}>x</button><input checked={busy()} /><b>{n().toFixed(2)}</b></span>
}
`,
      '{ B, busy, n }',
    )
    const el = document.createElement('div')
    // 8 × (disabled + checked) on busy, 8 × toFixed text on n
    mount(h('div', null, ...Array.from({ length: 8 }, () => h(m.B as never, null))), el)
    const desc = describeReactiveGraph()
    expect(desc.summary).toMatchObject({ effects: 0, bindings: 24 })
    // a theme-like signal shown in many places is not a hot signal
    expect(desc.insights.filter((i) => i.kind === 'high-fanout')).toEqual([])
    expect(desc.nodes.find((n) => n.name === 'busy')!.behavior).toBe('changing it updates 16 DOM bindings')
    const report = computeReactiveCoverage(getReactiveGraph().nodes)
    expect(report.bindings).toEqual({ total: 24, covered: 0 })
    expect(new Set(report.entries.filter((x) => x.kind === 'effect').map((x) => x.binding))).toEqual(new Set(['dom']))
    m.n.set(2)
    expect(el.querySelector('b')!.textContent).toBe('2.00')
    expect(computeReactiveCoverage(getReactiveGraph().nodes).bindings).toEqual({ total: 24, covered: 8 })
  })

  it('the rocketstyle collapse class binding is labelled on the signal path too', () => {
    activateReactiveDevtools()
    const dark = signal(false, { name: 'dark' })
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    const el = document.createElement('div')
    mount(runtimeDom._rsCollapse('<button>x</button>', 'l', 'd', dark as never) as never, el)
    const nodes = getReactiveGraph().nodes.filter((n) => !before.has(n.id))
    expect(nodes.map((n) => n.name)).toEqual(['class on <button>'])
    dark.set(true)
    expect(el.querySelector('button')!.className).toBe('d')
  })

  it('<For> rows bound through createSelector.subscribe are bindings with a cause', () => {
    activateReactiveDevtools()
    const m = compile<{ T: () => unknown; cur: ReturnType<typeof signal<number>> }>(
      `
import { signal, createSelector } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
export const cur = signal(1, { name: 'cur' })
export const isSel = createSelector(cur)
export const rows = signal([{ id: 1 }, { id: 2 }], { name: 'rows' })
export function T() {
  return <table><For each={rows()} by={(r) => r.id}>{(row) => <tr class={isSel(row.id) ? 'danger' : ''}><td>x</td></tr>}</For></table>
}
`,
      '{ T, cur }',
    )
    const el = document.createElement('div')
    mount(h(m.T as never, null), el)
    const rows = () => getReactiveGraph().nodes.filter((n) => n.name === 'class on <tr>')
    expect(rows().map((n) => n.fires)).toEqual([1, 1])
    m.cur.set(2)
    expect(el.querySelectorAll('tr.danger')).toHaveLength(1)
    // deselected row 1 and selected row 2 both re-ran
    expect(rows().map((n) => n.fires)).toEqual([2, 2])
    const c = getUpdateCause(rows()[1]!.id)!
    expect(c.chain[0]!.name).toBe('cur')
    expect(c.rootReached).toBe(true)
  })
})
