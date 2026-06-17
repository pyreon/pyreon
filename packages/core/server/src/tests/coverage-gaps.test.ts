// Targeted coverage for node-testable residual branches in @pyreon/server.
// The browser-only island hydration client (client.ts) + the client self-
// hydration branch of island()/serverIsland() are covered by
// islands.browser.test.tsx in real Chromium; node coverage can't reach them.

import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeIslandProps, encodeIslandProps, IslandPropEncodeError } from '../island-codec'
import {
  _resetServerIslands,
  activateServerIslandElement,
  serverIsland,
} from '../server-island'

describe('island-codec — encode edge cases', () => {
  it('a function VALUE inside a Map encodes to null', () => {
    const encoded = encodeIslandProps({ m: new Map<string, unknown>([['fn', () => {}]]) }, 'isle')
    // Map round-trips with a `__pyreon_t: 'm'` tag; the function value → null
    const decoded = decodeIslandProps(encoded) as { m: Map<string, unknown> }
    expect(decoded.m.get('fn')).toBeNull()
  })

  it('a class instance throws IslandPropEncodeError', () => {
    class Widget {
      x = 1
    }
    expect(() => encodeIslandProps({ w: new Widget() }, 'isle')).toThrow(IslandPropEncodeError)
  })

  it('a RegExp round-trips through encode/decode', () => {
    const encoded = encodeIslandProps({ re: /ab+c/gi }, 'isle')
    const decoded = decodeIslandProps(encoded) as { re: RegExp }
    expect(decoded.re).toBeInstanceOf(RegExp)
    expect(decoded.re.source).toBe('ab+c')
    expect(decoded.re.flags).toContain('g')
  })

  it('a Date + Set + BigInt round-trip', () => {
    const encoded = encodeIslandProps(
      { d: new Date(0), s: new Set([1, 2]), b: 10n },
      'isle',
    )
    const decoded = decodeIslandProps(encoded) as { d: Date; s: Set<number>; b: bigint }
    expect(decoded.d).toBeInstanceOf(Date)
    expect(decoded.s).toBeInstanceOf(Set)
    expect(decoded.b).toBe(10n)
  })
})

describe('server-island — SSR marker render + serialize fallback', () => {
  afterEach(() => _resetServerIslands())

  it('renders a marker with codec-encoded data-props (children dropped)', async () => {
    const Island = serverIsland(async () => ({ default: () => h('div', null, 'frag') }), {
      name: 'cart',
    })
    const html = await renderToString(h(Island, { count: 3 } as never, 'child-text'))
    expect(html).toContain('pyreon-server-island')
    expect(html).toContain('data-name="cart"')
    expect(html).toContain('data-props')
  })

  it('a marker with no serializable props omits data-props', async () => {
    const Island = serverIsland(async () => ({ default: () => h('div', null, 'f') }), {
      name: 'empty',
    })
    const html = await renderToString(h(Island, {}))
    expect(html).toContain('data-name="empty"')
    expect(html).not.toContain('data-props')
  })

  it('an unserializable prop falls back to empty props (serialize catch)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Island = serverIsland(async () => ({ default: () => h('div', null, 'f') }), {
      name: 'bad',
    })
    // a class instance → encodeIslandProps throws → caught → '{}' fallback
    class C {
      v = 1
    }
    const html = await renderToString(h(Island, { c: new C() } as never))
    expect(html).toContain('data-name="bad"')
    expect(html).not.toContain('data-props')
    err.mockRestore()
  })
})

describe('server-island — activateServerIslandElement (mock element + fetch)', () => {
  function mockEl(attrs: Record<string, string>): {
    el: HTMLElement
    innerHTML: () => string
    errored: () => boolean
  } {
    const store: Record<string, string> = { ...attrs }
    let inner = ''
    let errorFlag = false
    const el = {
      hasAttribute: (k: string) => k in store,
      setAttribute: (k: string, v: string) => {
        store[k] = v
        if (k === 'data-island-error') errorFlag = true
      },
      getAttribute: (k: string) => (k in store ? store[k] : null),
      get isConnected() {
        return true
      },
      set innerHTML(v: string) {
        inner = v
      },
      dispatchEvent: () => true,
    } as unknown as HTMLElement
    return { el, innerHTML: () => inner, errored: () => errorFlag }
  }

  it('fetches the fragment and swaps innerHTML on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('<p>fragment-html</p>', { status: 200 }))
    const m = mockEl({ 'data-name': 'cart', 'data-props': '{"x":1}' })
    activateServerIslandElement(m.el)
    await new Promise((r) => setTimeout(r, 5))
    expect(fetchSpy).toHaveBeenCalled()
    expect(m.innerHTML()).toContain('fragment-html')
    fetchSpy.mockRestore()
  })

  it('flags the element on a failed fetch (HTTP error)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 500 }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mockEl({ 'data-name': 'cart' })
    activateServerIslandElement(m.el)
    await new Promise((r) => setTimeout(r, 5))
    expect(m.errored()).toBe(true)
    fetchSpy.mockRestore()
    err.mockRestore()
  })

  it('is idempotent — a second activation is a no-op', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'))
    const m = mockEl({ 'data-pyreon-si': '1', 'data-name': 'cart' })
    activateServerIslandElement(m.el) // already stamped → returns immediately
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('returns early when the marker has no name', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'))
    const m = mockEl({})
    activateServerIslandElement(m.el)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
