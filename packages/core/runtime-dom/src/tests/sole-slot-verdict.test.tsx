/**
 * The compiled `_mountSlot` must know whether its slot is the element's SOLE
 * JSX child — the construct for which runtime-server ELIDES the `<!--$-->` pair
 * — and nothing at runtime can decide that, so the compiler emits the verdict.
 *
 * Found by the compiled-path parity fuzz at 3000 seeds (main passed at 300):
 *
 *  - seed 2447: a sole slot whose value is a fragment `<>{() => t()}<input/></>`
 *    — the nested accessor's `<!--$-->` sits at `firstChild`, `_mountSlot` read
 *    it as the slot's OWN range, the nested consumer found its markers gone and
 *    fell to the legacy remove-one-node path: `t<input><input>`.
 *  - seed 1237: the same with a `<Show>` in the slot (its root accessor is
 *    range-marked) wrapping a `<For>` — every row duplicated.
 *
 * The obvious repair — "a placeholder at `firstChild` is sole" — fails the
 * MIRROR shapes (seeds 150 / 273 / 291): `<main>{null}{acc}</main>` and
 * `<span><>{acc}</></span>` are NOT sole to SSR (the `{null}` and the fragment
 * count as children, so the slot is MARKED) while the client template renders
 * no node for them and the ref lands on `firstChild` all the same. Only the
 * compiler sees the JSX-level construct SSR keys on, so it emits `, true` on
 * exactly the sole shape (from the same `ssrSoleChild` predicate `_escSole`
 * uses) and `_mountSlot` trusts it. Bisect: reverting the runtime's use of the
 * flag (positional test restored) fails the mirror shapes; reverting to the
 * marker-first order fails the two seed shapes.
 *
 * Every spec renders through the compiled SSR emit and hydrates through the
 * compiled client emit of the SAME source, asserting DOM equality with a fresh
 * client mount AND a node count (a duplicate is the failure mode).
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, _rp, _rpd, _wrapSpread, For, Fragment, h, Show } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _bindProp,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  Show,
  _lc,
  _fuse,
  _rp,
  _wrapSpread,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code
function compileApp(source: string, S: unknown[], ssr = false): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', (ssr ? { ssr: true } : {}) as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(...DEP_VALUES, S) as () => unknown
}
const strip = (html: string) => html.replace(/<!--[^>]*-->/g, '')
async function roundTrip(source: string, S: unknown[]) {
  const html = await renderToString(h(compileApp(source, S, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const dispose = hydrateRoot(host, h(compileApp(source, S) as never, null))
  return { html, host, dispose, errors }
}

const clientMount = (source: string, S: unknown[]) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount(h(compileApp(source, S) as never, null) as never, host)
  return host
}
async function expectParity(src: string, mk: () => unknown[], selector: string, count: number) {
  const { host, errors } = await roundTrip(src, mk())
  const ref = clientMount(src, mk())
  expect(errors, 'hydration warnings').not.toHaveBeenCalled()
  expect(strip(host.innerHTML)).toBe(strip(ref.innerHTML))
  expect(host.querySelectorAll(selector).length).toBe(count)
}

describe('sole slot whose VALUE begins with a nested range (seeds 2447 / 1237)', () => {
  it('a fragment [accessor, <input/>] in a sole slot adopts once', () =>
    expectParity(
      `const App = () => <main><b>{() => (S[0]() ? <>{() => S[1]()}<input /></> : <i/>)}</b></main>`,
      () => [signal(true), signal('t')],
      'input',
      1,
    ))

  it('the same beside a baked mid-text sibling element (seed 2447 verbatim shape)', () =>
    expectParity(
      `const App = () => <main><p class="c4">{() => S[0]()}{"x"}</p><b>{() => (S[1]() ? <>{() => S[2]()}<input /></> : <i/>)}</b></main>`,
      () => [signal('a'), signal(true), signal('t')],
      'input',
      1,
    ))

  it('a <Show>-wrapped <For> in a sole slot keeps one set of rows (seed 1237)', () =>
    expectParity(
      `const App = () => <main><section class="c0">{() => (S[0]() ? <div/> : <Show when={() => Boolean(S[1]())} fallback={<span class="c4">f</span>}><For each={() => S[2]()} by={(x) => x}>{(x) => <span data-id={String(x)}>{'item' + x}</span>}</For></Show>)}</section></main>`,
      () => [signal(false), signal(true), signal([0, 1])],
      'span',
      2,
    ))
})

describe('slots SSR MARKS although the client template shows them at firstChild (seeds 150 / 273 / 291)', () => {
  it('a {null} sibling before the slot (seed 150)', () =>
    expectParity(
      `const App = () => <main>{null}{() => (S[0]() ? <input /> : <For each={() => S[1]()} by={(x) => x}>{(x) => <div data-id={String(x)}>{'item' + x}</div>}</For>)}</main>`,
      () => [signal(false), signal([0, 1])],
      'div',
      2,
    ))

  it('a fragment-wrapped slot (seed 273)', () =>
    expectParity(
      `const App = () => <main><span class={() => String(S[0]())}>{10}</span><span class={() => String(S[1]())}><>{() => (S[2]() ? <span class="on">{61}</span> : <i>{"hello"}{84}</i>)}</></span></main>`,
      () => [signal('off'), signal('off'), signal(false)],
      'i',
      1,
    ))

  it('a {null} sibling before a nested-component slot (seed 291)', () =>
    expectParity(
      `const Comp = (props) => <div class="comp">{() => props.label()}{props.children}</div>
const App = () => <main>{null}{() => (S[0]() ? <Comp label={() => String(S[1]())}><Comp label={() => String(S[2]())}>{"0"}</Comp></Comp> : 64)}</main>`,
      () => [signal(true), signal('p'), signal('q')],
      'div.comp',
      2,
    ))
})

describe('the text-slot twin: a lone reactive text SSR does not treat as sole', () => {
  // Same predicate, other consequence: the `firstChild` fast form made the
  // verifier REFUSE the template (one text node expected, a marked range found)
  // and rebuild it — correct, just not adopted. Asserting that the SERVER text
  // node survives hydration is what makes these load-bearing; a rebuild passes
  // every DOM-equality check.
  async function expectServerTextAdopted(src: string) {
    const S = [signal('n')]
    const html = await renderToString(h(compileApp(src, S, true) as never, null) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const p = host.querySelector('p')!
    const serverText = Array.from(p.childNodes).find((n) => n.nodeType === 3)!
    expect(serverText, html).toBeDefined()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    hydrateRoot(host, h(compileApp(src, S) as never, null))
    expect(errors, 'hydration warnings').not.toHaveBeenCalled()
    expect(p.childNodes.length).toBe(1)
    expect(p.firstChild).toBe(serverText)
    ;(S[0] as ReturnType<typeof signal<string>>).set('m')
    expect(p.firstChild).toBe(serverText)
    expect(p.textContent).toBe('m')
  }
  it('{null}{n()} adopts the server text node through _textSlot', () =>
    expectServerTextAdopted(`const App = () => <main><p>{null}{() => S[0]()}</p></main>`))
  it('<>{n()}</> likewise', () =>
    expectServerTextAdopted(`const App = () => <main><p><>{() => S[0]()}</></p></main>`))
})
