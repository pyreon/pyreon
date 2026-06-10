import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFetch } from '../useFetch'

// Stub the PLATFORM fetch boundary (not the framework) — the hook's
// signal flow, abort semantics, and error paths run for real.

const realFetch = globalThis.fetch

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function flush(): Promise<void> {
  // Two microtask hops: res.json() then the .then chain.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('useFetch', () => {
  it('fires on setup: isPending true, then data lands and isPending false', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse([{ id: 1, text: 'hi' }]))
    const quotes = useFetch<{ id: number; text: string }[]>('/api/quotes.json')
    expect(quotes.isPending()).toBe(true)
    expect(quotes.data()).toBeUndefined()
    await flush()
    expect(quotes.isPending()).toBe(false)
    expect(quotes.data()).toEqual([{ id: 1, text: 'hi' }])
    expect(quotes.error()).toBeUndefined()
  })

  it('non-2xx lands in error with the URL + status named; data stays undefined', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ nope: true }, { status: 404 }))
    const r = useFetch<unknown>('/missing.json')
    await flush()
    expect(r.isPending()).toBe(false)
    expect(r.data()).toBeUndefined()
    expect(String(r.error())).toContain('/missing.json')
    expect(String(r.error())).toContain('404')
  })

  it('network failure lands the rejection in error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const r = useFetch<unknown>('/api/x')
    await flush()
    expect(r.isPending()).toBe(false)
    expect(String(r.error())).toContain('Failed to fetch')
  })

  it('refetch re-runs and replaces data; error clears on success', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call += 1
      if (call === 1) return jsonResponse({ v: 'first' })
      return jsonResponse({ v: 'second' })
    })
    const r = useFetch<{ v: string }>('/api/v')
    await flush()
    expect(r.data()).toEqual({ v: 'first' })
    r.refetch()
    expect(r.isPending()).toBe(true)
    await flush()
    expect(r.data()).toEqual({ v: 'second' })
    expect(r.error()).toBeUndefined()
  })

  it('a stale slow response NEVER clobbers a fresh one (leak-class F guard)', async () => {
    // First request resolves SLOWLY; refetch fires a fast second request.
    // The first's AbortController is aborted by refetch, so even when its
    // promise settles later, the aborted-guard discards it.
    let resolveSlow!: (r: Response) => void
    const slow = new Promise<Response>((res) => {
      resolveSlow = res
    })
    let call = 0
    globalThis.fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        const r = await slow
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        return r
      }
      return jsonResponse({ v: 'fresh' })
    })
    const r = useFetch<{ v: string }>('/api/race')
    r.refetch()
    await flush()
    expect(r.data()).toEqual({ v: 'fresh' })
    resolveSlow(jsonResponse({ v: 'stale' }))
    await flush()
    expect(r.data()).toEqual({ v: 'fresh' })
    expect(r.error()).toBeUndefined()
  })

  it('a stale response that RESOLVES after abort is discarded (then-side guard)', async () => {
    // Real fetch usually rejects on abort, but a response whose body
    // decode was already in flight can still resolve — the then-side
    // aborted check is the defense. Stub ignores the abort signal.
    let resolveSlow!: (r: Response) => void
    const slow = new Promise<Response>((res) => {
      resolveSlow = res
    })
    let call = 0
    globalThis.fetch = vi.fn(async () => {
      call += 1
      if (call === 1) return slow
      return jsonResponse({ v: 'fresh' })
    })
    const r = useFetch<{ v: string }>('/api/race2')
    r.refetch()
    await flush()
    expect(r.data()).toEqual({ v: 'fresh' })
    resolveSlow(jsonResponse({ v: 'stale' }))
    await flush()
    expect(r.data()).toEqual({ v: 'fresh' })
  })

  it('passes an AbortSignal through to fetch', async () => {
    const spy = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => jsonResponse({}))
    globalThis.fetch = spy
    useFetch<unknown>('/api/sig')
    await flush()
    const init = spy.mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})
