/**
 * Real-Chromium lock: `hydrateRoot` registers every hydrated component with
 * the devtools hook (`window.__PYREON_DEVTOOLS__`), with its parent, its own
 * first element, and unregisters it on dispose. Before the fix only `mount()`
 * registered, so every SSR / SSG / Zero app showed an empty component tree.
 *
 * `renderToString` cannot run in the page (runtime-server imports Node
 * built-ins), so the server HTML is the literal string it emits for the same
 * trees; `hydrate-devtools-register.test.tsx` renders it for real and asserts
 * the strings match.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { DEVTOOLS_SSR, DevtoolsApp, DevtoolsLate, devtoolsLateOn } from './_devtools-hydrate-cases'

interface Entry {
  id: string
  name: string
  el: Element | null
  parentId: string | null
}

const hook = (): { getAllComponents(): Entry[]; getComponentTree(): Entry[] } =>
  (
    window as unknown as {
      __PYREON_DEVTOOLS__: { getAllComponents(): Entry[]; getComponentTree(): Entry[] }
    }
  ).__PYREON_DEVTOOLS__

const named = (name: string): Entry[] =>
  hook()
    .getAllComponents()
    .filter((e) => e.name === name)

function hydrate(html: string, view: () => unknown): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const dispose = hydrateRoot(host, h(view as never, null))
  return {
    host,
    dispose: () => {
      dispose()
      host.remove()
    },
  }
}

describe('hydrateRoot registers components with devtools (real Chromium)', () => {
  it('registers each component with its parent and its own first element', () => {
    const { host, dispose } = hydrate(DEVTOOLS_SSR.app, DevtoolsApp)
    const [app] = named('DevtoolsApp')
    const [header] = named('DevtoolsHeader')
    const items = named('DevtoolsItem')
    expect(app?.el).toBe(host.querySelector('main'))
    expect(app?.parentId).toBeNull()
    expect(header?.parentId).toBe(app?.id)
    expect(header?.el).toBe(host.querySelector('header'))
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.el)).toEqual([...host.querySelectorAll('li')])
    for (const i of items) expect(i.parentId).toBe(app?.id)
    expect(
      hook()
        .getComponentTree()
        .map((e) => e.name),
    ).toEqual(['DevtoolsApp'])

    dispose()
    expect(named('DevtoolsApp')).toHaveLength(0)
    expect(named('DevtoolsHeader')).toHaveLength(0)
    expect(named('DevtoolsItem')).toHaveLength(0)
  })

  it('a component mounted after hydration is a child of its hydrated owner', () => {
    devtoolsLateOn.set(false)
    const { host, dispose } = hydrate(DEVTOOLS_SSR.late, DevtoolsLate)
    devtoolsLateOn.set(true)
    const [late] = named('DevtoolsLateChild')
    const [owner] = named('DevtoolsLate')
    expect(late?.el).toBe(host.querySelector('em'))
    expect(late?.parentId).toBe(owner?.id)
    devtoolsLateOn.set(false)
    expect(named('DevtoolsLateChild')).toHaveLength(0)
    dispose()
    expect(named('DevtoolsLate')).toHaveLength(0)
  })

  it('a re-rendered component unregisters the one it replaced', () => {
    const which = signal<'a' | 'b'>('a')
    function A() {
      return h('i', null, 'a')
    }
    function B() {
      return h('b', null, 'b')
    }
    function Host() {
      return h('div', null, () => (which() === 'a' ? h(A, null) : h(B, null)))
    }
    const { dispose } = hydrate('<div><!--$--><i>a</i><!--/$--></div>', Host)
    expect(named('A')).toHaveLength(1)
    which.set('b')
    expect(named('A')).toHaveLength(0)
    expect(named('B')).toHaveLength(1)
    dispose()
    expect(named('B')).toHaveLength(0)
    expect(named('Host')).toHaveLength(0)
  })
})
