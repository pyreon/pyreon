/**
 * Hydration with NODE_ENV='production', over REAL compiled output.
 *
 * The dev-only reporting arms in `hydrate.ts` / `template.ts` / `mount.ts`
 * (path tracking, scope registration, adoption windows, server-text brands) are
 * gated on `process.env.NODE_ENV !== 'production'`. In production they must be
 * absent AND the hydration they wrap must behave identically: adopt the server
 * nodes, run the compiled binds, honour mismatch recovery, and dispose cleanly.
 * Each case renders the SSR emit in dev, flips NODE_ENV for the client walk, and
 * asserts what the user sees plus which server nodes survived, never that a
 * gate was entered.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, For, Fragment, h } from '@pyreon/core'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindText,
  _bindSpread,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _setClass,
  _setHtml,
  _setStyle,
  _setStyleOnce,
  _setValue,
  _textSlot,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setStyleOnce,
  _setAttr,
  _setClass,
  _bindSpread,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  _setValue,
  _fuse,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

/**
 * Every runtime helper the emit IMPORTS must be in `RUNTIME_DEPS`, or the
 * compiled body hits a free variable and `new Function` throws a
 * `ReferenceError` the moment that line runs.
 *
 * That used to be SILENT here. The throw lands inside `hydrateComponent`'s
 * try/catch, which logs and returns `[noop, domNode]` — and until #3505 nothing
 * swept the server DOM the failed hydration never claimed, so the page still
 * showed the SERVER nodes and every assertion below passed while the client
 * build had crashed. Three specs in this file were green for exactly that
 * reason (`_setChild` / `_setChildAt` missing from the map). Assert the deps
 * instead of discovering them.
 */
function assertDepsCover(code: string): void {
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/gm)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && !DEP_NAMES.includes(name)) {
        throw new Error(
          `[harness] the emit imports "${name}" but RUNTIME_DEPS does not provide it — ` +
            `add it, or this spec asserts the server DOM after a crashed client build`,
        )
      }
    }
  }
}

function build(source: string, globals: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = ssr
    ? transformJSX(source, 'test.tsx', { ssr: true })
    : transformJSX(source, 'test.tsx')
  assertDepsCover(code)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '')

