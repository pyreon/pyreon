// @vitest-environment node
/**
 * Server islands (Phase 4) — marker component, registry, and the
 * server-only fragment renderer. Real `h()` + real `renderToString`
 * throughout (test-environment-parity: no mock vnodes).
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { provideRequestLocals, useRequestLocals } from '../middleware'
import {
  _resetServerIslands,
  getRegisteredServerIslands,
  SERVER_ISLAND_MINT,
  serverIsland,
} from '../server-island'
import type { ServerIslandMint } from '../server-island'
import { renderServerIslandFragment } from '../server-island-render'

const Badge: ComponentFn = (props: { label?: string }) =>
  h('span', { class: 'badge' }, `${props.label ?? 'Cart'}!`)

afterEach(() => {
  _resetServerIslands()
  vi.restoreAllMocks()
})

describe('serverIsland — marker component', () => {
  it('renders ONLY the marker with name + codec props; content stays out of the page', async () => {
    const Island = serverIsland(async () => Badge, { name: 'CartBadge' })
    const html = await renderToString(h(Island, { label: 'Cart', count: 3 } as never))
    expect(html).toContain('<pyreon-server-island')
    expect(html).toContain('data-name="CartBadge"')
    expect(html).toContain('data-props=')
    expect(html).toContain('&quot;count&quot;:3')
    // The island's CONTENT must NOT be in the page — that's the whole
    // cacheability contract.
    expect(html).not.toContain('class="badge"')
  })

  it('renders the fallback inside the marker (no-JS / pre-swap content)', async () => {
    const Island = serverIsland(async () => Badge, {
      name: 'WithFallback',
      fallback: h('span', { class: 'skeleton' }, '…'),
    })
    const html = await renderToString(h(Island, {}))
    expect(html).toContain('class="skeleton"')
  })

  it('drops children + omits data-props when empty', async () => {
    const Island = serverIsland(async () => Badge, { name: 'NoProps' })
    const html = await renderToString(h(Island, {}))
    expect(html).not.toContain('data-props')
  })

  it('registers in the registry; duplicate names keep the FIRST and warn in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loaderA = async () => Badge
    const loaderB = async () => Badge
    serverIsland(loaderA, { name: 'Dup' })
    serverIsland(loaderB, { name: 'Dup' })
    expect(getRegisteredServerIslands().get('Dup')?.loader).toBe(loaderA)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate name "Dup"'))
  })
})

describe('serverIsland — signed markers', () => {
  it("asks the request's mint to sign name + encoded props, and stamps data-page / data-sig", async () => {
    const Island = serverIsland(async () => Badge, { name: 'CartBadge' })
    const calls: [string, string][] = []
    const mint: ServerIslandMint = async (name, props) => {
      calls.push([name, props])
      return { page: '/shop', sig: '123.abc' }
    }
    const html = await runWithRequestContext(async () => {
      provideRequestLocals({ [SERVER_ISLAND_MINT]: mint })
      return renderToString(h(Island, { label: 'Cart' } as never))
    })
    expect(calls).toEqual([['CartBadge', JSON.stringify({ label: 'Cart' })]])
    expect(html).toContain('data-page="/shop"')
    expect(html).toContain('data-sig="123.abc"')
  })

  it('signs empty props as the empty string (no data-props attribute)', async () => {
    const Island = serverIsland(async () => Badge, { name: 'Bare' })
    const seen: string[] = []
    const mint: ServerIslandMint = async (_n, props) => (seen.push(props), null)
    const html = await runWithRequestContext(async () => {
      provideRequestLocals({ [SERVER_ISLAND_MINT]: mint })
      return renderToString(h(Island, {} as never))
    })
    expect(seen).toEqual([''])
    expect(html).not.toContain('data-sig')
  })

  it('without a mint (a custom handler) the marker is unsigned', async () => {
    const Island = serverIsland(async () => Badge, { name: 'Plain' })
    const html = await renderToString(h(Island, {} as never))
    expect(html).not.toContain('data-page')
    expect(html).not.toContain('data-sig')
  })
})

describe('renderServerIslandFragment', () => {
  it('renders the registered component with decoded props', async () => {
    serverIsland(async () => Badge, { name: 'Frag' })
    const raw = JSON.stringify({ label: 'Hello' })
    const result = await renderServerIslandFragment('Frag', raw)
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return
    expect(result.html).toBe('<span class="badge">Hello!</span>')
    expect(result.cacheControl).toBe('no-store') // per-request by default
  })

  it('bridges locals into the fragment render (useRequestLocals works)', async () => {
    const LocalsReader: ComponentFn = () => {
      const locals = useRequestLocals() as { user?: string }
      return h('b', null, locals.user ?? 'anon')
    }
    serverIsland(async () => LocalsReader, { name: 'Who' })
    const result = await renderServerIslandFragment('Who', null, { user: 'ada' })
    expect(result.kind).toBe('html')
    if (result.kind === 'html') expect(result.html).toBe('<b>ada</b>')
  })

  it('unknown island name → not-found (the endpoint allowlist)', async () => {
    const result = await renderServerIslandFragment('Nope', null)
    expect(result).toEqual({ kind: 'not-found' })
  })

  it('hostile/unparseable props → bad-props, never a throw', async () => {
    serverIsland(async () => Badge, { name: 'Bad' })
    const result = await renderServerIslandFragment('Bad', '{not json')
    expect(result).toEqual({ kind: 'bad-props' })
  })

  it('the cache option flows to the fragment Cache-Control', async () => {
    serverIsland(async () => Badge, { name: 'Cached', cache: 'public, max-age=60' })
    const result = await renderServerIslandFragment('Cached', null)
    expect(result.kind).toBe('html')
    if (result.kind === 'html') expect(result.cacheControl).toBe('public, max-age=60')
  })

  it('supports both default-export modules and bare component loaders', async () => {
    serverIsland(async () => ({ default: Badge }), { name: 'DefaultExport' })
    const result = await renderServerIslandFragment('DefaultExport', null)
    expect(result.kind).toBe('html')
    if (result.kind === 'html') expect(result.html).toContain('badge')
  })
})
