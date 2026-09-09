import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchUrlUpdates } from '../sync'
import { setUrlRouter, type UrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

// Two properties a URL-bound signal has to hold: `replace: false` means a
// history ENTRY on every write path, and a URL is untrusted input.

function recordingRouter(withPush: boolean): { calls: string[]; router: UrlRouter } {
  const calls: string[] = []
  const router: UrlRouter = { replace: (p) => void calls.push(`replace:${p}`) }
  if (withPush) router.push = (p) => void calls.push(`push:${p}`)
  return { calls, router }
}

beforeEach(() => {
  history.replaceState(null, '', '/')
  setUrlRouter(null)
})
afterEach(() => {
  setUrlRouter(null)
  vi.restoreAllMocks()
})

describe('`replace: false` means a history entry, router or not', () => {
  it('routes a push-intent update through the router push', () => {
    // The router branch called `replace()` for BOTH intents, so `replace: false`
    // was a silent no-op — and only in router-wired apps, since the raw-history
    // branch had honoured the flag from the start. Back stopped undoing filter
    // changes with no error anywhere.
    const { calls, router } = recordingRouter(true)
    setUrlRouter(router)
    useUrlState('page', 1, { replace: false }).set(3)
    expect(calls, 'a push-intent update went through replace').toEqual(['push:/?page=3'])
  })

  it('still replaces when the caller asked to replace', () => {
    const { calls, router } = recordingRouter(true)
    setUrlRouter(router)
    useUrlState('page', 1).set(3) // replace defaults to true
    expect(calls).toEqual(['replace:/?page=3'])
  })

  it('a batched push-intent update produces ONE push, not one per key', () => {
    const { calls, router } = recordingRouter(true)
    setUrlRouter(router)
    const page = useUrlState('page', 1, { replace: false })
    const q = useUrlState('q', '', { replace: false })
    batchUrlUpdates(() => {
      page.set(2)
      q.set('hi')
    })
    expect(calls.length, 'the batch fanned out into several history entries').toBe(1)
    expect(calls[0]).toContain('push:')
  })

  it('a router without push falls back to replace and SAYS so, once', () => {
    // A silent downgrade is the bug being fixed, so the fallback must not be
    // silent either.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { calls, router } = recordingRouter(false)
    setUrlRouter(router)
    const page = useUrlState('page', 1, { replace: false })
    page.set(2)
    page.set(3)
    expect(calls).toEqual(['replace:/?page=2', 'replace:/?page=3'])
    expect(warn, 'the fallback warned per write instead of once').toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('no `push` method')
  })

  it('a NEW router gets its own verdict', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setUrlRouter(recordingRouter(false).router)
    useUrlState('a', 1, { replace: false }).set(2)
    setUrlRouter(recordingRouter(false).router)
    useUrlState('b', 1, { replace: false }).set(2)
    expect(warn, 'the once-flag leaked across routers').toHaveBeenCalledTimes(2)
  })
})

describe('a URL is untrusted input', () => {
  it('a malformed object param falls back to the default instead of throwing', () => {
    // The inferred object serializer is `JSON.parse`, and `readFromUrl` runs at
    // component SETUP — so `?f={oops` (hand-edited, truncated by a chat client,
    // shared from an older build) took the whole page down.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    history.replaceState(null, '', '/?f=%7Boops')
    let value: unknown
    expect(() => {
      value = useUrlState('f', { a: 1 })()
    }).not.toThrow()
    expect(value).toEqual({ a: 1 })
    expect(String(warn.mock.calls[0]?.[0]), 'the fallback did not name the param').toContain('?f=')
  })

  it('a throwing CUSTOM deserializer is contained the same way', () => {
    // The guard sits at the untrusted-input boundary rather than inside one
    // inferred serializer, so a user-supplied `deserialize` is covered too.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    history.replaceState(null, '', '/?x=anything')
    const x = useUrlState('x', 'fallback', {
      serialize: (v) => v,
      deserialize: () => {
        throw new Error('boom')
      },
    })
    expect(x()).toBe('fallback')
  })

  it('a WELL-FORMED object param still deserializes', () => {
    history.replaceState(null, '', `/?f=${encodeURIComponent('{"a":9}')}`)
    expect(useUrlState('f', { a: 1 })()).toEqual({ a: 9 })
  })
})
