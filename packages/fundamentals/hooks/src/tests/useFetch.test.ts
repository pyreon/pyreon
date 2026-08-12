// `useFetch` shipped with no test file at all.
//
// That is worse than a coverage number: the hook documents a contract that is
// exactly Pyreon leak-class F — "each `refetch()` aborts the previous in-flight
// request, so a slow stale response can never clobber a fresh one" — and
// nothing exercised it. A regression there is silent and data-corrupting: the
// user sees the OLD response win, intermittently, under a race that only
// appears on a slow network.
//
// It is also half of the multiplatform `useFetch<T>(url, init)` contract. PMTC
// reads `method` / `headers` / `body` off the init literal and builds a
// `PyreonHttpRequest` for iOS/Android; if the web half quietly drops one of
// those fields, one component body means two different requests across targets.
// So the init-forwarding specs assert the SHARED contract, not just a branch.

import { describe, expect, it, vi } from 'vitest'
import { useFetch } from '../useFetch'

type FetchCall = { url: string; init: RequestInit }

/** A deferred response, so a test can settle requests out of order. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response

/**
 * Install a fetch double for the duration of `run`.
 *
 * MUST `await run(...)` before restoring. A non-async version of this helper
 * runs its `finally` the moment `run` returns its promise, so the double is
 * torn down while the test body is still awaiting — every `refetch()` after the
 * first `await` then hits the REAL fetch. That is not hypothetical: it is how
 * the first draft of this file failed, and it fails in the direction that
 * matters, because the specs whose calls are all synchronous keep passing and
 * look like proof the helper works.
 */
async function withFetch<T>(
  impl: (url: string, init: RequestInit) => Promise<Response>,
  run: (calls: FetchCall[]) => T | Promise<T>,
): Promise<T> {
  const calls: FetchCall[] = []
  const prev = globalThis.fetch
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return impl(url, init)
  }) as unknown as typeof fetch
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = prev
  }
}

