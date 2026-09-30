/**
 * Typed error responses: an `HttpError` carries its decoded body, and an
 * endpoint that declares `errors` validates it and types it.
 *
 * The runtime half (body decoded from a CLONE, most-specific schema wins, a
 * mismatch never replaces the HTTP failure) and the type half (`matched` then
 * `status` narrows `body`) are asserted together, because either one alone
 * can be right while the pair lies: a declared type over an unvalidated body
 * is a cast.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { createHttp } from '../client'
import type { EndpointError } from '../endpoint'
import { ClientError, HttpError, ServerError } from '../errors'
import { createMock } from '../mock'
import { errorSchemaFor } from '../response'
import { standardSchema } from '../schema'
import type { Transport, ValidateMode } from '../types'

const NotFound = z.object({ message: z.string() })
const Problem = z.object({ code: z.number() })
const Conflict = z.object({ field: z.string() })

const routes = [
  { path: '/users/404', status: 404, json: { message: 'no such user' } },
  { path: '/users/409', status: 409, json: { field: 'email' } },
  { path: '/users/500', status: 500, json: { code: 7 } },
  { path: '/users/wrong', status: 404, json: { nope: true } },
  { path: '/users/html', status: 502, body: '<h1>bad gateway</h1>', headers: { 'content-type': 'text/html' } },
  { path: '/users/empty', status: 404 },
]

function api(validate: ValidateMode = 'strict') {
  return createHttp({ baseUrl: '/api', use: [createMock(routes).middleware], schema: standardSchema, validate })
}

async function rejection(p: Promise<unknown>): Promise<HttpError> {
  try {
    await p
  } catch (e) {
    if (e instanceof HttpError) return e
    throw e
  }
  throw new Error('expected a rejection')
}

describe('HttpError carries the decoded body', () => {
  it('parses a JSON error body, without consuming the response', async () => {
    const err = await rejection(api().get('users/404'))
    expect(err).toBeInstanceOf(ClientError)
    expect(err.body).toEqual({ message: 'no such user' })
    expect(err.matched).toBeUndefined()
    // Read from a clone: the caller can still read the raw response.
    expect(await err.response.raw.json()).toEqual({ message: 'no such user' })
  })

  it('keeps a non-JSON body as its text, and an empty one as undefined', async () => {
    const html = await rejection(api().get('users/html'))
    expect(html).toBeInstanceOf(ServerError)
    expect(html.body).toBe('<h1>bad gateway</h1>')
    expect((await rejection(api().get('users/empty'))).body).toBeUndefined()
  })
})

describe('an endpoint that declares `errors`', () => {
  const declare = (validate: ValidateMode = 'strict') =>
    api(validate).endpoint('GET /users/:id', {
      response: z.object({ id: z.string() }),
      errors: { 404: NotFound, '4XX': Conflict, default: Problem },
    })

  it('validates the body against the EXACT status first', async () => {
    const err = await rejection(declare()({ params: { id: '404' } }))
    expect(err.matched).toBe('404')
    expect(err.body).toEqual({ message: 'no such user' })
  })

  it('falls back to the RANGE, then to `default`', async () => {
    const conflict = await rejection(declare()({ params: { id: '409' } }))
    expect([conflict.matched, conflict.body]).toEqual(['4XX', { field: 'email' }])
    const server = await rejection(declare()({ params: { id: '500' } }))
    expect([server.matched, server.body]).toEqual(['default', { code: 7 }])
  })

  it('a body that fails its schema stays an HttpError, unmatched, with the raw body', async () => {
    const err = await rejection(declare()({ params: { id: 'wrong' } }))
    expect(err).toBeInstanceOf(ClientError)
    expect([err.status, err.matched, err.body]).toEqual([404, undefined, { nope: true }])
  })

  it("'warn' logs the mismatch; 'off' trusts the declaration", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const warned = await rejection(declare('warn')({ params: { id: 'wrong' } }))
    expect(warned.matched).toBeUndefined()
    expect(String(warn.mock.calls[0]?.[0])).toContain('did not match its declared `404` error schema')
    warn.mockRestore()
    const trusted = await rejection(declare('off')({ params: { id: 'wrong' } }))
    expect([trusted.matched, trusted.body]).toEqual(['404', { nope: true }])
  })

  it('exposes the declared schemas on the endpoint', () => {
    expect(Object.keys(declare().errors)).toEqual(['404', '4XX', 'default'])
  })

  it('errorSchemaFor: no exact, range, or default entry is undefined', () => {
    // Every scenario elsewhere in this file always has a `default`, so the
    // status always resolves to SOMETHING. An `errors` map with neither a
    // match nor a fallback is the genuinely unmatched case.
    expect(errorSchemaFor({ 404: NotFound }, 500)).toBeUndefined()
  })

  it('types the rejection: `matched` narrows `body` exactly; `status` narrows it loosely', () => {
    const getUser = declare()
    type E = EndpointError<typeof getUser>
    const narrow = (e: E): string | number | undefined => {
      if (e.matched === '404') {
        expectTypeOf(e.body).toEqualTypeOf<{ message: string }>()
        expectTypeOf(e.status).toEqualTypeOf<404>()
        return e.body.message
      }
      if (e.matched === 'default') {
        expectTypeOf(e.body).toEqualTypeOf<{ code: number }>()
        return e.body.code
      }
      // With the exact and `default` members ruled out, a matched 404 can only
      // be the `4XX` range's -- `status` alone would still admit all three.
      if (e.matched && e.status === 404) expectTypeOf(e.body).toEqualTypeOf<{ field: string }>()
      if (e.matched === undefined) expectTypeOf(e.body).toEqualTypeOf<unknown>()
      return e.message
    }
    expect(narrow).toBeTypeOf('function')
    // With nothing declared, every HTTP failure is unmatched.
    const plain = api().endpoint('GET /users/:id')
    expectTypeOf<Extract<EndpointError<typeof plain>, { matched: string }>>().toBeNever()
  })
})

// ─── merge with #3647: the error-body read honours abort, timeout, redaction ──

describe('reading an error body is covered by the request signal', () => {
  /** A body that never finishes and is NOT wired to the request signal —
   * the mock / custom-transport shape, where only the client's race can stop it. */
  const hangingError: import('../types').Transport = async (request) => {
    const { toHttpResponse } = await import('../transport')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'))
      },
    })
    return toHttpResponse(new Response(body, { status: 500 }), request)
  }

  it('the timeout covers a hung error body and surfaces as TimeoutError', async () => {
    const { TimeoutError } = await import('../errors')
    const api = createHttp({ transport: hangingError, timeout: 30 })
    await expect(api.get('/x')).rejects.toBeInstanceOf(TimeoutError)
  })

  it("the caller's abort covers a hung error body and surfaces as AbortError", async () => {
    const { AbortError } = await import('../errors')
    const api = createHttp({ transport: hangingError, timeout: false })
    const controller = new AbortController()
    const pending = api.get('/x', { signal: controller.signal })
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(AbortError)
  })

  it('reads a normal (non-hanging) error body with NO signal at all (timeout disabled)', async () => {
    // `timeout: false` and no per-request `signal` leaves `link.signal`
    // `undefined` — the no-signal shape `readCloneUnderSignal` falls back
    // to a bare `clone.text()` for.
    const api = createHttp({
      use: [createMock([{ path: '/x', status: 500, json: { reason: 'boom' } }]).middleware],
      timeout: false,
    })
    const err = await rejection(api.get('/x'))
    expect(err.body).toEqual({ reason: 'boom' })
  })

  it('a body that fails to READ (not abort, not timeout) is unreadable, not thrown', async () => {
    // Distinct from the hanging-body specs above: this body errors
    // OUTRIGHT (a genuine stream failure), with no abort/timeout involved
    // at all — `readErrorBody`'s "not an abort" fallback.
    const erroring: import('../types').Transport = async (request) => {
      const { toHttpResponse } = await import('../transport')
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('stream boom'))
        },
      })
      return toHttpResponse(new Response(body, { status: 500 }), request)
    }
    const api = createHttp({ transport: erroring, timeout: 5000 })
    const err = await rejection(api.get('/x'))
    expect(err.body).toBeUndefined()
  })

  it('a bodyless status (304) thrown as an HttpError carries no body', async () => {
    // 304 is outside the 2xx range, so `response.ok` is false and it goes
    // through the SAME error-body path as a real failure — but the body
    // is defined to be absent, short-circuiting before any read.
    const api = createHttp({ use: [createMock([{ path: '/x', status: 304 }]).middleware] })
    const err = await rejection(api.get('/x'))
    expect(err.body).toBeUndefined()
  })

  it('void() drains a SUCCESS body without throwing even when the read fails', async () => {
    const erroring: Transport = async (request) => {
      const { toHttpResponse } = await import('../transport')
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('drain boom'))
        },
      })
      return toHttpResponse(new Response(body, { status: 200 }), request)
    }
    const api = createHttp({ transport: erroring })
    await expect(api.get('/x').void()).resolves.toBeUndefined()
  })

  it("'warn' on a mismatched error body never logs the query string", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // A string mock path matches the END of path+query, so name the query.
    const ep = createHttp({
      baseUrl: '/api',
      use: [createMock([{ path: '/users/wrong?token=s3cret', status: 404, json: { nope: true } }]).middleware],
      schema: standardSchema,
      validate: 'warn',
    }).endpoint('GET /users/:id', { errors: { 404: NotFound } })
    await ep({ params: { id: 'wrong' }, query: { token: 's3cret' } }).catch(() => undefined)
    const logged = String(warn.mock.calls[0]?.[0])
    warn.mockRestore()
    expect(logged).toContain('did not match its declared `404` error schema')
    expect(logged).not.toContain('s3cret')
  })
})
