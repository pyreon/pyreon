/**
 * Mount/hydrate parity for the component children merge.
 *
 * `h(Comp, props, ...children)` carries the children POSITIONALLY, so before
 * the component runs both `mountComponent` and `hydrateComponent` fold them
 * into `props.children`. Mount copied descriptors (`mergeProps`); hydrate used
 * an object spread, which fires every getter once and stores a frozen value.
 * The props of a component that has already run are getters
 * (`makeReactiveProps`), so a component that forwards its own props with
 * children — `h(Inner, props, 'label')`, the hand-written HOC/wrapper shape —
 * stayed live when mounted and froze when hydrated.
 *
 * Compiled JSX never reaches the branch with a getter: `<Inner {...props}>`
 * lowers through `_wrapSpread` (getters become branded thunks, i.e. data
 * properties) and the automatic runtime puts children in props, not
 * positionally. The compiled control below locks that too.
 *
 * Bisect: restoring the spread in `hydrateComponent` fails the two `h()`
 * hydrate specs with `expected '/a' to be '/b'`.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, _fuse, _pp, _rp, _rpd, _wrapSpread, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindProp,
  _bindText,
  _mountSlot,
  _setAttr,
  _textSlot,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
})

type Sig = ReturnType<typeof signal<boolean>>

/** Hand-written forwarding: Outer passes its own (getter) props plus a positional child. */
function forwardingTree(sig: Sig) {
  const Inner = (props: { href: string; children?: unknown }) =>
    h('a', { href: () => props.href, id: 't' }, () => props.children as never)
  const Outer = (props: { href: string }) => h(Inner, props, 'label')
  return () => h(Outer, { href: _rp(() => (sig() ? '/a' : '/b')) } as never)
}

/** Same, two forwarding levels with a getter built by `mergeProps`-style descriptor copy. */
function getterObjectTree(sig: Sig) {
  const Inner = (props: { href: string; children?: unknown }) =>
    h('a', { href: () => props.href, id: 't' }, () => props.children as never)
  const src = {
    get href() {
      return sig() ? '/a' : '/b'
    },
  }
  return () => h(Inner, src as never, 'label')
}

async function hydrateOver(
  makeTree: (s: Sig) => () => unknown,
  serverTree: (s: Sig) => () => unknown = makeTree,
) {
  const server = signal(true)
  const html = await renderToString(h(serverTree(server) as never, null))
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const sig = signal(true)
  const dispose = hydrateRoot(host, h(makeTree(sig) as never, null))
  return { host, sig, dispose, html }
}

function mountFresh(makeTree: (s: Sig) => () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const sig = signal(true)
  const dispose = mount(h(makeTree(sig) as never, null), host)
  return { host, sig, dispose }
}

const href = (host: HTMLElement) => host.querySelector('#t')!.getAttribute('href')

describe('children merge keeps getter props live — h() forwarding', () => {
  for (const [name, tree] of [
    ['h(Inner, props, child) from a component', forwardingTree],
    ['h(Inner, getterObject, child)', getterObjectTree],
  ] as const) {
    it(`${name} — mount (control)`, () => {
      const { host, sig, dispose } = mountFresh(tree)
      expect(href(host)).toBe('/a')
      sig.set(false)
      expect(href(host)).toBe('/b')
      dispose()
    })

    it(`${name} — hydrate`, async () => {
      const { host, sig, dispose, html } = await hydrateOver(tree)
      // Pinned: the browser twin hydrates over this literal markup.
      expect(html).toBe('<a href="/a" id="t">label</a>')
      expect(href(host)).toBe('/a')
      expect(host.textContent).toBe('label')
      sig.set(false)
      expect(href(host)).toBe('/b')
      sig.set(true)
      expect(href(host)).toBe('/a')
      dispose()
    })
  }
})

// ─── Compiled control: real transformJSX ────────────────────────────────────
const DEPS = {
  _tpl, _bind, renderEffect, _bindText, _bindProp, _applyProps, _setAttr, _mountSlot, _textSlot,
  bindPolymorphicText, _fuse, _pp, _rp, _rpd, _wrapSpread, h, Fragment, signal,
}
function compile(source: string, sig: Sig): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = transformSync(code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
  }).code
  return new Function(...Object.keys(DEPS), 'sig', `${body}\nreturn App`)(...Object.values(DEPS), sig) as () => unknown
}
const COMPILED = `
  function Inner(props) { return <a id="t" href={props.href}>{props.children}</a> }
  function Outer(props) { return <Inner {...props}>label</Inner> }
  function App() { return <Outer href={sig() ? '/a' : '/b'} /> }
`

describe('children merge — compiled <Inner {...props}>child</Inner> (control)', () => {
  it('mount', () => {
    const { host, sig, dispose } = mountFresh((s) => compile(COMPILED, s))
    expect(href(host)).toBe('/a')
    sig.set(false)
    expect(href(host)).toBe('/b')
    dispose()
  })

  it('hydrate', async () => {
    // The server renders the equivalent h() tree (compiled `_tpl` output is
    // client-only); the markup is identical, so the client adopts it.
    const { host, sig, dispose } = await hydrateOver((s) => compile(COMPILED, s), forwardingTree)
    expect(href(host)).toBe('/a')
    sig.set(false)
    expect(href(host)).toBe('/b')
    dispose()
  })
})