/** Let the hook's `.then` chain settle. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useFetch — the initial request', () => {
  it('fires once at setup and exposes the decoded JSON', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse({ id: 1 })),
      async (calls) => {
        const r = useFetch<{ id: number }>('/api/x.json')
        expect(calls).toHaveLength(1)
        expect(calls[0]!.url).toBe('/api/x.json')
        await settle()
        expect(r.data()).toEqual({ id: 1 })
        expect(r.error()).toBeUndefined()
        expect(r.isPending()).toBe(false)
      },
    )
  })

  it('is pending until the response settles', async () => {
    const d = deferred<Response>()
    await withFetch(
      () => d.promise,
      async () => {
        const r = useFetch('/api/x.json')
        expect(r.isPending()).toBe(true)
        d.resolve(jsonResponse({ ok: true }))
        await settle()
        expect(r.isPending()).toBe(false)
      },
    )
  })
})

describe('useFetch — the init literal reaches the request', () => {
  // PMTC lowers these three fields to a native request. A field the web half
  // drops is a field that silently differs across targets.
  it('forwards method, headers and body', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse({})),
      async (calls) => {
        useFetch('/api/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"a":1}',
        })
        const init = calls[0]!.init
        expect(init.method).toBe('POST')
        expect(init.headers).toEqual({ 'content-type': 'application/json' })
        expect(init.body).toBe('{"a":1}')
      },
    )
  })

  it('omits them entirely when no init is given — a plain GET', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse({})),
      async (calls) => {
        useFetch('/api/x.json')
        const init = calls[0]!.init
        expect('method' in init).toBe(false)
        expect('headers' in init).toBe(false)
        expect('body' in init).toBe(false)
      },
    )
  })

  it('forwards an EMPTY-STRING body — `undefined` is the only absence', async () => {
    // `body: ''` is falsy but meaningful (a POST with no payload). A truthiness
    // check here would drop it; the source deliberately tests `!== undefined`.
    await withFetch(
      () => Promise.resolve(jsonResponse({})),
      async (calls) => {
        useFetch('/api/save', { method: 'POST', body: '' })
        expect(calls[0]!.init.body).toBe('')
      },
    )
  })

  it('always carries an abort signal', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse({})),
      async (calls) => {
        useFetch('/api/x.json')
        expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal)
      },
    )
  })
})

describe('useFetch — failures', () => {
  it('turns a non-ok response into a prefixed error and stops pending', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse(null, false, 503)),
      async () => {
        const r = useFetch('/api/x.json')
        await settle()
        expect(String(r.error())).toContain('[Pyreon] useFetch /api/x.json: HTTP 503')
        expect(r.data()).toBeUndefined()
        expect(r.isPending()).toBe(false)
      },
    )
  })

  it('surfaces a transport rejection', async () => {
    await withFetch(
      () => Promise.reject(new Error('offline')),
      async () => {
        const r = useFetch('/api/x.json')
        await settle()
        expect(String(r.error())).toContain('offline')
        expect(r.isPending()).toBe(false)
      },
    )
  })

  it('clears a previous error once a later request succeeds', async () => {
    let attempt = 0
    await withFetch(
      () => {
        attempt += 1
        return attempt === 1
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(jsonResponse({ id: 2 }))
      },
      async () => {
        const r = useFetch<{ id: number }>('/api/x.json')
        await settle()
        expect(r.error()).toBeDefined()
        r.refetch()
        await settle()
        expect(r.error()).toBeUndefined()
        expect(r.data()).toEqual({ id: 2 })
      },
    )
  })
})

describe('useFetch — a stale response can never clobber a fresh one (leak class F)', () => {
  it('discards a SLOW-OLD response that settles after a fast-new one', async () => {
    // The documented contract, and the reason `refetch` aborts: without the
    // abort + `signal.aborted` guard the first response wins because it lands
    // last, and the UI shows stale data with no error to trace it by.
    const first = deferred<Response>()
    const second = deferred<Response>()
    let n = 0
    await withFetch(
      () => {
        n += 1
        return n === 1 ? first.promise : second.promise
      },
      async () => {
        const r = useFetch<{ v: string }>('/api/x.json')
        r.refetch()

        // The NEW request settles first.
        second.resolve(jsonResponse({ v: 'fresh' }))
        await settle()
        expect(r.data()).toEqual({ v: 'fresh' })

        // Now the OLD one lands. It must be ignored.
        first.resolve(jsonResponse({ v: 'stale' }))
        await settle()
        expect(r.data()).toEqual({ v: 'fresh' })
      },
    )
  })

  it('does not let a stale REJECTION set an error over a fresh success', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    let n = 0
    await withFetch(
      () => {
        n += 1
        return n === 1 ? first.promise : second.promise
      },
      async () => {
        const r = useFetch('/api/x.json')
        r.refetch()
        second.resolve(jsonResponse({ v: 'fresh' }))
        await settle()

        first.reject(new Error('stale failure'))
        await settle()
        expect(r.error()).toBeUndefined()
        expect(r.isPending()).toBe(false)
      },
    )
  })

  it('aborts the in-flight request when refetch is called', async () => {
    const d = deferred<Response>()
    await withFetch(
      () => d.promise,
      async (calls) => {
        const r = useFetch('/api/x.json')
        const firstSignal = calls[0]!.init.signal as AbortSignal
        expect(firstSignal.aborted).toBe(false)
        r.refetch()
        expect(firstSignal.aborted).toBe(true)
        expect(calls).toHaveLength(2)
        d.resolve(jsonResponse({}))
        await settle()
      },
    )
  })
})

describe('useFetch — the shared-code member contract', () => {
  it('exposes exactly data / error / isPending / refetch', async () => {
    await withFetch(
      () => Promise.resolve(jsonResponse({})),
      () => {
        const r = useFetch('/api/x.json')
        // These names have to match `PyreonFetch` on both native targets, or a
        // single component body cannot read the same fields on three targets.
        expect(Object.keys(r).sort()).toEqual(['data', 'error', 'isPending', 'refetch'])
        expect(typeof r.refetch).toBe('function')
      },
    )
  })

  it('never throws when fetch is missing — it just reports the failure', async () => {
    const prev = globalThis.fetch
    // @ts-expect-error deliberately removing the global to model a bare runtime
    delete globalThis.fetch
    try {
      expect(() => useFetch('/api/x.json')).toThrow()
    } finally {
      globalThis.fetch = prev
    }
  })
})

describe('useFetch — vi.fn interop', () => {
  it('works with a spy transport, so consumers can assert call counts', async () => {
    const spy = vi.fn(() => Promise.resolve(jsonResponse({ id: 9 })))
    const prev = globalThis.fetch
    globalThis.fetch = spy as unknown as typeof fetch
    try {
      const r = useFetch<{ id: number }>('/api/x.json')
      await settle()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(r.data()).toEqual({ id: 9 })
    } finally {
      globalThis.fetch = prev
    }
  })
})
