/**
 * #4370 — a STATIC VNode child set through `_setChild` on an ADOPTED element
 * must adopt the server's nodes instead of appending a second copy.
 *
 * The compiler routes a bare `{x}` child it cannot type statically (a free
 * binding, a helper param, `x.cell.content` in a `<For>` row) to
 * `_setChild(el, x)`. Its function branch already handed an adopted element to
 * the marker-less slot hydrator (#4086), but the VNode branch went straight to
 * `mountChild`, so on hydration the element held the server's copy AND a fresh
 * client copy:
 *
 *   ssr       <td><b>cell</b></td>
 *   hydrated  <td><b>cell</b><b>cell</b></td>
 *
 * The element is adopted with VNode content in it through `<For>` plan replay:
 * row 1's cell holds a string (the adopt verifier admits a sole text there and
 * records a plan), and rows 2..N are admitted at row 1's spots only. A sole
 * VNode child OUTSIDE such a replay is refused by the full verifier (the empty
 * template element does not match server element children), so that shape
 * re-renders rather than duplicating; it is covered below as a guard.
 *
 * Everything here is compiled through the REAL `transformJSX` — vitest's own
 * JSX transform never emits `_tpl`/`_setChild`, so it cannot reproduce this.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { query } from '@pyreon/test-utils'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { _setChild, _tpl, hydrateRoot, mount } from '../index'
import { disableHydrationWarnings } from '../hydration-debug'

const RUNTIME_DEPS = { _tpl, _bind, renderEffect, _setChild, h, Fragment, For, signal }
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function assertDepsCover(code: string): void {
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/gm)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name && !DEP_NAMES.includes(name))
        throw new Error(`[harness] the emit imports "${name}" but RUNTIME_DEPS does not provide it`)
    }
  }
}

const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

function build(source: string, globals: Record<string, unknown>, ssr = false): () => unknown {
  const { code } = ssr
    ? transformJSX(source, 'test.tsx', { ssr: true })
    : transformJSX(source, 'test.tsx')
  assertDepsCover(code)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

const hosts: HTMLElement[] = []
function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)
  return el
}
afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

/** SSR-render `src`, hydrate the same source over it, and return the host. */
async function ssrThenHydrate(src: string, globals: Record<string, unknown>) {
  const html = await renderToString(h(build(src, globals, true) as never, null) as never)
  const el = host()
  el.innerHTML = html
  return { el, html }
}

function freshMount(src: string, globals: Record<string, unknown>): HTMLElement {
  const el = host()
  mount(h(build(src, globals) as never, null), el)
  return el
}

const SOLE = 'function App() { return <p class="x">{content}</p> }'

describe('#4370 — the specs below exercise _setChild on the compiled path', () => {
  it('emits _setChild for the sole bare child and the <For> row cell', () => {
    expect(transformJSX(SOLE, 'test.tsx').code).toContain('_setChild(__root, content)')
    const row = transformJSX(
      'function App() { return <table><tbody><For each={rows} by={(r) => r.id}>{(x) => <tr><td>{x.cell.content}</td></tr>}</For></tbody></table> }',
      'test.tsx',
    ).code
    expect(row).toContain('_setChild(__e0, x.cell.content)')
  })
})

const ROWS =
  'function App() { return <table><tbody><For each={rows} by={(r) => r.id}>{(x) => <tr><td data-label="V">{x.cell.content}</td><td>{x.id}</td></tr>}</For></tbody></table> }'

/**
 * Rows 2..N of a hydrating `<For>` are admitted by PLAN REPLAY: the verifier
 * checks them only at the spots row 1 recorded. Row 1's cell holds a string —
 * a sole text the `_setChild` fast path adopts — so its plan says nothing about
 * the cell, and a later row whose cell holds a VNode is adopted too. Its server
 * nodes are then the cell's whole child list, which `_setChild` must adopt.
 */
function mixedRows(contents: unknown[]) {
  return [
    { id: 0, cell: { content: 'str' } },
    ...contents.map((content, i) => ({ id: i + 1, cell: { content } })),
  ]
}

