/**
 * #4473 through the REAL compiler: a prop the h() path writes as a DOM property
 * with no content attribute under its own name (`innerHTML`, `textContent`,
 * `defaultValue`, media state, …) must reach the element the same way from a
 * compiled component. Before the fix the template path wrote it as an attribute
 * (`<div innerhtml="<i>hi</i>">`, an empty div), or baked a literal into the
 * template HTML. Each case mounts the compiled component and the hand-written
 * h() tree side by side and compares the observable DOM.
 */
import { transformJSX } from '@pyreon/compiler'
import { _rp, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { renderToString } from '@pyreon/runtime-server'
import { _bindDirect, _setAttr, _tpl, hydrateRoot, mount, setSanitizer } from '../index'

const RUNTIME_DEPS = { _tpl, _bindDirect, _setAttr, _rp, h, Fragment, signal }
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function compile(source: string, s: unknown): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  return new Function(...DEP_NAMES, 's', `${body}\nreturn C`)(...DEP_VALUES, s) as () => unknown
}

function mountInto(node: unknown): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return { host, dispose: mount(node as never, host) }
}

beforeAll(() => setSanitizer((html) => html.replace(/<script[\s\S]*?<\/script>/g, '')))
afterAll(() => setSanitizer(null))
afterEach(() => {
  document.body.innerHTML = ''
})

describe('property-only props: compiled path matches h() (#4473)', () => {
  it('the issue reproduction: reactive innerHTML is sanitized content, not an attribute', () => {
    const s = signal('<i>hi</i><script>bad()</script>')
    const C = compile(`export function C() { return <section><div innerHTML={s()} /></section> }`, s)
    const compiled = mountInto(h(C as never, null))
    const div = compiled.host.querySelector('div')!
    expect(div.hasAttribute('innerhtml')).toBe(false)
    expect(div.innerHTML).toBe('<i>hi</i>')
    s.set('<b>next</b>')
    expect(div.innerHTML).toBe('<b>next</b>')

    const viaH = mountInto(h('section', null, h('div', { innerHTML: () => s() })))
    expect(viaH.host.innerHTML).toBe(compiled.host.innerHTML)
    compiled.dispose()
    viaH.dispose()
  })

  it('a literal innerHTML is not baked into the template as an attribute', () => {
    const C = compile(`export function C() { return <section><div innerHTML="<em>lit</em>" /></section> }`, null)
    const { host, dispose } = mountInto(h(C as never, null))
    expect(host.innerHTML).toBe('<section><div><em>lit</em></div></section>')
    dispose()
  })

  it.each([
    ['textContent', 'p', 'text', (el: Element) => el.textContent],
    ['innerText', 'p', 'text', (el: Element) => (el as HTMLElement).innerText],
    ['defaultValue', 'input', 'dv', (el: Element) => (el as HTMLInputElement).defaultValue],
    ['defaultChecked', 'input', true, (el: Element) => (el as HTMLInputElement).defaultChecked],
    ['volume', 'video', 0.25, (el: Element) => (el as HTMLVideoElement).volume],
    ['playbackRate', 'video', 2, (el: Element) => (el as HTMLVideoElement).playbackRate],
    ['httpEquiv', 'meta', 'refresh', (el: Element) => el.getAttribute('http-equiv')],
  ] as const)('%s on <%s> reaches the element as h() writes it', (name, tag, value, read) => {
    const s = signal<unknown>(value)
    const C = compile(`export function C() { return <section><${tag} ${name}={s()} /></section> }`, s)
    const compiled = mountInto(h(C as never, null))
    const viaH = mountInto(h('section', null, h(tag, { [name]: () => s() })))
    const a = compiled.host.querySelector(tag)!
    const b = viaH.host.querySelector(tag)!
    expect(read(a)).toEqual(value)
    expect(read(a)).toEqual(read(b))
    expect(a.getAttributeNames()).toEqual(b.getAttributeNames())
    expect(a.hasAttribute(name.toLowerCase())).toBe(false)
    compiled.dispose()
    viaH.dispose()
  })

  it.each(['textContent', 'innerText'])(
    'SSR renders %s as the escaped content, like the client mount (no dead attribute)',
    async (name) => {
      const tree = () => h('section', null, h('p', { [name]: 'a < b' }))
      const html = await renderToString(tree())
      expect(html).toBe('<section><p>a &lt; b</p></section>')
      const client = mountInto(tree())
      expect(client.host.innerHTML).toBe(html)
      client.dispose()
      // The compiled SSR fast path bails these to h() in both backends.
      const { code } = transformJSX(`export const C = (p) => <section><p ${name}={p.t} /></section>`, 'c.tsx', {
        ssr: true,
      } as never)
      expect(code).not.toContain(`"${name}"`)
    },
  )

  it('a server-rendered textContent hydrates in place and stays reactive', async () => {
    const s = signal('one')
    const html = await renderToString(h('section', null, h('p', { textContent: () => s() })))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const p = host.querySelector('p')!
    const dispose = hydrateRoot(host, h('section', null, h('p', { textContent: () => s() })))
    expect(host.querySelector('p')).toBe(p)
    s.set('two')
    expect(p.outerHTML).toBe('<p>two</p>')
    dispose()
  })
})
