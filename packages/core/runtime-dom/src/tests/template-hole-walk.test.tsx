/**
 * Walked template holes, end to end through the REAL compiler (vitest's own
 * JSX transform never emits `_tpl`).
 *
 * An expression child of a templated element that builds JSX — a `.map`, a
 * conditional, an accessor — is preserved and walked, so its elements are
 * templates of their own instead of `jsx()` calls (compiler
 * `template-hole-walk.test.ts`). These specs hold the runtime half: the output
 * renders and updates like the `h()` it replaces, the SSR emit of the same
 * source hydrates under it keeping every server node, and nothing reports a
 * mismatch.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import * as server from '@pyreon/runtime-server'
import { query } from '@pyreon/test-utils'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'

const { h } = core
const { signal } = reactivity

afterEach(() => {
  document.body.innerHTML = ''
})

const DEPS: Record<string, unknown> = { ...reactivity, ...core, ...dom }
const SSR_DEPS: Record<string, unknown> = { ...reactivity, ...core, ...server }

function lower(code: string): string {
  return transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

/** Compile `source` (which defines `App`) and evaluate it against `deps` plus `globals`. */
function build(
  source: string,
  opts: Parameters<typeof transformJSX>[2],
  deps: Record<string, unknown>,
  globals: Record<string, unknown>,
): () => unknown {
  const { code } = transformJSX(source, 'hole.tsx', opts)
  const names = [...Object.keys(deps), ...Object.keys(globals)]
  const fn = new Function(...names, `${lower(code)}\nreturn App`)

  return fn(...Object.values(deps), ...Object.values(globals)) as () => unknown
}

const clientApp = (source: string, globals: Record<string, unknown> = {}) =>
  build(source, { templatizeComponentChildren: true }, DEPS, globals)

function mountApp(source: string, globals: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = dom.mount(h(clientApp(source, globals) as never, null), host)

  return { host, dispose }
}

describe('a walked hole renders and updates like h()', () => {
  it('a `.map` item binds its own signal reads: the class updates in place, the list still re-maps', () => {
    const xs = signal([1, 2, 3])
    const sel = signal(1)
    const { host, dispose } = mountApp(
      `const App = () => <ul>{xs().map((x) => <li class={sel() === x ? 'on' : 'off'}>{x}</li>)}</ul>`,
      { xs, sel },
    )
    const lis = () => [...host.querySelectorAll('li')]
    expect(lis().map((l) => `${l.className}:${l.textContent}`)).toEqual(['on:1', 'off:2', 'off:3'])
    const before = lis()
    sel.set(2)
    expect(lis().map((l) => l.className)).toEqual(['off', 'on', 'off'])
    // The item's own binding tracked `sel`: the slot did not re-map, so every
    // row kept its element (the `h()` form rebuilt all three).
    expect(lis()).toEqual(before)
    xs.set([3, 4])
    expect(lis().map((l) => `${l.className}:${l.textContent}`)).toEqual(['off:3', 'off:4'])
    dispose()
    expect(host.innerHTML).toBe('')
  })

  it('handlers and refs inside a walked item work', () => {
    const picked: number[] = []
    const refs: Element[] = []
    const { host, dispose } = mountApp(
      'const App = () => <ul>{[1, 2].map((x) => <li ref={(el) => el && refs.push(el)}><button onClick={() => picked.push(x)}>go</button></li>)}</ul>',
      { picked, refs },
    )
    const buttons = host.querySelectorAll('button')
    ;(buttons[1] as HTMLButtonElement).click()
    ;(buttons[0] as HTMLButtonElement).click()
    expect(picked).toEqual([2, 1])
    expect(refs.map((r) => r.tagName)).toEqual(['LI', 'LI'])
    dispose()
  })

  it('a conditional hole flips between nested templates any number of times', () => {
    const on = signal(true)
    const { host, dispose } = mountApp(
      'const App = () => <div>{on() ? <b class="y">yes</b> : <i>no</i>}<s /></div>',
      { on },
    )
    for (let k = 0; k < 3; k++) {
      expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<div><b class="y">yes</b><s></s></div>')
      on.set(false)
      expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<div><i>no</i><s></s></div>')
      on.set(true)
    }
    dispose()
  })

  it('a component inside a walked item receives a live prop and runs once', () => {
    const label = signal('a')
    let runs = 0
    const Row = (props: { v: string }) => {
      runs++
      return h('em', null, () => props.v)
    }
    const { host, dispose } = mountApp(
      'const App = () => <ul>{[1].map((i) => <li><Row v={label()} /></li>)}</ul>',
      { label, Row },
    )
    expect(host.querySelector('em')?.textContent).toBe('a')
    label.set('b')
    expect(host.querySelector('em')?.textContent).toBe('b')
    expect(runs).toBe(1)
    dispose()
  })

  it('an option list built by a walked `.map` keeps the select value (PZ-09 shape)', () => {
    const v = signal('b')
    const { host, dispose } = mountApp(
      `const App = () => <select value={v()}>{['a', 'b', 'c'].map((o) => <option value={o}>{o}</option>)}</select>`,
      { v },
    )
    const select = query(host, 'select')
    expect(select.value).toBe('b')
    v.set('c')
    expect(select.value).toBe('c')
    dispose()
  })
})