describe('#4370 — static VNode child through _setChild: SSR → hydrate', () => {
  disableHydrationWarnings()

  async function hydrateRows(contents: unknown[]) {
    const rows = mixedRows(contents)
    const { el, html } = await ssrThenHydrate(ROWS, { rows })
    const serverTrs = [...el.querySelectorAll('tr')]
    const serverCellKids = serverTrs.map((tr) => [...(tr.firstElementChild as Element).childNodes])
    hydrateRoot(el, h(build(ROWS, { rows }) as never, null))
    return { el, html, serverTrs, serverCellKids }
  }

  it('an element-VNode cell adopts the server node (one copy, same identity)', async () => {
    const { el, serverTrs, serverCellKids } = await hydrateRows([h('b', { class: 'v' }, 'one')])
    const trs = [...el.querySelectorAll('tr')]
    // The row really was ADOPTED — otherwise this spec would not reach _setChild's
    // adoption path at all.
    expect(trs[1]).toBe(serverTrs[1])
    const td = trs[1]?.firstElementChild as Element
    expect(td.innerHTML).toBe('<b class="v">one</b>')
    expect(td.childNodes).toHaveLength(1)
    expect(td.firstChild).toBe(serverCellKids[1]?.[0])
    expect(trs[0]?.firstElementChild?.textContent).toBe('str')
  })

  it('a VNode-array cell adopts every server node', async () => {
    const { el, serverCellKids } = await hydrateRows([[h('b', null, 'a'), h('i', null, 'b')]])
    const td = el.querySelectorAll('tr')[1]?.firstElementChild as Element
    expect(td.innerHTML).toBe('<b>a</b><i>b</i>')
    const kids = [...td.childNodes]
    expect(kids).toHaveLength(2)
    expect(kids[0]).toBe(serverCellKids[1]?.[0])
    expect(kids[1]).toBe(serverCellKids[1]?.[1])
  })

  it('a fragment-VNode cell adopts every server node', async () => {
    const { el, serverCellKids } = await hydrateRows([
      h(Fragment, null, h('b', null, 'a'), h('i', null, 'b')),
    ])
    const td = el.querySelectorAll('tr')[1]?.firstElementChild as Element
    expect(td.innerHTML).toBe('<b>a</b><i>b</i>')
    expect(td.querySelector('b')).toBe(serverCellKids[1]?.find((n) => n.nodeName === 'B'))
    expect(td.querySelector('i')).toBe(serverCellKids[1]?.find((n) => n.nodeName === 'I'))
  })

  it('a nested element VNode (the pyreon.dev table cell shape) is not doubled', async () => {
    const { el, html } = await hydrateRows([
      h('span', null, h('span', { class: 'chip' }, 'tie'), ' three-way tie'),
      h('span', null, h('span', { class: 'chip' }, 'win'), ' clear win'),
    ])
    const cells = [...el.querySelectorAll('tr')].map((tr) => tr.firstElementChild?.innerHTML)
    expect(cells).toEqual([
      'str',
      '<span><span class="chip">tie</span> three-way tie</span>',
      '<span><span class="chip">win</span> clear win</span>',
    ])
    expect(el.querySelectorAll('.chip')).toHaveLength(2)
    expect(el.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe(html.replace(/<!--[^>]*-->/g, ''))
  })

  it('a string cell after a string row still adopts the server text node', async () => {
    const { el, serverCellKids } = await hydrateRows(['plain'])
    const td = el.querySelectorAll('tr')[1]?.firstElementChild as Element
    expect(td.textContent).toBe('plain')
    expect(td.childNodes).toHaveLength(1)
    expect(td.firstChild).toBe(serverCellKids[1]?.[0])
  })

  it('a sole VNode child outside <For> hydrates to exactly one copy', async () => {
    const content = h('b', { class: 'v' }, 'cell')
    const { el, html } = await ssrThenHydrate(SOLE, { content })
    hydrateRoot(el, h(build(SOLE, { content }) as never, null))
    expect(el.querySelectorAll('b')).toHaveLength(1)
    expect(el.innerHTML).toBe(html)
  })
})

describe('#4370 — fresh client mount (no hydration) is unchanged', () => {
  it('renders an element, an array, a fragment and a string child once', () => {
    expect(query(freshMount(SOLE, { content: h('b', null, 'x') }), 'p').innerHTML).toBe('<b>x</b>')
    expect(
      query(freshMount(SOLE, { content: [h('b', null, 'a'), h('i', null, 'b')] }), 'p').innerHTML,
    ).toBe('<b>a</b><i>b</i>')
    expect(
      query(
        freshMount(SOLE, { content: h(Fragment, null, h('b', null, 'a'), h('i', null, 'b')) }),
        'p',
      ).innerHTML,
    ).toBe('<b>a</b><i>b</i>')
    expect(query(freshMount(SOLE, { content: 'plain' }), 'p').innerHTML).toBe('plain')
  })

  it('renders <For> row cells once', () => {
    const src =
      'function App() { return <table><tbody><For each={rows} by={(r) => r.id}>{(x) => <tr><td>{x.cell.content}</td></tr>}</For></tbody></table> }'
    const rows = [{ id: 1, cell: { content: h('b', null, 'one') } }]
    const el = freshMount(src, { rows })
    expect([...el.querySelectorAll('td')].map((td) => td.innerHTML)).toEqual(['<b>one</b>'])
  })
})
