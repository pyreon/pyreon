/**
 * Behavioural locks for what the compiled-path hydration parity fuzz found
 * (`hydration-parity-fuzz-compiled.test.tsx`) — each spec is the minimal shape
 * of one seed, SSR through the compiled SSR emit and hydrated through the
 * compiled client emit of the SAME source, which is what production runs.
 *
 *  - seeds 3/14/22/78: `<Comp>{() => sig()}</Comp>` with a two-slot Comp
 *    hydrated the child's text TWICE (`propalphaalpha`) — the client passed
 *    `props.children` bare to `_mountSlot` where the SSR emit wrapped it.
 *  - seed 76: the same slot holding a sole accessor that rendered null.
 *  - seed 10: two fragment-wrapped texts in one template crashed the client
 *    mount (`null.replaceChild`) — the second placeholder's parent walk was
 *    inlined into phase 2.
 *
 * All three fixes are in `@pyreon/compiler` (both backends); these lock the
 * runtime behaviour end to end. Bisect: reverting the children-slot wrap fails
 * the first two with a duplicated text / a swallowed `console.error`; reverting
 * the fragment predicate fails the third with the crash.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, _rp, _rpd, _wrapSpread, For, Fragment, h, Show } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
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
  _setChild, _setChildAt, _mountChild, _setHtml, bindPolymorphicText, h, Fragment, For, Show, _lc, _fuse, _rp,
  _wrapSpread, signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
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
const COMP = `const Comp = (props) => <div class="comp">{() => props.label()}{props.children}</div>\n`

describe('component children slot — one reactive level per side', () => {
  it('an accessor child hydrates its text ONCE and stays live (fuzz seeds 3/14/22/78)', async () => {
    const text = signal('alpha')
    const label = signal('prop')
    const { html, host, dispose, errors } = await roundTrip(
      COMP + `const App = () => <main><Comp label={() => String(S[1]())}>{() => S[0]()}</Comp></main>`,
      [text, label],
    )
    // server: the slot range (outer) around the child's own range (inner)
    expect(html).toBe('<main><div class="comp"><!--$-->prop<!--/$--><!--$--><!--$-->alpha<!--/$--><!--/$--></div></main>')
    expect(errors).not.toHaveBeenCalled()
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">propalpha</div></main>')
    text.set('ZZ')
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">propZZ</div></main>')
    dispose()
  })

  it('a sole accessor rendering null inside the slot mounts on flip (fuzz seed 76)', async () => {
    const hidden = signal(true)
    const label = signal('L')
    const { host, dispose, errors } = await roundTrip(
      COMP + `const App = () => <main><Comp label={() => String(S[1]())}><div>{() => (S[0]() ? null : <b class="c0">{"0"}{8}</b>)}</div></Comp></main>`,
      [hidden, label],
    )
    expect(errors).not.toHaveBeenCalled()
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">L<div></div></div></main>')
    hidden.set(false)
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">L<div><b class="c0">08</b></div></div></main>')
    dispose()
  })
})

describe('fragment-wrapped texts — phase-2 parents are phase-1 consts', () => {
  const SRC = COMP + `const App = () => <main><Comp label={() => String(S[0]())}><p><>{""}</><b class="c1"><i class="c4">{"témû"}</i><>{"témû"}</></b></p></Comp>{"hello"}</main>`

  it('client mount no longer throws null.replaceChild (fuzz seed 10)', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = mount(h(compileApp(SRC, [signal('prop')]) as never, null), host)
    expect(errors).not.toHaveBeenCalled()
    expect(host.querySelector('pre')).toBeNull()
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">prop<p><b class="c1"><i class="c4">témû</i>témû</b></p></div>hello</main>')
    dispose()
  })

  it('and the same shape hydrates in parity', async () => {
    const { host, dispose, errors } = await roundTrip(SRC, [signal('prop')])
    expect(errors).not.toHaveBeenCalled()
    expect(strip(host.innerHTML)).toBe('<main><div class="comp">prop<p><b class="c1"><i class="c4">témû</i>témû</b></p></div>hello</main>')
    dispose()
  })
})
