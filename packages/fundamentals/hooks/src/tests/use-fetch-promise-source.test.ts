import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { useFetch } from '../useFetch'

/**
 * `useFetch` accepts the shape the multiplatform docs tell people to write.
 *
 * `@pyreon/native-compiler` documents `useFetch<T>(getUser({ params: { id } }))`
 * as the crossing surface for `@pyreon/http` — it lowers to a native fetch of
 * the templated URL. But an `@pyreon/http` endpoint CALL fires the request and
 * returns a promise, and this hook took `url: string`. So on the web the
 * documented shape did `fetch(String(promise))` — a request for the literal
 * `[object Promise]` — and the endpoint's own rejection went unhandled, showing
 * up as an uncaught page error.
 *
 * Found by rendering a shared multi-target source in a browser: the value
 * rendered empty and the console carried an unhandled `[Pyreon] GET … failed`.
 */
describe('useFetch with a promise source', () => {
  it('resolves data from the promise without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = useFetch<{ id: string }>(Promise.resolve({ id: 'ada' }))

    expect(result.isPending()).toBe(true)
    await vi.waitFor(() => expect(result.data()).toEqual({ id: 'ada' }))
    expect(result.isPending()).toBe(false)
    expect(result.error()).toBeUndefined()
    // The load-bearing negative: the old path would have issued a request for
    // the stringified promise.
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('routes a rejection into error() instead of leaving it unhandled', async () => {
    const boom = new Error('[Pyreon] GET /tasks/1 failed')
    const result = useFetch<{ id: string }>(Promise.reject(boom))

    await vi.waitFor(() => expect(result.error()).toBe(boom))
    expect(result.isPending()).toBe(false)
    expect(result.data()).toBeUndefined()
  })

  it('settles data and isPending in ONE flush, like the URL path', async () => {
    // A consumer reading both in one effect must never see "data arrived but
    // still pending" — the same batching contract the string path documents.
    const result = useFetch<number>(Promise.resolve(7))
    const seen: Array<[number | undefined, boolean]> = []
    effect(() => {
      seen.push([result.data(), result.isPending()])
    })
    await vi.waitFor(() => expect(result.data()).toBe(7))
    expect(seen).not.toContainEqual([7, true])
  })

  it('warns rather than silently no-op when refetch() is called on a promise source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = useFetch<number>(Promise.resolve(1))
    result.refetch()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('refetch() does nothing'))
    warn.mockRestore()
  })
})
