/**
 * #4086 — a FUNCTION held in a NAMED binding (`const label = () => …`,
 * `function label() {}`, a helper param, a function-valued prop) is an
 * accessor, exactly as an inline arrow is.
 *
 * Before the fix the compiled template path treated it as a plain value at two
 * sites the h() path never did:
 *
 *   - child:        `_setChild(__root, label)` → `textContent = fn` rendered the
 *                   closure SOURCE ("() => `n=${n()}`")
 *   - DOM property: `__e0.checked = isOn` stored the FUNCTION (always truthy),
 *                   so the box was checked whatever `isOn()` returned
 *
 * Everything here is compiled through the REAL `transformJSX` (vitest's own
 * JSX transform never emits `_tpl`/`_setChild`, so it cannot reproduce this).
 */
import { transformJSX } from '@pyreon/compiler'
import { query } from '@pyreon/test-utils'
import { _fuse, _lc, For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindSpread,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _setClass,
  _setHtml,
  _setProp,
  _setPropStatic,
  _setStyle,
  _setStyleOnce,
  _setValue,
  _textSlot,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { disableHydrationWarnings } from '../hydration-debug'
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
  _setProp,
  _setPropStatic,
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

function build(
  source: string,
  globals: Record<string, unknown>,
  ssr = false,
): (props?: Record<string, unknown>) => unknown {
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
  for (const h of hosts.splice(0)) h.remove()
})

function mountApp(
  source: string,
  globals: Record<string, unknown>,
  props: Record<string, unknown> = {},
) {
  const el = host()
  const dispose = mount(h(build(source, globals) as never, props), el)
  return { el, dispose }
}

