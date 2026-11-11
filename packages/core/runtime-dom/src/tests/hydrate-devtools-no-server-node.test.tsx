/**
 * Devtools registration when hydration has NO server node to adopt: the page
 * was empty (or the component sits after everything the server rendered), so
 * the component mounts fresh. The registered entry must still point at the
 * element the component rendered, found from where the walk started, and
 * dispose must unregister it. Real `h()` / `hydrateRoot`, devtools read
 * through the page hook.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { disableHydrationWarnings, hydrateRoot } from '../index'

interface Entry {
  id: string
  name: string
  el: Element | null
}
const all = (): Entry[] =>
  (window as unknown as { __PYREON_DEVTOOLS__: { getAllComponents(): Entry[] } }).__PYREON_DEVTOOLS__.getAllComponents()
const named = (name: string): Entry[] => all().filter((e) => e.name === name)

const Fresh: ComponentFn = () => h('section', { id: 'fresh' }, 'built on the client')

const hosts: HTMLElement[] = []
afterEach(() => {
  for (const x of hosts.splice(0)) x.remove()
})
disableHydrationWarnings()

describe('hydrating a component with no server node', () => {
  it('registers a component hydrated into an EMPTY container with its own element', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const dispose = hydrateRoot(host, h(Fresh, null))
    const el = host.querySelector('#fresh')
    expect(el).not.toBeNull()
    expect(named('Fresh').map((e) => e.el)).toEqual([el])
    dispose()
    expect(named('Fresh')).toEqual([])
  })

  it('registers a SYNC component hydrated over the range the server emitted for it as async', () => {
    // The server awaited this component (async there), so its output sits
    // between $pas / $pae markers; here it is sync. It must still show up in
    // devtools with its own element, and unregister on dispose.
    const host = document.createElement('div')
    host.innerHTML = '<!--$pas--><section id="ranged">server</section><!--$pae-->'
    document.body.appendChild(host)
    hosts.push(host)
    const Ranged: ComponentFn = () => h('section', { id: 'ranged' }, 'server')
    const dispose = hydrateRoot(host, h(Ranged, null))
    const el = host.querySelector('#ranged')
    expect(el).not.toBeNull()
    expect(named('Ranged').map((e) => e.el)).toEqual([el])
    dispose()
    expect(named('Ranged')).toEqual([])
  })
})
