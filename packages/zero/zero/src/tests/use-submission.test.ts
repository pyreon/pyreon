// @vitest-environment happy-dom
/**
 * Client-side `useSubmission` internals: stale-response discard (Class F)
 * and loader-key targeted revalidation.
 */
import type { Router } from '@pyreon/router'
import { setActiveRouter } from '@pyreon/router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _actionStub, _resetActions, useSubmission } from '../actions'

function deferredFetch() {
  const pending: Array<(body: unknown) => void> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push((body) => resolve(Response.json(body)))
        }),
    ),
  )
  return pending
}

function fakeRouter() {
  const r = { revalidate: vi.fn(async () => {}), invalidateLoader: vi.fn(), push: vi.fn(async () => {}) }
  setActiveRouter(r as unknown as Router)
  return r
}

afterEach(() => {
  vi.unstubAllGlobals()
  _resetActions()
  setActiveRouter(null as unknown as Router)
})

describe('useSubmission', () => {
  it('a slower OLDER response never overwrites a newer one', async () => {
    fakeRouter()
    const resolvers = deferredFetch()
    const sub = useSubmission(_actionStub<{ n: number }>('action_order'))
    const first = sub.submit({ n: '1' }, { url: 'http://localhost/x?_action=action_order' })
    const second = sub.submit({ n: '2' }, { url: 'http://localhost/x?_action=action_order' })
    expect(sub.pending()).toBe(true)
    expect(sub.input()?.get('n')).toBe('2')
    // Newer settles first, then the older one arrives late.
    resolvers[1]!({ kind: 'data', status: 200, data: { n: 2 } })
    await second
    resolvers[0]!({ kind: 'data', status: 200, data: { n: 1 } })
    await first
    expect(sub.result()).toEqual({ n: 2 })
    expect(sub.pending()).toBe(false)
  })

  it('revalidate: [keys] invalidates only those loader keys, without re-running the page', async () => {
    const router = fakeRouter()
    const resolvers = deferredFetch()
    const sub = useSubmission(_actionStub('action_keys'))
    const done = sub.submit({}, { url: 'http://localhost/x', revalidate: ['posts'] })
    resolvers[0]!({ kind: 'data', status: 200, data: null })
    await done
    expect(router.revalidate).not.toHaveBeenCalled()
    expect(router.invalidateLoader).toHaveBeenCalledTimes(1)
    const predicate = router.invalidateLoader.mock.calls[0]![0] as (k: string) => boolean
    expect(predicate('posts')).toBe(true)
    expect(predicate('stats')).toBe(false)
  })

  it('defaults to router.revalidate(); revalidate: false and a failure refresh nothing', async () => {
    const router = fakeRouter()
    const resolvers = deferredFetch()
    const sub = useSubmission(_actionStub('action_default'))
    let p = sub.submit({}, { url: 'http://localhost/x' })
    resolvers[0]!({ kind: 'data', status: 200, data: 1 })
    await p
    expect(router.revalidate).toHaveBeenCalledTimes(1)
    p = sub.submit({}, { url: 'http://localhost/x', revalidate: false })
    resolvers[1]!({ kind: 'data', status: 200, data: 1 })
    await p
    p = sub.submit({}, { url: 'http://localhost/x' })
    resolvers[2]!({ kind: 'data', status: 422, data: { error: 'x' } })
    await p
    expect(router.revalidate).toHaveBeenCalledTimes(1)
    expect(sub.status()).toBe(422)
  })
})
