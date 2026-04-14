import { Fragment, h } from '@pyreon/core'
import { mount } from '../index'

// Lock-in tests for behaviors PR #235 investigated and claimed
// "verified correct". Without code assertions the prose claims
// could silently regress.

describe('Fragment + key — key is inert', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('Fragment with a key renders its children inline (key does not reconcile)', () => {
    mount(
      h(
        Fragment,
        { key: 'x' },
        h('span', { id: 'a' }, 'a'),
        h('span', { id: 'b' }, 'b'),
      ),
      container,
    )

    // Both children are present at the top level of the container —
    // no extra wrapper, key didn't alter the structure.
    expect(container.querySelector('#a')?.textContent).toBe('a')
    expect(container.querySelector('#b')?.textContent).toBe('b')
    expect(container.children).toHaveLength(2)
  })

  it('Fragment without a key renders identically', () => {
    mount(
      h(Fragment, null, h('span', { id: 'a' }, 'a'), h('span', { id: 'b' }, 'b')),
      container,
    )
    expect(container.children).toHaveLength(2)
    expect(container.querySelector('#a')?.textContent).toBe('a')
    expect(container.querySelector('#b')?.textContent).toBe('b')
  })
})

describe('Suspense fast-resolve — fallback-first streaming contract', () => {
  // This is a SERVER behavior, not a browser one. The PR-#235 claim was:
  // renderToStream always emits fallback first, then swap — even if the
  // async child resolves synchronously. Synchronous callers should use
  // renderToString. That contract is already locked in by the existing
  // streaming integration tests; no additional coverage needed here.
  it.skip('locked in by renderToStream integration tests — see runtime-server/src/tests/ssr.test.ts', () => {})
})
