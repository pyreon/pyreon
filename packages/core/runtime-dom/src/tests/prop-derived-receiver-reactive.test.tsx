/**
 * A prop-derived `const` must stay LIVE at every use site, including the
 * positions the native compiler built its own text for:
 *
 *   const lbl = mk(props.n)
 *   <span>{lbl.c()}</span>        // member-call receiver → `_bindText(…, lbl)` fast path
 *   <i class={lbl.c()} />         // → `_bindDirect(…, lbl)` fast path
 *   <b>{tag`x${lbl}`}</b>         // tagged-template substitution
 *   <u>{s ? lbl.c() : 'none'}</u> // bare signal + prop-derived in ONE expression
 *
 * The native backend (the shipped one) used to hand the runtime the BARE
 * `lbl` — the setup-time instance — so flipping the prop never reached the DOM;
 * and for the mixed expression both backends re-sliced the original source and
 * emitted unparseable code. These specs compile REAL source through
 * `transformJSX` (vitest's own JSX transform never emits `_bindText`/`_tpl`),
 * mount it, flip the prop and read the DOM.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, test } from 'vitest'
import { _applyProps, _setAttr, _setClass, _setStyle, bindPolymorphicText, mountChild } from '../index'
import { _bindDirect, _bindText, _mountSlot, _textSlot, _tpl } from '../template'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setClass,
  _setAttr,
  _mountSlot,
  _textSlot,
  bindPolymorphicText,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const stripImports = (code: string) => code.replace(/^import\s+.*$/gm, '').trim()
const lower = (code: string) =>
  transformSync(code, { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

// `mk` is neither a hook/factory name nor in the explicit stateful list, so the
// compiler inlines its result at every use site.
const mk = (n: unknown) => ({ c: () => `C${n}` })
const fnFor = (n: unknown) => () => `F${n}`
const tag = (_s: TemplateStringsArray, v: { c(): string }) => `T${v.c()}`

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  document.body.innerHTML = ''
})

function mountApp(source: string, n: () => number): HTMLDivElement {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lower(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, 'mk', 'tag', 'fnFor', `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, mk, tag, fnFor) as (props: { n: number }) => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  cleanups.push(mountChild(h(App as never, { n: _rp(() => n()) }), container) ?? (() => {}))
  return container
}

describe('prop-derived const stays live where native built its own receiver text', () => {
  test('member-call receiver as a text child (_bindText fast path)', () => {
    const n = signal(1)
    const el = mountApp(
      `function App(props){ const lbl = mk(props.n); return <div><span id="t">{lbl.c()}</span></div> }`,
      n,
    )
    expect(el.querySelector('#t')!.textContent).toBe('C1')
    n.set(2)
    expect(el.querySelector('#t')!.textContent).toBe('C2')
  })

  test('member-call receiver as an attribute (_bindDirect fast path)', () => {
    const n = signal(1)
    const el = mountApp(
      `function App(props){ const lbl = mk(props.n); return <div><i id="a" class={lbl.c()}>x</i></div> }`,
      n,
    )
    expect(el.querySelector('#a')!.getAttribute('class')).toBe('C1')
    n.set(2)
    expect(el.querySelector('#a')!.getAttribute('class')).toBe('C2')
  })

  test('a prop-derived value used as a callee (`{f()}`)', () => {
    const n = signal(1)
    const el = mountApp(
      `function App(props){ const f = fnFor(props.n); return <div><span id="f">{f()}</span></div> }`,
      n,
    )
    expect(el.querySelector('#f')!.textContent).toBe('F1')
    n.set(2)
    expect(el.querySelector('#f')!.textContent).toBe('F2')
  })

  test('tagged-template substitution', () => {
    const n = signal(1)
    const el = mountApp(
      `function App(props){ const lbl = mk(props.n); return <div><b id="g">{tag\`x\${lbl}\`}</b></div> }`,
      n,
    )
    expect(el.querySelector('#g')!.textContent).toBe('TC1')
    n.set(2)
    expect(el.querySelector('#g')!.textContent).toBe('TC2')
  })

  test('a bare signal and a prop-derived const in ONE expression', () => {
    const n = signal(1)
    const el = mountApp(
      `import { signal } from "@pyreon/reactivity"
       function App(props){ const s = signal(true); const lbl = mk(props.n); globalThis.__flip = () => s.set(false); return <div><u id="m">{s ? lbl.c() : 'none'}</u></div> }`,
      n,
    )
    expect(el.querySelector('#m')!.textContent).toBe('C1')
    n.set(2)
    expect(el.querySelector('#m')!.textContent).toBe('C2')
    ;(globalThis as { __flip?: () => void }).__flip!()
    expect(el.querySelector('#m')!.textContent).toBe('none')
  })
})
