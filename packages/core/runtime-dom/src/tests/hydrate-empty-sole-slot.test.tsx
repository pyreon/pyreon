/**
 * Regression lock — an EMPTY marker-less sole slot hydrates with LIVE bindings.
 *
 * `<i class={() => c()}>{() => cond() ? null : <For …/>}</i>` renders on the
 * server as `<i class="off"></i>`: the accessor is the element's SOLE child, so
 * runtime-server elides the `<!--$-->` pair, and because it rendered `null` the
 * element is EMPTY. On the compiled path the slot's ref is `__e0.firstChild`,
 * which is `null` against that server element — a designed case (`_mountSlot`:
 * "including the empty case, where both sides are null").
 *
 * #3307 added `!isMidSlotText(placeholder)` to that branch's guard, and
 * `isMidSlotText` read `.nodeType` unguarded: the adopt bind THREW on the null
 * placeholder, `hydrateComponent`'s catch logged it and kept the server nodes,
 * and every binding of the element — the slot AND the sibling `class` — was
 * dead. Identity kept, no hydration mismatch, no error box: only a flip showed
 * it. Found by the compiled-path parity fuzz (seeds 76 + 112) the day after.
 *
 * Every spec compiles REAL JSX through `transformJSX`; vitest's own JSX
 * transform never emits `_tpl` / `_mountSlot` and cannot reproduce this.
 *
 * Bisect: dropping the `n !== null` guard fails the empty-slot spec (a
 * `console.error` from `hydrateComponent`'s catch, then `expected 'off' to be
 * 'on'`) while the non-empty control stays green.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
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
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindDirect, _applyProps, _setStyle, _setAttr, _setClass,
  _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild, _setHtml,
  bindPolymorphicText, h, Fragment, For, signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code

/** Compile `source` once; the SERVER arm uses the SSR emit, the client the DOM emit. */
function compileApp(source: string, S: unknown[], ssr = false): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', (ssr ? { ssr: true } : {}) as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)
  return fn(...DEP_VALUES, S) as () => unknown
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

describe('empty marker-less sole slot — bindings stay live after adoption', () => {
  it('sole accessor rendering null + a sibling class binding (fuzz seed 112)', async () => {
    const cls = signal('off')
    const hidden = signal(true)
    const items = signal([0, 1, 2, 3])
    const src = `const App = () => <main><i class={() => String(S[0]())}>{() => (S[1]() ? null : <For each={() => S[2]()} by={(x) => x}>{(x) => <span data-id={String(x)}>{'item' + x}</span>}</For>)}</i><hr aria-selected="true" /></main>`
    const { html, host, dispose, errors } = await roundTrip(src, [cls, hidden, items])
    expect(html).toBe('<main><i class="off"></i><hr aria-selected="true" /></main>')
    const i = host.querySelector('i')!
    expect(errors).not.toHaveBeenCalled()

    cls.set('on')
    expect(i.className).toBe('on')
    expect(host.querySelector('i')).toBe(i)

    hidden.set(false)
    expect(host.querySelectorAll('[data-id]').length).toBe(4)
    expect(strip(host.innerHTML)).toBe(
      '<main><i class="on"><span data-id="0">item0</span><span data-id="1">item1</span><span data-id="2">item2</span><span data-id="3">item3</span></i><hr aria-selected="true"></main>',
    )
    dispose()
  })

  it('control — the same slot rendering an element adopts and flips to empty', async () => {
    const hidden = signal(false)
    const src = `const App = () => <main><i>{() => (S[0]() ? null : <b>x</b>)}</i></main>`
    const { html, host, dispose, errors } = await roundTrip(src, [hidden])
    expect(html).toBe('<main><i><b>x</b></i></main>')
    const b = host.querySelector('b')
    expect(errors).not.toHaveBeenCalled()
    expect(host.querySelector('b')).toBe(b)
    hidden.set(true)
    expect(strip(host.innerHTML)).toBe('<main><i></i></main>')
    hidden.set(false)
    expect(strip(host.innerHTML)).toBe('<main><i><b>x</b></i></main>')
    dispose()
  })
})
