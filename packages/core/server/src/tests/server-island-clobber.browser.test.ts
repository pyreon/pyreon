import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * DOM clobbering (#4768 review). In a real browser, an element with an `id`
 * (or a named `<form>`/`<img>`/`<embed>`/`<object>`/`<iframe>`) makes a global
 * of that name resolve to the element (named access on Window). Markup an
 * attacker gets into the page can do that, so trusted server-island
 * configuration must not be read from such a global: an element there used to
 * turn the base into something `trustedBase` refused (every island stayed on
 * its fallback) and the registry into something `serverIsland()` crashed on.
 *
 * Real Chromium: happy-dom does not implement named access.
 */
const planted: Element[] = []

function plant(id: string): void {
  const a = document.createElement('a')
  a.id = id
  document.body.appendChild(a)
  planted.push(a)
}

/** A NEW instance of the module, evaluated now (the query makes it a separate module). */
let instance = 0

async function freshModule(): Promise<typeof import('../server-island')> {
  instance++
  return import(/* @vite-ignore */ `../server-island.ts?fresh=${instance}`)
}

afterEach(() => {
  for (const el of planted.splice(0)) el.remove()
  vi.unstubAllGlobals()
  delete (globalThis as Record<string, unknown>).__PYREON_SERVER_ISLANDS__
})

describe('server islands vs. a clobbered global (real Chromium)', () => {
  it('the named-access precondition holds here', () => {
    plant('__probe_named_access__')
    expect((window as unknown as Record<string, unknown>).__probe_named_access__).toBeInstanceOf(HTMLAnchorElement)
  })

  it('an element named __PYREON_SERVER_ISLAND_BASE__ does not switch islands off (no base set)', async () => {
    plant('__PYREON_SERVER_ISLAND_BASE__')
    const { activateServerIslandElement } = await freshModule()
    const urls: string[] = []
    vi.stubGlobal('fetch', (u: string) => {
      urls.push(u)
      return Promise.resolve(new Response('<b>x</b>', { status: 200 }))
    })
    const el = document.createElement('pyreon-server-island')
    el.setAttribute('data-name', 'Clobbered')
    document.body.appendChild(el)
    planted.push(el)
    activateServerIslandElement(el)
    await new Promise((r) => setTimeout(r, 0))
    expect(urls).toEqual(['/_pyreon/fragment/Clobbered'])
    expect(el.hasAttribute('data-island-error')).toBe(false)
  })

  it('an element named __PYREON_SERVER_ISLANDS__ does not replace the registry', async () => {
    plant('__PYREON_SERVER_ISLANDS__')
    const { serverIsland, getRegisteredServerIslands } = await freshModule()
    expect(() => serverIsland(async () => () => null, { name: 'AfterClobber' })).not.toThrow()
    expect(getRegisteredServerIslands().has('AfterClobber')).toBe(true)
  })
})
