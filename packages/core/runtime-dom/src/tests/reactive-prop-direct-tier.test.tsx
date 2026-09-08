/**
 * Behavioural locks for the reactive-prop DIRECT tier (see the compiler's
 * `reactive-prop-direct-tier-emit.test.ts` for the emit half).
 *
 * `<Row value={sig()} />` lowers to `_rpd(sig)`, and the row's `{props.value}`
 * to `_bindProp(props, "value", …)`, which binds through the prop's GETTER —
 * an `_rpd` thunk carrying the signal's `.direct` — so the text binding sits on
 * the signal's O(1) direct slot instead of a tracked effect, and its teardown
 * is a field write instead of a hashed delete. Every spec compiles REAL JSX
 * through `transformJSX`; the assertions are on behaviour and on the
 * subscriber census, which is what the dispose-500 ladder measures.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, _rp, _rpd, _wrapSpread, For, Fragment, h, mergeProps } from '@pyreon/core'
import { _bind, _hasSubscribers, computed, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps, _bindDirect, _bindProp, _bindText, _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild,
  _setHtml, _setAttr, _setClass, _setStyle, _setValue, _tpl, hydrateRoot, mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => { counts[name] = (counts[name] ?? 0) + n }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindDirect, _bindProp, _applyProps, _setStyle, _setAttr, _setClass, _mountSlot,
  _textSlot, _setChild, _setChildAt, _mountChild, _setHtml, _setValue, bindPolymorphicText, h, Fragment, For,
  _lc, _fuse, _rp, _rpd, _wrapSpread, signal, computed, mergeProps,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lower = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
function compileApp(source: string, S: unknown[], ssr = false): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', (ssr ? { ssr: true } : {}) as never)
  const body = lower(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(...DEP_VALUES, S) as () => unknown
}
const strip = (html: string) => html.replace(/<!--[^>]*-->/g, '')
// The bench shape: a signal declared in module scope, passed as a bare call.
const ROW = `function Row(props) { return <span class="r">{props.value}</span> }\n`

describe('direct tier through a prop', () => {
  it('a bare signal-call prop reaches _bindText (the direct tier), updates, and frees the signal on dispose', () => {
    const src = ROW + `const sig = signal('a'); S[0] = sig; const App = () => <div><Row value={sig()} /></div>`
    const S: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, S) as never, null), host)
    const sig = S[0] as ReturnType<typeof signal<string>>
    expect(strip(host.innerHTML)).toBe('<div><span class="r">a</span></div>')
    // The binding took the direct path — `_bindText` counts, no tracked effect for the text.
    expect(counts['runtime.bindText'] ?? 0).toBe(1)
    expect(_hasSubscribers(sig as never)).toBe(true)
    sig.set('b')
    expect(strip(host.innerHTML)).toBe('<div><span class="r">b</span></div>')
    dispose()
    // Teardown left the signal with NO subscribers (direct slot released).
    expect(_hasSubscribers(sig as never)).toBe(false)
  })

  it('a computed source takes the same path', () => {
    const src = ROW + `const base = signal(1); S[0] = base; const c = computed(() => base() * 2); const App = () => <div><Row value={c()} /></div>`
    const S: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, S) as never, null), host)
    const base = S[0] as ReturnType<typeof signal<number>>
    expect(strip(host.innerHTML)).toBe('<div><span class="r">2</span></div>')
    expect(counts['runtime.bindText'] ?? 0).toBe(1)
    base.set(5)
    expect(strip(host.innerHTML)).toBe('<div><span class="r">10</span></div>')
    dispose()
  })

  it('a general reactive prop (_rp) through _bindProp stays live on the tracked path', () => {
    const src = ROW + `const sig = signal(1); S[0] = sig; const App = () => <div><Row value={sig() + 1} /></div>`
    const S: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, S) as never, null), host)
    const sig = S[0] as ReturnType<typeof signal<number>>
    expect(strip(host.innerHTML)).toBe('<div><span class="r">2</span></div>')
    expect(counts['runtime.bindText'] ?? 0).toBe(0)
    sig.set(4)
    expect(strip(host.innerHTML)).toBe('<div><span class="r">5</span></div>')
    dispose()
    expect(_hasSubscribers(sig as never)).toBe(false)
  })

  it('a static prop through _bindProp renders once (data property, no getter)', () => {
    const src = ROW + `const App = () => <div><Row value={"static"} /></div>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, []) as never, null), host)
    expect(strip(host.innerHTML)).toBe('<div><span class="r">static</span></div>')
    dispose()
  })

  it('a VNode-valued signal upgrades the direct binding to a subtree mount', () => {
    const src = ROW + `const sig = signal('t'); S[0] = sig; const App = () => <div><Row value={sig()} /></div>`
    const S: unknown[] = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(compileApp(src, S) as never, null), host)
    const sig = S[0] as ReturnType<typeof signal<unknown>>
    sig.set(h('b', null, 'bold'))
    expect(strip(host.innerHTML)).toBe('<div><span class="r"><b>bold</b></span></div>')
    sig.set('back')
    expect(strip(host.innerHTML)).toBe('<div><span class="r">back</span></div>')
    dispose()
  })

  // NOT locked here: `const props = mergeProps(p, {…})` — the compiler treats
  // a helper-derived object as a plain local, so `{props.value}` is classified
  // STATIC (`_setChild`) and never updates. That is a pre-existing
  // classification gap identical on main, tracked separately; the direct tier
  // neither causes nor fixes it. A getter WITHOUT `.direct` is covered by the
  // general `_rp` spec above (tracked polymorphic fallback).

  it('hydrates in place from the compiled SSR emit and stays live', async () => {
    const src = ROW + `const sig = signal('a'); S[0] = sig; const App = () => <div><Row value={sig()} /></div>`
    const S: unknown[] = []
    const html = await renderToString(h(compileApp(src, S, true) as never, null) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const span = host.querySelector('span')
    const S2: unknown[] = []
    const dispose = hydrateRoot(host, h(compileApp(src, S2) as never, null))
    const sig = S2[0] as ReturnType<typeof signal<string>>
    expect(host.querySelector('span')).toBe(span)
    expect(counts['runtime.bindText'] ?? 0).toBe(1)
    sig.set('b')
    expect(strip(host.innerHTML)).toBe('<div><span class="r">b</span></div>')
    dispose()
    expect(_hasSubscribers(sig as never)).toBe(false)
  })
})
