/**
 * Behavioural locks for two compiled-template fixes found by the compiled-path
 * hydration parity fuzz — each spec SSRs through the compiled SSR emit and
 * hydrates through the compiled client emit of the SAME source, which is what
 * production runs.
 *
 *  - A LITERAL expression child (`{"t"}`, `{54}`, `{null}`) used to emit a
 *    placeholder + `_setChildAt` while the server rendered plain text with no
 *    range markers, so the adopt verifier bailed on the whole element — every
 *    root swap in the fuzz's first 300 seeds. It now bakes like plain text.
 *  - `<textarea value>` used to bake a DEAD `value` attribute: the textarea
 *    mounted EMPTY on the client, and its SSR form (`<textarea>0</textarea>`)
 *    never adopted.
 *
 * Bisect: reverting the literal bake fails the adoption specs on retention
 * (`kept` false, adopt count 0) while the DOM-equality assertions still pass;
 * reverting the textarea fix fails `.value` with `expected '' to be '0'`.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps, _bindDirect, _bindText, _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild,
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
const adopted = () => counts['runtime.tpl.adopt'] ?? 0

const RUNTIME_DEPS = {
  _tpl, _bind, _bindText, _bindDirect, _applyProps, _setStyle, _setAttr, _setClass, _mountSlot, _textSlot,
  _setChild, _setChildAt, _mountChild, _setHtml, _setValue, bindPolymorphicText, h, Fragment, For, signal,
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

async function roundTrip(source: string, S: unknown[] = []) {
  const html = await renderToString(h(compileApp(source, S, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = Array.from(host.querySelectorAll('*'))
  const dispose = hydrateRoot(host, h(compileApp(source, S) as never, null))
  const after = new Set(host.querySelectorAll('*'))
  return { html, host, dispose, kept: before.filter((n) => after.has(n)).length, total: before.length }
}

describe('literal expression children adopt their SSR text', () => {
  it('a string literal before an element (fuzz seed 5/13 shape)', async () => {
    const { html, host, dispose, kept, total } = await roundTrip(`const App = () => <main>{"t"}<hr /></main>`)
    expect(html).toBe('<main>t<hr /></main>')
    expect(strip(host.innerHTML)).toBe('<main>t<hr></main>')
    expect(kept).toBe(total)
    expect(adopted()).toBe(1)
    dispose()
  })

  it('adjacent numeric literals merge into the ONE text node the server emits', async () => {
    const { html, host, dispose, kept, total } = await roundTrip(`const App = () => <main>{54}{60}</main>`)
    expect(html).toBe('<main>5460</main>')
    expect(host.querySelector('main')!.childNodes.length).toBe(1)
    expect(kept).toBe(total)
    expect(adopted()).toBe(1)
    dispose()
  })

  it('null / boolean / undefined literals contribute nothing on both sides', async () => {
    const { html, host, dispose, kept, total } = await roundTrip(`const App = () => <main>{null}<input checked={true} />{false}{undefined}</main>`)
    expect(html).toBe('<main><input checked /></main>')
    expect(kept).toBe(total)
    expect(adopted()).toBe(1)
    expect(host.querySelector('input')!.checked).toBe(true)
    dispose()
  })

  it('special characters — including a raw > — adopt', async () => {
    const { host, dispose, kept, total } = await roundTrip(`const App = () => <main>{"<&>\\""}<hr /></main>`)
    expect(host.querySelector('main')!.firstChild!.textContent).toBe('<&>"')
    expect(kept).toBe(total)
    expect(adopted()).toBe(1)
    dispose()
  })

  it('a multi-line literal (docs <pre> shape) bakes as entities and adopts with the exact text', async () => {
    const { host, dispose, kept, total } = await roundTrip('const App = () => <pre>{"// a\\nb"}{`x\\ny`}</pre>')
    expect(host.querySelector('pre')!.textContent).toBe('// a\nbx\ny')
    expect(kept).toBe(total)
    expect(adopted()).toBe(1)
    dispose()
  })

  it('a literal beside a reactive text stays static while the binding stays live', async () => {
    const s = signal('a')
    const { host, dispose, kept, total } = await roundTrip(`const App = () => <main>{"x"}<b>{() => S[0]()}</b>{"y"}</main>`, [s])
    expect(strip(host.innerHTML)).toBe('<main>x<b>a</b>y</main>')
    expect(kept).toBe(total)
    s.set('b')
    expect(strip(host.innerHTML)).toBe('<main>x<b>b</b>y</main>')
    dispose()
  })
})

describe('<textarea value> mounts with its value and adopts', () => {
  for (const [name, src] of [
    ['string attr', `const App = () => <main><textarea value="0" /></main>`],
    ['literal expression', `const App = () => <main><textarea value={"0"} /><p>{"x"}</p></main>`],
  ] as const) {
    it(`${name}: client mount .value`, () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const dispose = mount(h(compileApp(src, []) as never, null), host)
      const ta = host.querySelector('textarea')!
      expect(ta.value).toBe('0')
      expect(ta.hasAttribute('value')).toBe(false)
      dispose()
    })

    it(`${name}: hydrates in place from <textarea>0</textarea>`, async () => {
      const { html, host, dispose, kept, total } = await roundTrip(src)
      expect(html).toContain('<textarea>0</textarea>')
      expect(host.querySelector('textarea')!.value).toBe('0')
      expect(kept).toBe(total)
      dispose()
    })
  }
})
