/**
 * `readBakedRpc` — the single seam that makes every node-answered panel work on
 * a static site without any panel knowing a static site exists.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { callRpc, readBakedRpc } from '../lens-client'

interface Host {
  __ATLAS_STATIC_RPC__?: Record<string, Record<string, unknown>>
}

afterEach(() => {
  delete (globalThis as Host).__ATLAS_STATIC_RPC__
})

const install = (payload: Record<string, Record<string, unknown>>): void => {
  ;(globalThis as Host).__ATLAS_STATIC_RPC__ = payload
}

describe('readBakedRpc', () => {
  it('returns undefined when nothing is baked, so dev falls through to fetch', () => {
    expect(readBakedRpc('source', { component: 'A' })).toBeUndefined()
  })

  it('returns undefined for a component the payload does not carry', () => {
    install({ source: { A: { source: 'x' } } })
    expect(readBakedRpc('source', { component: 'B' })).toBeUndefined()
  })

  it('returns a baked answer', () => {
    install({ source: { A: { source: 'x' } } })
    expect(readBakedRpc('source', { component: 'A' })).toEqual({ ok: true, result: { source: 'x' } })
  })

  it('returns a baked FAILURE as its real reason', () => {
    install({ lens: { A: { __atlasRpcError: 'no compiler installed' } } })
    expect(readBakedRpc('lens', { component: 'A' })).toEqual({
      ok: false,
      error: 'no compiler installed',
    })
  })

  it('treats a null answer as an ANSWER, not as absence', () => {
    // `key in baked` rather than a truthiness check. A method whose legitimate
    // result is `null` would otherwise fall through to a fetch that cannot
    // succeed on a static site, and surface as a network error.
    install({ source: { A: null } })
    expect(readBakedRpc('source', { component: 'A' })).toEqual({ ok: true, result: null })
  })

  it('finds a no-parameter method under the empty-string key', () => {
    install({ components: { '': ['A', 'B'] } })
    expect(readBakedRpc('components', {})).toEqual({ ok: true, result: ['A', 'B'] })
  })
})

describe('callRpc', () => {
  it('never touches the network when an answer is baked', async () => {
    install({ source: { A: { source: 'x' } } })
    let called = false
    const fetchImpl = (() => {
      called = true
      throw new Error('should not be reached')
    }) as unknown as typeof fetch

    await expect(callRpc('source', { component: 'A' }, fetchImpl)).resolves.toEqual({
      ok: true,
      result: { source: 'x' },
    })
    expect(called).toBe(false)
  })

  it('falls through to the channel when nothing is baked', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: true, result: 'from-server' }) }) as unknown as Response) as unknown as typeof fetch

    await expect(callRpc('source', { component: 'A' }, fetchImpl)).resolves.toEqual({
      ok: true,
      result: 'from-server',
    })
  })

  it('reports a dead channel as a result, not a rejection', async () => {
    // Every caller is a render path; an unhandled rejection would blank a panel
    // while telling the user nothing.
    const fetchImpl = (async () => {
      throw new Error('Failed to fetch')
    }) as unknown as typeof fetch

    await expect(callRpc('lens', { component: 'A' }, fetchImpl)).resolves.toEqual({
      ok: false,
      error: 'Failed to fetch',
    })
  })
})
