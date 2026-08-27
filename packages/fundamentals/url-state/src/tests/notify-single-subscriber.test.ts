import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setUrlRouter } from '../index'
import { subscribeKey, writeSingleParam } from '../sync'

function setSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  history.replaceState(null, '', url.toString())
}

/**
 * Locks the single-subscriber fast path in `notifyKey`. `notifyKey` fires per
 * URL change, and the dominant shape is one `useUrlState` per key, where the
 * `[...set]` snapshot is a throwaway array. The fast path captures the sole
 * subscriber and fires it — but MUST still honour the `except` filter (the
 * writer is not re-notified, or a `.set()` self-loops). These specs pin that.
 */
describe('notifyKey — single-subscriber fast path', () => {
  beforeEach(() => {
    setSearch('')
    setUrlRouter(null)
  })
  afterEach(() => {
    setSearch('')
    setUrlRouter(null)
  })

  it('fires the sole subscriber when the write comes from elsewhere (except ≠ it)', () => {
    let fired = 0
    const self = () => {}
    const unsub = subscribeKey('k', () => fired++)
    writeSingleParam('k', 'v', true, self) // except = a different writer
    expect(fired).toBe(1)
    unsub()
  })

  it('does NOT re-notify the sole subscriber when it is the writer (except = it)', () => {
    let fired = 0
    const self = () => fired++
    const unsub = subscribeKey('k', self)
    writeSingleParam('k', 'v', true, self) // except = the sole subscriber → skip
    expect(fired).toBe(0)
    unsub()
  })

  it('external notify with no writer (undefined except) fires the sole subscriber', () => {
    let fired = 0
    const unsub = subscribeKey('k', () => fired++)
    writeSingleParam('k', 'v', true, undefined) // popstate-like: no writer
    expect(fired).toBe(1)
    unsub()
  })
})