describe('#4086 — named accessor as a CHILD', () => {
  it('a const arrow child renders its value and follows its signal', () => {
    const n = signal(1)
    const { el } = mountApp(
      'function App() { const label = () => `n=${n()}`; return <p>{label}</p> }',
      { n },
    )
    expect(el.textContent).toBe('n=1')
    n.set(2)
    expect(el.textContent).toBe('n=2')
  })

  it('a module-level const arrow child (the issue repro) renders and updates', () => {
    const n = signal(1)
    const label = () => `n=${n()}`
    const { el } = mountApp('function App() { return <p>{label}</p> }', { label })
    expect(el.textContent).toBe('n=1')
    n.set(5)
    expect(el.textContent).toBe('n=5')
  })

  it('a function DECLARATION child renders and updates', () => {
    const n = signal('a')
    const { el } = mountApp(
      'function App() { function label() { return n() } return <p>{label}</p> }',
      { n },
    )
    expect(el.textContent).toBe('a')
    n.set('b')
    expect(el.textContent).toBe('b')
  })

  it('a helper PARAM child renders and updates', () => {
    const n = signal(1)
    const { el } = mountApp(
      'const wrap = (f) => <p>{f}</p>; function App() { return <section>{wrap(() => n())}</section> }',
      { n },
    )
    expect(el.textContent).toBe('1')
    n.set(9)
    expect(el.textContent).toBe('9')
  })

  it('a named accessor in MIXED content renders in place and updates', () => {
    const n = signal(1)
    const label = () => n()
    const { el } = mountApp('function App() { return <p><b>a</b>{label}<i>b</i></p> }', { label })
    expect(el.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p><b>a</b>1<i>b</i></p>')
    n.set(2)
    expect(el.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p><b>a</b>2<i>b</i></p>')
  })

  it('the binding is disposed with its component', () => {
    const n = signal(1)
    const label = () => n()
    const { el, dispose } = mountApp('function App() { return <p>{label}</p> }', { label })
    const p = query(el, 'p')
    expect(p.textContent).toBe('1')
    dispose()
    n.set(2)
    expect(p.textContent).toBe('1')
  })
})

describe('#4086 — named accessor as a DOM PROPERTY', () => {
  it('checked={isOn} with a named accessor reads its value and follows it', () => {
    const on = signal(false)
    const isOn = () => on()
    const { el } = mountApp(
      'function App() { return <div><input type="checkbox" checked={isOn} /><span>x</span></div> }',
      {
        isOn,
      },
    )
    const input = query(el, 'input')
    expect(input.checked).toBe(false)
    on.set(true)
    expect(input.checked).toBe(true)
    on.set(false)
    expect(input.checked).toBe(false)
  })

  it('a function-valued PROP passed on as checked reads its value and follows it', () => {
    const on = signal(true)
    const { el } = mountApp(
      'function App(p) { return <div><input type="checkbox" checked={p.c} /><span>x</span></div> }',
      {},
      { c: () => on() },
    )
    const input = query(el, 'input')
    expect(input.checked).toBe(true)
    on.set(false)
    expect(input.checked).toBe(false)
  })

  it('disabled={isOff} and value={getV} resolve their accessor', () => {
    const off = signal(true)
    const v = signal('hello')
    const isOff = () => off()
    const getV = () => v()
    const { el } = mountApp(
      'function App() { return <div><input disabled={isOff} value={getV} /><span>x</span></div> }',
      {
        isOff,
        getV,
      },
    )
    const input = query(el, 'input')
    expect(input.disabled).toBe(true)
    expect(input.value).toBe('hello')
    off.set(false)
    v.set('world')
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('world')
  })

  it('non-function values are untouched', () => {
    const { el } = mountApp(
      'function App(p) { return <div><input type="checkbox" checked={p.c} /><span>x</span></div> }',
      {},
      {
        c: false,
      },
    )
    expect(query(el, 'input').checked).toBe(false)
  })

  it('the static binding is disposed with its component', () => {
    const on = signal(false)
    const isOn = () => on()
    const { el, dispose } = mountApp(
      'function App() { return <div><input type="checkbox" checked={isOn} /><span>x</span></div> }',
      { isOn },
    )
    const input = query(el, 'input')
    dispose()
    on.set(true)
    expect(input.checked).toBe(false)
  })
})

describe('#4086 — SSR → hydrate', () => {
  disableHydrationWarnings()

  it('a named accessor child adopts the server text and stays live', async () => {
    const n = signal(1)
    const label = () => `n=${n()}`
    const src = 'function App() { return <p class="x">{label}</p> }'
    const html = await renderToString(h(build(src, { label }, true) as never, null) as never)
    const el = host()
    el.innerHTML = html
    const p = query(el, 'p')
    const text = p.firstChild
    hydrateRoot(el, h(build(src, { label }) as never, null))
    expect(query(el, 'p')).toBe(p)
    expect(p.textContent).toBe('n=1')
    // The server's text node is ADOPTED, not rebuilt beside a second copy.
    // (The accessor's range anchors are comments; only text is asserted.)
    const texts = [...p.childNodes].filter((c) => c.nodeType === 3)
    expect(texts).toEqual([text])
    n.set(2)
    expect(p.textContent).toBe('n=2')
  })

  it('checked={isOn} hydrates to the accessor value and stays live', async () => {
    const on = signal(false)
    const isOn = () => on()
    const src =
      'function App() { return <div><input type="checkbox" checked={isOn} /><span>x</span></div> }'
    const html = await renderToString(h(build(src, { isOn }, true) as never, null) as never)
    const el = host()
    el.innerHTML = html
    hydrateRoot(el, h(build(src, { isOn }) as never, null))
    const input = query(el, 'input')
    expect(input.checked).toBe(false)
    on.set(true)
    expect(input.checked).toBe(true)
  })
})

describe('#4086 — the specs above exercise the COMPILED template path', () => {
  // A lone `<input/>` lowers to h(), where a function prop was always an
  // accessor — so every DOM-property spec wraps it in an element. Guard that
  // premise: if the emit stops templatizing, these specs stop testing anything.
  it('emits the runtime sinks rather than h()', () => {
    const code = transformJSX(
      'function App(p) { return <div><input type="checkbox" checked={isOn} /><input checked={p.c} /><span>x</span></div> }',
      'test.tsx',
    ).code
    expect(code).toContain('_setPropStatic(__e0, "checked", isOn)')
    expect(code).toContain('_setProp(__e1, "checked", p.c)')
    const child = transformJSX('function App() { return <p>{label}</p> }', 'test.tsx').code
    expect(child).toContain('_setChild(__root, label)')
  })
})
