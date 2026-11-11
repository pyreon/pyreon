/**
 * Real-Chromium twin of `hydrate-children-merge-getters.test.tsx`: a component
 * that forwards its own getter props with a positional child
 * (`h(Inner, props, 'label')`) must stay live after HYDRATION, as it does
 * after mount. `hydrateComponent` used to merge the child with an object
 * spread, which fired the getter once and froze the value; it now shares
 * `componentProps` with `mountComponent`.
 *
 * SERVER is the literal string `renderToString` emits for the tree (pinned in
 * the happy-dom twin).
 *
 * Bisect: restoring the spread in `hydrateComponent` fails the hydrate specs
 * with `expected '/a' to be '/b'`.
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'

const SERVER = '<a href="/a" id="t">label</a>'

afterEach(() => {
  document.body.innerHTML = ''
})

function forwarding(sig: ReturnType<typeof signal<boolean>>) {
  const Inner = (props: { href: string; children?: unknown }) =>
    h('a', { href: () => props.href, id: 't' }, () => props.children as never)
  const Outer = (props: { href: string }) => h(Inner, props, 'label')
  return h(Outer, { href: _rp(() => (sig() ? '/a' : '/b')) } as never)
}

function getterObject(sig: ReturnType<typeof signal<boolean>>) {
  const Inner = (props: { href: string; children?: unknown }) =>
    h('a', { href: () => props.href, id: 't' }, () => props.children as never)
  const src = {
    get href() {
      return sig() ? '/a' : '/b'
    },
  }
  return h(Inner, src as never, 'label')
}

describe('children merge keeps getter props live (real Chromium)', () => {
  for (const [name, tree] of [
    ['h(Inner, props, child) from a component', forwarding],
    ['h(Inner, getterObject, child)', getterObject],
  ] as const) {
    it(`${name} — mount (control)`, async () => {
      const sig = signal(true)
      const { container, unmount } = mountInBrowser(tree(sig))
      const a = container.querySelector('#t')!
      expect(a.getAttribute('href')).toBe('/a')
      sig.set(false)
      await flush()
      expect(a.getAttribute('href')).toBe('/b')
      unmount()
    })

    it(`${name} — hydrate`, async () => {
      const host = document.createElement('div')
      host.innerHTML = SERVER
      document.body.appendChild(host)
      const serverA = host.querySelector('#t')!
      const sig = signal(true)
      const dispose = hydrateRoot(host, tree(sig))
      const a = host.querySelector('#t')!
      expect(a).toBe(serverA)
      expect(host.textContent).toBe('label')
      sig.set(false)
      await flush()
      expect(a.getAttribute('href')).toBe('/b')
      sig.set(true)
      await flush()
      expect(a.getAttribute('href')).toBe('/a')
      dispose()
    })
  }
})
