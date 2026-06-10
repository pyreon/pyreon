// @vitest-environment node
/**
 * Server islands (Phase 4) — marker component, registry, and the
 * server-only fragment renderer. Real `h()` + real `renderToString`
 * throughout (test-environment-parity: no mock vnodes).
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRequestLocals } from '../middleware'
import {
  _resetServerIslands,
  getRegisteredServerIslands,
  serverIsland,
} from '../server-island'
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
