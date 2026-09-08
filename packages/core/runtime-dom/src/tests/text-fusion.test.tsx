/**
 * TEXT FUSION — `<p>Hello {name}!</p>` is ONE accessor child, so it renders,
 * hydrates and updates as a single text node with no `<!--$-->` range
 * markers anywhere (the `$`-marker normalization was ~20% of the hydration
 * walk; Vue avoids it by fusing adjacent interpolations at compile time).
 *
 * Every spec compiles REAL JSX through `transformJSX` — SSR through the
 * compiled SSR emit (both the h() form and the `_ssr` form) and the client
 * through the compiled client emit of the SAME source, which is what
 * production runs. The behavioural claims: (1) zero markers on the wire;
 * (2) the server's ONE text node is adopted and stays the node every later
 * update writes into; (3) coercion of null/false/true/numbers matches a lone
 * `{x}`; (4) a part that turns into a VNode still MOUNTS (never
 * "[object Object]"), and swaps back to text; (5) the non-fusable shapes are
 * untouched.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, _rp, _rpd, _wrapSpread, For, Fragment, h, Show } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import {
  _esc, _escSole, _ssr, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, _ssrChildren, _ssrForKeyed, _ssrItem, renderToString,
} from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _applyProps, _bindDirect, _bindText, _bindProp, _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild,
  _setHtml, _setAttr, _setClass, _setStyle, _tpl, hydrateRoot, mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindProp, _bindDirect, _applyProps, _setStyle, _setAttr, _setClass, _mountSlot, _textSlot,
  _setChild, _setChildAt, _mountChild, _setHtml, bindPolymorphicText, h, Fragment, For, Show, _lc, _rp, _rpd, _fuse,
  _wrapSpread, signal,
  _ssr, _ssrChildren, _ssrItem, _ssrForKeyed, _esc, _escSole, _ssrAttr, _ssrAttrGen, _ssrAttrUrl,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
type Mode = 'client' | 'ssr-h' | 'ssr-tpl'
function compileApp(source: string, S: unknown[], mode: Mode): () => unknown {
  const opts = mode === 'client' ? {} : mode === 'ssr-h' ? { ssr: true } : { ssr: true, ssrTemplate: true }
  const { code } = transformJSX(source, 'test.tsx', opts as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(...DEP_VALUES, S) as () => unknown
}
async function roundTrip(source: string, S: unknown[], ssr: 'ssr-h' | 'ssr-tpl') {
  const html = await renderToString(h(compileApp(source, S, ssr) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const dispose = hydrateRoot(host, h(compileApp(source, S, 'client') as never, null))
  return { html, host, dispose, errors, warns }
}
function clientMount(source: string, S: unknown[]) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = mount(h(compileApp(source, S, 'client') as never, null), host)
  return { host, dispose }
}
const SSR_MODES: ('ssr-h' | 'ssr-tpl')[] = ['ssr-h', 'ssr-tpl']

describe('text fusion — one text node, no markers, adopted in place', () => {
  for (const ssr of SSR_MODES) {
    it(`\`Hello {name}!\` (${ssr}) — zero markers, server text adopted, updated in place`, async () => {
      const name = signal('Ada')
      const { html, host, dispose, errors } = await roundTrip(
        `const App = () => <p class="m">Hello {S[0]()}!</p>`, [name], ssr,
      )
      expect(html).toBe('<p class="m">Hello Ada!</p>')
      const p = host.firstChild as HTMLElement
      const serverText = p.firstChild as Text
      expect(p.childNodes.length).toBe(1)
      expect(serverText.nodeType).toBe(3)
      name.set('Bob')
      expect(p.innerHTML).toBe('Hello Bob!')
      expect(p.firstChild).toBe(serverText) // identity — adopted, not swapped
      expect(p.childNodes.length).toBe(1)
      expect(errors).not.toHaveBeenCalled()
      dispose()
    })

    it(`\`{a}{b}\` and \`{n} items\` (${ssr}) — every fused shape is one text node`, async () => {
      const a = signal('A'); const b = signal('B'); const n = signal(3)
      const { html, host, dispose, errors } = await roundTrip(
        `const App = () => <div><p>{S[0]()}{S[1]()}</p><i>{S[2]()} items</i><b>{S[2]()} of {S[0]()}, {S[1]()}</b></div>`,
        [a, b, n], ssr,
      )
      expect(html).toBe('<div><p>AB</p><i>3 items</i><b>3 of A, B</b></div>')
      expect(html).not.toContain('<!--')
      const nodes = Array.from(host.querySelectorAll('p, i, b')).map((el) => el.firstChild as Text)
      a.set('X'); b.set('Y'); n.set(4)
      expect(host.innerHTML).toBe('<div><p>XY</p><i>4 items</i><b>4 of X, Y</b></div>')
      Array.from(host.querySelectorAll('p, i, b')).forEach((el, i) => {
        expect(el.firstChild).toBe(nodes[i])
        expect(el.childNodes.length).toBe(1)
      })
      expect(errors).not.toHaveBeenCalled()
      dispose()
    })

    it(`an EMPTY fused run (${ssr}) — server renders nothing, hydration lands a text to write into`, async () => {
      const a = signal(''); const b = signal('')
      const { html, host, dispose, errors } = await roundTrip(
        `const App = () => <p class="e">{S[0]()}{S[1]()}</p>`, [a, b], ssr,
      )
      expect(html).toBe('<p class="e"></p>')
      a.set('x'); b.set('y')
      expect(host.innerHTML).toBe('<p class="e">xy</p>')
      expect(errors).not.toHaveBeenCalled()
      dispose()
    })

    it(`a part that is a VNode (${ssr}) — mounts on the server, rebuilds correctly on the client, swaps back to text`, async () => {
      const v = signal<unknown>(h('b', null, 'X'))
      const { html, host, dispose, errors } = await roundTrip(
        `const App = () => <p class="v">Hello {S[0]()}!</p>`, [v], ssr,
      )
      expect(html).toBe('<p class="v">Hello <b>X</b>!</p>')
      expect(host.querySelector('b')?.textContent).toBe('X')
      v.set('plain')
      expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p class="v">Hello plain!</p>')
      v.set(h('i', null, 'Y'))
      expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p class="v">Hello <i>Y</i>!</p>')
      expect(errors).not.toHaveBeenCalled()
      dispose()
    })
  }

  it('coercion matches a lone `{x}`: null/undefined/false vanish, true and numbers stringify', () => {
    const a = signal<unknown>(null); const b = signal<unknown>(0)
    const { host, dispose } = clientMount(`const App = () => <p>{S[0]()}{S[1]()}</p>`, [a, b])
    expect(host.innerHTML).toBe('<p>0</p>')
    a.set(undefined); b.set(false)
    expect(host.innerHTML).toBe('<p></p>')
    a.set(true); b.set(1.5)
    expect(host.innerHTML).toBe('<p>true1.5</p>')
    expect(host.querySelector('p')!.childNodes.length).toBe(1)
    dispose()
  })

  it('a prop read fuses live — `<p>Hello {props.name}!</p>` re-renders on the prop signal', () => {
    const name = signal('Ada')
    const { host, dispose } = clientMount(
      `const Hi = (props) => <p>Hello {props.name}!</p>\nconst App = () => <Hi name={S[0]()} />`, [name],
    )
    expect(host.innerHTML).toBe('<p>Hello Ada!</p>')
    name.set('Bob')
    expect(host.innerHTML).toBe('<p>Hello Bob!</p>')
    dispose()
  })

  it('whitespace between parts is preserved exactly as unfused JSX rendered it', () => {
    const a = signal('a'); const b = signal('b')
    const { host, dispose } = clientMount(
      `const App = () => <p>{S[0]()} {S[1]()} {"lit"}\n  {S[0]()}</p>`, [a, b],
    )
    expect(host.innerHTML).toBe('<p>a b lita</p>')
    dispose()
  })
})

describe('text fusion — what does NOT fuse', () => {
  const emit = (src: string) => transformJSX(src, 't.tsx').code
  const ssrEmit = (src: string) => transformJSX(src, 't.tsx', { ssr: true, ssrTemplate: true } as never).code

  it('a lone `{sig()}` keeps the single-signal `_bindText` direct tier', () => {
    const out = emit(`const n = signal(1); const v = <p>{n()}</p>`)
    expect(out).toContain('_bindText(n,')
    expect(out).not.toContain('_fuse(')
  })

  it('a static-only mix keeps its baked shape', () => {
    const out = emit(`const x = 1; const v = <p>Hello {x}!</p>`)
    expect(out).toContain('_setChildAt(')
    expect(out).not.toContain('_fuse(')
  })

  it('an element sibling keeps the run mixed (placeholders, `_textSlot`)', () => {
    const out = emit(`const n = signal(1); const v = <p>Hello {n}!<i></i></p>`)
    expect(out).toContain('_textSlot(')
    expect(out).not.toContain('_fuse(')
    expect(ssrEmit(`const n = signal(1); const v = <p>Hello {n}!<i></i></p>`)).toContain('<!--$-->')
  })

  it('a `children` read, an in-file JSX helper call, and inline JSX all stay mount slots', () => {
    expect(emit(`function C(props){ return <p>a {props.children} b</p> }`)).toContain('_mountSlot(')
    expect(emit(`const cell = (v) => <b>{v}</b>; const n = signal(1); const v = <p>a {cell(n())} b</p>`)).toContain('_mountSlot(')
    expect(emit(`const n = signal(true); const v = <p>a {n() && <i/>} b</p>`)).toContain('_mountSlot(')
    for (const src of [
      `function C(props){ return <p>a {props.children} b</p> }`,
      `const n = signal(true); const v = <p>a {n() && <i/>} b</p>`,
    ]) expect(emit(src)).not.toContain('_fuse(')
  })

  it('a COMPONENT parent is never fused — its children are its props', () => {
    const out = emit(`const n = signal(1); const v = <Comp>Hello {n}!</Comp>`)
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('<Comp>Hello {() => n()}!</Comp>')
  })
})
