/**
 * A KEYED root element (`<tr key={row.id}>`) compiles to ONE template whose
 * item carries the key (`_tpl(html, bind, 1, row.id)`), instead of an `h('tr')`
 * VNode holding one template per cell. Every reader of the key reads the same
 * `key` field it reads on a VNode:
 *
 *  - the keyed `.map()` reconciler (`isKeyedArray` / `keyOfVNode` → `mountFor`),
 *  - hydration's keyed check (`needsKeyedReconcile`: a keyed array still mounts
 *    fresh, as it did on the h() path),
 *  - a component reading its children's keys (the server keeps those children
 *    as VNodes, so both sides see the same keys).
 *
 * Every spec compiles REAL JSX through `transformJSX` (the shipped emit) and,
 * for the round trips, SSRs through the compiled SSR emit of the same source.
 *
 * Bisect-verified (2026-11-24), JS backend (native binary moved aside):
 *  - compiler keyed-root bail restored (`hasBailAttr` returning true on `key`):
 *    4 fail — the three emit assertions and the clone spec
 *    (`expected 50 to be +0`: one `createElement('tr')` per row).
 *  - runtime key dropped (`RemountableItem.key = null`): 4 fail — the reorder
 *    spec (the list falls to the unkeyed path and re-creates rows), the SVG
 *    item's key (`expected null to be 7`), the component's keys
 *    (`'null,null,null'`) and the hydrated list's reorder.
 * Restored (and with the native binary) → 9/9.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h, _lc } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _bindText,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _textSlot,
  _tpl,
  hydrateRoot,
  mount,
  onHydrationMismatch,
} from '../index'
import { _dispose2 } from '../dispose-helpers'

const SERVER_HELPERS = Object.fromEntries(
  Object.entries(server).filter(([k]) => k.startsWith('_')),
) as Record<string, unknown>

const CLIENT = {
  _tpl,
  _bind,
  _bindText,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _textSlot,
  _dispose2,
  h,
  Fragment,
  For,
  _lc,
  signal,
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compile<T>(
  source: string,
  scope: Record<string, unknown> = {},
  ssr = false,
): { code: string; App: T } {
  const { code } = transformJSX(source, 'keyed.tsx', ssr ? { ssr: true, ssrTemplate: true } : {})
  const deps = {
    ...(ssr ? { h, Fragment, For, _lc, signal, ...SERVER_HELPERS } : CLIENT),
    ...scope,
  }
  const App = new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(
    ...Object.values(deps),
  ) as T

  return { code, App }
}

afterEach(() => {
  document.body.innerHTML = ''
})

type Row = {
  id: number
  label: ReturnType<typeof signal<string>>
  done: ReturnType<typeof signal<boolean>>
}

const mk = (id: number): Row => ({ id, label: signal(`row ${id}`), done: signal(id % 2 === 0) })

// The maplist benchmark's row: a keyed root, a static cell, a reactive text
// cell and a conditional cell.
const MAP_SOURCE = `
const App = (props) => (
  <table><tbody>
    {props.rows().map((row) => (
      <tr key={row.id}>
        <td class="id">{row.id}</td>
        <td class="label">{row.label()}</td>
        <td class="status">{row.done() ? <span>done</span> : <em>todo</em>}</td>
      </tr>
    ))}
  </tbody></table>
)
`

function mountMap(n: number) {
  const { code, App } = compile<(p: unknown) => VNodeChild>(MAP_SOURCE)
  const rows = signal<Row[]>(Array.from({ length: n }, (_, i) => mk(i + 1)))
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = mount(h(App as never, { rows }), host)
  const trs = () => [...host.querySelectorAll('tr')]
  const text = () => trs().map((tr) => tr.textContent)

  return { code, rows, host, dispose, trs, text }
}

describe('keyed root element: one template, the key on the item', () => {
  it('compiles a keyed .map() row to one _tpl carrying its key', () => {
    const { code } = compile(MAP_SOURCE)
    expect(code).toContain('_tpl("<tr><td class=\\"id\\"></td><td class=\\"label\\"> </td>')
    expect(code).toContain('}, 1, row.id)')
    expect(code).not.toContain('<tr key')
  })

  it('clones every row from its template: no createElement per row', () => {
    const real = document.createElement.bind(document)
    let created = 0
    document.createElement = ((tag: string, o?: ElementCreationOptions) => {
      if (tag === 'tr' || tag === 'td') created++
      return real(tag, o)
    }) as typeof document.createElement
    try {
      const { trs, dispose } = mountMap(50)
      expect(trs()).toHaveLength(50)
      expect(created).toBe(0)
      dispose()
    } finally {
      document.createElement = real
    }
  })

  it('reconciles by key: reorder keeps every row node, cells stay live', () => {
    const { rows, trs, text, dispose } = mountMap(5)
    const before = trs()
    const r = rows.peek()
    rows.set([r[4]!, r[1]!, r[2]!, r[3]!, r[0]!]) // swap first and last
    const after = trs()
    expect(after[0]).toBe(before[4])
    expect(after[4]).toBe(before[0])
    expect(after.slice(1, 4)).toEqual(before.slice(1, 4))

    r[0]!.label.set('moved')
    r[0]!.done.set(true)
    expect(text()[4]).toBe('1moveddone')

    rows.set(rows.peek().filter((x) => x.id !== 3)) // remove
    expect(text()).toEqual(['5row 5todo', '2row 2done', '4row 4done', '1moveddone'])
    rows.set([...rows.peek(), mk(6)]) // append
    expect(trs()).toHaveLength(5)
    expect(trs()[1]).toBe(before[1])
    rows.set([]) // clear
    expect(trs()).toHaveLength(0)
    dispose()
  })

  it('a removed row disposes its cells', () => {
    const { rows, text, dispose } = mountMap(3)
    const gone = rows.peek()[1]!
    rows.set([rows.peek()[0]!, rows.peek()[2]!])
    gone.label.set('ghost')
    expect(text()).toEqual(['1row 1todo', '3row 3todo'])
    dispose()
  })

  it('evaluates a dynamic key expression once, when the item is created', () => {
    let reads = 0
    const keyOf = (r: Row) => {
      reads++
      return `k-${r.id}`
    }
    const { App } = compile<(p: unknown) => VNodeChild>(
      'const App = (props) => <ul>{props.rows().map((r) => <li key={keyOf(r)}>{r.id}</li>)}</ul>',
      { keyOf },
    )
    const rows = signal<Row[]>([mk(1), mk(2)])
    const host = document.createElement('div')
    const dispose = mount(h(App as never, { rows }), host)
    expect(reads).toBe(2)
    const [a, b] = [...host.querySelectorAll('li')]
    rows.set([rows.peek()[1]!, rows.peek()[0]!])
    expect(reads).toBe(4) // the list's re-run, as an h() row's `key` would
    expect([...host.querySelectorAll('li')]).toEqual([b, a])
    dispose()
  })

  it('a keyed SVG root parses in the SVG namespace and carries its key', () => {
    const { code, App } = compile<(p: unknown) => { key: unknown; el: Element }[]>(
      'const App = (p) => p.rows.map((r) => <g key={r.id}><path d={r.d} /></g>)',
    )
    expect(code).toContain('}, 3, r.id)')
    const items = App({ rows: [{ id: 7, d: 'M0 0' }] })
    expect(items[0]!.key).toBe(7)
    expect(items[0]!.el.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(items[0]!.el.firstElementChild!.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })
})

describe('keyed root element: the same keys on the server and the client', () => {
  // A component that renders the keys of the children it receives. An unkeyed
  // child is `null` on a VNode or a `_tpl` item and absent on server raw HTML,
  // the same "no key" to every reader (`!= null` / `??`).
  const Keys = (props: { children?: unknown }) => {
    const kids = ([] as unknown[]).concat(props.children)
    return h('i', null, kids.map((c) => String((c as { key?: unknown }).key ?? null)).join(','))
  }
  const SOURCE = 'const App = () => <Keys><li key="a">a</li><li key={2}>b</li><li>c</li></Keys>'

  it('a component reading its children sees each key on both sides', async () => {
    const client = compile<() => VNodeChild>(SOURCE, { Keys })
    expect(client.code).toContain('_tpl("<li>a</li>", () => null, 1, "a")')
    const host = document.createElement('div')
    const dispose = mount(h(client.App as never, null), host)
    expect(host.textContent).toBe('a,2,null')
    dispose()

    const srv = compile<() => VNodeChild>(SOURCE, { Keys }, true)
    expect(srv.code).toContain('<li key="a">a</li>') // a VNode on the server: `_ssr` has no key
    expect(await renderToString(h(srv.App as never, null))).toBe('<i>a,2,null</i>')
  })
})

describe('keyed root element: SSR and hydration', () => {
  async function roundTrip(source: string, scope: Record<string, unknown>, props: unknown) {
    const html = await renderToString(h(compile(source, scope, true).App as never, props as never))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const reports: string[] = []
    const errors: unknown[] = []
    const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${m.expected} vs ${m.actual}`))
    const origError = console.error
    console.error = (...args: unknown[]) => errors.push(args)
    let dispose: () => void
    try {
      dispose = hydrateRoot(host, h(compile(source, scope).App as never, props as never))
    } finally {
      off()
      console.error = origError
    }

    return { html, host, dispose: dispose!, reports, errors }
  }

  it('a keyed .map() list renders the same HTML and hydrates into a live list', async () => {
    const rows = signal<Row[]>([mk(1), mk(2), mk(3)])
    const { html, host, dispose, reports, errors } = await roundTrip(MAP_SOURCE, {}, { rows })
    expect(html).toContain('<tr><td class="id">1</td><td class="label">row 1</td>')
    expect(errors).toEqual([])
    expect(reports).toEqual([])
    const text = () => [...host.querySelectorAll('tr')].map((tr) => tr.textContent)
    expect(text()).toEqual(['1row 1todo', '2row 2done', '3row 3todo'])

    // The list is live after hydration: reorder by key, cells update.
    const trs = [...host.querySelectorAll('tr')]
    const r = rows.peek()
    rows.set([r[2]!, r[1]!, r[0]!])
    expect([...host.querySelectorAll('tr')]).toEqual([trs[2], trs[1], trs[0]])
    r[0]!.label.set('one')
    r[0]!.done.set(true)
    expect(text()).toEqual(['3row 3todo', '2row 2done', '1onedone'])
    dispose()
  })

  it('a keyed component root adopts the server element', async () => {
    const source =
      'const App = (p) => <section key="root" class="r"><b>{p.label()}</b><i>{p.n()}</i></section>'
    const label = signal('x')
    const n = signal(1)
    const html = await renderToString(
      h(compile(source, {}, true).App as never, { label, n } as never),
    )
    expect(html).toBe('<section class="r"><b>x</b><i>1</i></section>')
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const serverSection = host.firstElementChild
    const dispose = hydrateRoot(host, h(compile(source).App as never, { label, n } as never))
    expect(host.firstElementChild).toBe(serverSection)
    label.set('y')
    n.set(2)
    expect(host.innerHTML).toBe('<section class="r"><b>y</b><i>2</i></section>')
    dispose()
  })
})