/** Render the SSR emit, then hydrate the CLIENT emit over it. */
async function ssrThenHydrate(
  source: string,
  globals: Record<string, unknown> = {},
): Promise<{
  host: HTMLElement
  before: Node[]
  retained: () => number
  dispose: () => void
}> {
  const html = await renderToString(h(build(source, globals, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const dispose = hydrateRoot(host, h(build(source, globals, false) as never, null))
  return {
    host,
    before,
    retained: () => {
      const after = new Set(snapshot(host))
      return before.filter((n) => after.has(n)).length
    },
    dispose,
  }
}

const hosts: HTMLElement[] = []
const track = <T extends { host: HTMLElement }>(r: T): T => {
  hosts.push(r.host)
  return r
}

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove()
})


let _origNodeEnv: string | undefined
beforeEach(() => {
  _origNodeEnv = process.env.NODE_ENV
})
afterEach(() => {
  if (_origNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = _origNodeEnv
})

/** SSR in dev, hydrate the client emit in PRODUCTION. */
async function ssrThenHydrateProd(source: string, globals: Record<string, unknown> = {}) {
  const html = await renderToString(h(build(source, globals, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  hosts.push(host)
  const before = snapshot(host)
  const client = build(source, globals, false)
  process.env.NODE_ENV = 'production'
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const dispose = hydrateRoot(host, h(client as never, null))
  const warned = warn.mock.calls.length
  warn.mockRestore()
  const after = new Set(snapshot(host))
  return { host, retained: before.filter((n) => after.has(n)).length, total: before.length, warned, dispose }
}

describe('production hydration of compiled output', () => {
  it('adopts a static tree and a component, and disposes cleanly', async () => {
    const r = await ssrThenHydrateProd(
      'function Leaf(props) { return <i class="leaf">{props.label}</i> }\nfunction App() { return <div class="c"><Leaf label="x" /><p>static</p></div> }',
    )
    expect(r.host.textContent).toBe('xstatic')
    expect(r.retained).toBe(r.total)
    expect(r.warned).toBe(0)
    expect(() => r.dispose()).not.toThrow()
  })

  it('keeps a reactive text slot live after adopting it', async () => {
    const n = signal(1)
    const r = await ssrThenHydrateProd('function App() { return <p class="p">count {n()}</p> }', { n })
    expect(r.host.textContent).toBe('count 1')
    expect(r.retained).toBe(r.total)
    n.set(2)
    expect(r.host.textContent).toBe('count 2')
    r.dispose()
  })

  it('adopts a text slot whose accessor rendered an empty string, then fills it', async () => {
    // Server range is EMPTY (the accessor rendered ''): not adoptable as a
    // text node, so the bind gets a fresh node in its place; the page must
    // still be live afterwards.
    const t = signal('')
    const r = await ssrThenHydrateProd('function App() { return <p class="p">a {t()} b</p> }', { t })
    expect(r.host.textContent).toBe('a  b')
    t.set('mid')
    expect(r.host.textContent).toBe('a mid b')
    r.dispose()
  })

  it('adopts a text slot between element siblings, in production', async () => {
    const t = signal('v')
    const r = await ssrThenHydrateProd(
      'function App() { return <p class="p">{t()}<b>x</b></p> }',
      { t },
    )
    expect(r.host.textContent).toBe('vx')
    expect(r.retained).toBe(r.total)
    t.set('w')
    expect(r.host.textContent).toBe('wx')
    r.dispose()
  })

  it('replaces an EMPTY text-slot range with a live text node, in production', async () => {
    const t = signal('')
    const r = await ssrThenHydrateProd(
      'function App() { return <p class="p">{t()}<b>x</b></p> }',
      { t },
    )
    expect(r.host.textContent).toBe('x')
    t.set('now')
    expect(r.host.textContent).toBe('nowx')
    r.dispose()
  })

  it('adopts a marked conditional range between siblings, in production', async () => {
    const show = signal(true)
    const r = await ssrThenHydrateProd(
      'function App() { return <div class="c"><b>x</b>{show() && <p class="p">yes</p>}<i>y</i></div> }',
      { show },
    )
    expect(r.host.textContent).toBe('xyesy')
    expect(r.retained).toBe(r.total)
    show.set(false)
    expect(r.host.textContent).toBe('xy')
    show.set(true)
    expect(r.host.textContent).toBe('xyesy')
    r.dispose()
  })

  it('mounts a compiled template fresh (client-only) in production', () => {
    const n = signal(1)
    const App = build('function App() { return <p class="p">v {n()}</p> }', { n }, false)
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    process.env.NODE_ENV = 'production'
    const unmount = mount(h(App as never, null), host)
    expect(host.textContent).toBe('v 1')
    n.set(2)
    expect(host.textContent).toBe('v 2')
    unmount()
    expect(host.textContent).toBe('')
  })

  it('adopts a conditional range and swaps it reactively', async () => {
    const show = signal(true)
    const r = await ssrThenHydrateProd(
      'function App() { return <div class="c">{show() && <p class="p">yes</p>}</div> }',
      { show },
    )
    expect(r.host.textContent).toBe('yes')
    expect(r.retained).toBe(r.total)
    show.set(false)
    expect(r.host.textContent).toBe('')
    show.set(true)
    expect(r.host.textContent).toBe('yes')
    r.dispose()
  })

  it('recovers when the server rendered a different branch than the client picks', async () => {
    // Server shows the branch; the client's first read is false: the range is
    // replaced, not left stale, and nothing is reported in production.
    const serverShow = signal(true)
    const clientShow = signal(false)
    const source =
      'function App() { return <div class="c">{show() && <p class="p">yes</p>}<span>after</span></div> }'
    const html = await renderToString(h(build(source, { show: serverShow }, true) as never, null) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    hosts.push(host)
    const client = build(source, { show: clientShow }, false)
    process.env.NODE_ENV = 'production'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = hydrateRoot(host, h(client as never, null))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    expect(host.textContent).toBe('after')
    clientShow.set(true)
    expect(host.textContent).toBe('yesafter')
    dispose()
  })

  it('hydrates a keyed list and keeps its rows through a reorder', async () => {
    const items = signal([{ id: 1, t: 'a' }, { id: 2, t: 'b' }])
    const r = await ssrThenHydrateProd(
      'function App() { return <ul>{<For each={items()} by={(i) => i.id}>{(i) => <li>{i.t}</li>}</For>}</ul> }',
      { items },
    )
    expect(r.host.textContent).toBe('ab')
    const first = r.host.querySelector('li')
    items.set([{ id: 2, t: 'b' }, { id: 1, t: 'a' }])
    expect(r.host.textContent).toBe('ba')
    expect(r.host.querySelector('li')).not.toBe(first)
    r.dispose()
  })
})