describe('the SSR emit of a walked hole hydrates under the client emit', () => {
  const SOURCE = `const App = () => (
  <ul class="list">
    <b />
    {xs().map((x) => <li class={x === sel() ? 'on' : ''}><b>{x}</b>{x}<i /></li>)}
    {on() ? <p>shown <em>{sel()}</em></p> : null}
  </ul>
)`

  /** Fresh state per side: the server and the client each get their own signals. */
  const mk = () => ({ xs: signal([1, 2, 3]), sel: signal(2), on: signal(true) })

  for (const ssrTemplate of [false, true]) {
    it(`every server node is kept and nothing is reported (ssrTemplate=${ssrTemplate})`, async () => {
      const serverApp = build(SOURCE, { ssr: true, ssrTemplate, templatizeComponentChildren: true }, SSR_DEPS, mk())
      const html = await server.renderToString(h(serverApp as never, null))
      // The nested templates' placeholders carry their server ranges.
      expect(html).toContain('<li class=""><b>1</b><!--$-->1<!--/$--><i></i></li>')

      const host = document.createElement('div')
      host.innerHTML = html
      document.body.appendChild(host)
      const before = [...host.querySelectorAll('*')]
      const reports: string[] = []
      const off = dom.onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
      const state = mk()
      let dispose: () => void
      try {
        dispose = dom.hydrateRoot(host, h(clientApp(SOURCE, state) as never, null))
      } finally {
        off()
      }
      expect(reports).toEqual([])
      expect(before.filter((n) => !host.contains(n))).toEqual([])

      const lis = () => [...host.querySelectorAll('li')].map((l) => `${l.className}|${l.textContent}`)
      expect(lis()).toEqual(['|11', 'on|22', '|33'])
      state.sel.set(3)
      expect(lis()).toEqual(['|11', '|22', 'on|33'])
      expect(host.querySelector('em')?.textContent).toBe('3')
      state.xs.set([4])
      expect(lis()).toEqual(['|44'])
      state.on.set(false)
      expect(host.querySelector('p')).toBeNull()
      dispose!()
    })
  }

  it('a `.map` item parameter shadowing a signal renders its value on the `_ssr` path', async () => {
    // The `_ssr` item builders sliced the item's holes without the callback's
    // parameters in scope: `x` was auto-called as the outer signal and the
    // render threw `x is not a function` on a number item.
    const src = `const App = () => { const x = signal('outer'); return <ul>{[1, 2].map((x) => <li>{x}</li>)}</ul> }`
    const serverApp = build(src, { ssr: true, ssrTemplate: true }, SSR_DEPS, {})
    expect(await server.renderToString(h(serverApp as never, null))).toBe('<ul><li>1</li><li>2</li></ul>')
  })
})
