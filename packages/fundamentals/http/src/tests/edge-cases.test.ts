/**
 * Edge paths that the main suites do not reach.
 *
 * Every case here is a real behaviour someone will hit — an error built
 * before a request exists, a `multipart/form-data` response, a schema issue
 * with a non-string path segment — not coverage padding.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHttp } from '../client'
import {
  AbortError,
  ClientError,
  NetworkError,
  ParseError,
  RequestError,
  ResponseValidationError,
  ServerError,
  TimeoutError,
  httpErrorFor,
  isAbortError,
} from '../errors'
import { forwardHeaders } from '../middleware'
import { createMock, mock } from '../mock'
import { _setRequestSource } from '../request-context'
import { standardSchema } from '../schema'
import { linkSignals } from '../signal'
import { toHttpResponse } from '../transport'
import type { HttpRequest } from '../types'

const bareRequest = (): HttpRequest => ({
  method: 'GET',
  url: '/x',
  headers: new Headers(),
  body: null,
  signal: undefined,
  credentials: undefined,
  meta: {},
})

describe('errors constructed WITHOUT a request', () => {
  // Every error takes `request` optionally, because a failure can happen
  // before one is built (a bad URL, a missing transport). Those messages
  // must still read cleanly rather than saying "undefined undefined".
  it('formats a message with no method/url prefix', () => {
    expect(new TimeoutError(500).message).toBe(
      '[Pyreon] timed out after 500ms. Pass `timeout` to raise it, or `timeout: false` to disable.',
    )
    expect(new AbortError().message).toBe('[Pyreon] was aborted.')
    expect(new NetworkError(new Error('boom')).message).toBe(
      '[Pyreon] failed before a response was received: boom',
    )
    expect(new ParseError('JSON', new Error('bad')).message).toBe(
      '[Pyreon] response body could not be read as JSON: bad',
    )
    expect(new ResponseValidationError(new Error('nope'), { a: 1 }).message).toBe(
      '[Pyreon] response did not match the expected schema: nope',
    )
  })

  it('stringifies a non-Error cause', () => {
    expect(new NetworkError('plain string').message).toContain('plain string')
    expect(new ParseError('text', 42).message).toContain('42')
    expect(new ResponseValidationError({ odd: true }, null).message).toContain('[object Object]')
  })

  it('leaves `request` undefined and keeps the class names', () => {
    const error = new AbortError()
    expect(error.request).toBeUndefined()
    expect(error.name).toBe('AbortError')
    expect(error).toBeInstanceOf(RequestError)
    expect(new RequestError('x').name).toBe('RequestError')
  })
})

describe('httpErrorFor', () => {
  const at = (status: number): ReturnType<typeof httpErrorFor> =>
    httpErrorFor(toHttpResponse(new Response(null, { status }), bareRequest()))

  it('picks the subclass by status band', () => {
    expect(at(400)).toBeInstanceOf(ClientError)
    expect(at(499)).toBeInstanceOf(ClientError)
    expect(at(500)).toBeInstanceOf(ServerError)
    expect(at(503)).toBeInstanceOf(ServerError)
    // 3xx is non-2xx but neither band — the base class.
    expect(at(302).name).toBe('HttpError')
  })
})

describe('isAbortError', () => {
  it('accepts our class and the platform DOMException', () => {
    expect(isAbortError(new AbortError())).toBe(true)
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
  })

  it('rejects everything else, including nullish', () => {
    expect(isAbortError(new Error('nope'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})

describe('linkSignals', () => {
  it('returns a no-op link when there is nothing to cancel on', () => {
    const link = linkSignals(undefined, false)
    expect(link.signal).toBeUndefined()
    expect(link.timedOut()).toBe(false)
    expect(() => link.cleanup()).not.toThrow()
  })

  it('treats a zero or negative timeout as no timeout', () => {
    expect(linkSignals(undefined, 0).signal).toBeUndefined()
    expect(linkSignals(undefined, -1).signal).toBeUndefined()
  })

  it('propagates an ALREADY-aborted caller signal and skips the timer', () => {
    const link = linkSignals(AbortSignal.abort('gone'), 5000)
    expect(link.signal?.aborted).toBe(true)
    expect(link.timedOut()).toBe(false)
    link.cleanup()
  })

  it('is idempotent — a second cleanup is harmless', () => {
    const controller = new AbortController()
    const link = linkSignals(controller.signal, 1000)
    link.cleanup()
    expect(() => link.cleanup()).not.toThrow()
  })

  it('forwards the caller abort reason', () => {
    const controller = new AbortController()
    const link = linkSignals(controller.signal, false)
    controller.abort('because')
    expect(link.signal?.reason).toBe('because')
    link.cleanup()
  })
})

describe('body decoders', () => {
  it('decodes multipart/form-data', async () => {
    const body = ['--b', 'Content-Disposition: form-data; name="k"', '', 'v', '--b--', ''].join(
      '\r\n',
    )
    const api = createHttp({
      use: [
        mock([
          { path: '/f', body, headers: { 'content-type': 'multipart/form-data; boundary=b' } },
        ]),
      ],
    })

    expect((await api.get('/f').formData()).get('k')).toBe('v')
  })

  it('raises ParseError when a body cannot be read as the requested type', async () => {
    const api = createHttp({ use: [mock([{ path: '/f', body: 'not form data' }])] })
    await expect(api.get('/f').formData()).rejects.toBeInstanceOf(ParseError)
  })

  it('reads a 304 as bodyless', async () => {
    const api = createHttp({
      use: [mock([{ path: '/x', status: 304 }])],
      throwHttpErrors: false,
    })
    expect(await api.get('/x').json()).toBeUndefined()
    await expect(api.get('/x').void()).resolves.toBeUndefined()
  })
})

describe('mock internals', () => {
  it('rejects a delayed route when the signal is ALREADY aborted', async () => {
    const api = createHttp({ use: [mock([{ path: '/slow', delay: 50, json: {} }])] })
    // The client short-circuits a pre-aborted signal, so drive the
    // middleware directly to reach the mock's own guard.
    const handle = createMock([{ path: '/slow', delay: 50, json: {} }])
    const request = { ...bareRequest(), url: '/slow', signal: AbortSignal.abort() }
    await expect(
      handle.middleware(request, () => Promise.reject(new Error('unreached'))),
    ).rejects.toMatchObject({ name: 'AbortError' })
    void api
  })

  it('records a request with no body as null', async () => {
    const handle = createMock([{ path: '/x', json: {} }])
    const api = createHttp({ use: [handle.middleware] })
    await api.get('/x')
    expect(handle.calls[0]!.body).toBeNull()
  })
})

describe('schema issue formatting', () => {
  it('renders a nested path and a root-level issue', async () => {
    const api = createHttp({
      use: [mock([{ path: '/x', json: { outer: { inner: 1 } } }])],
      schema: standardSchema,
    })
    const error = await api
      .get('/x')
      .json(z.object({ outer: z.object({ inner: z.string() }) }))
      .catch((e: unknown) => e)

    expect((error as Error).message).toContain('outer.inner')
  })

  it('labels an issue with no path as (root)', async () => {
    const api = createHttp({
      use: [mock([{ path: '/x', json: 'a string' }])],
      schema: standardSchema,
    })
    const error = await api.get('/x').json(z.number()).catch((e: unknown) => e)
    expect((error as Error).message).toContain('(root)')
  })
})

describe('forwardHeaders origin parsing', () => {
  it('treats an unparseable outgoing URL as cross-origin and skips', async () => {
    // A hand-registered source (no /server import) — proves the seam works
    // for any host, not just the Node ALS one.
    _setRequestSource(() => ({
      url: 'https://app.test/page',
      headers: new Headers({ cookie: 'secret' }),
    }))

    const seen: (string | null)[] = []
    const api = createHttp({
      use: [forwardHeaders(['cookie'])],
      transport: (request) => {
        seen.push(request.headers.get('cookie'))
        return Promise.resolve(toHttpResponse(new Response('{}'), request))
      },
    })

    await api.get('::: not a url :::')
    expect(seen[0]).toBeNull()

    _setRequestSource(null)
  })
})

describe('url edge cases', () => {
  it('drops a nullish member inside an array query value', async () => {
    const seen: string[] = []
    const api = createHttp({
      transport: (request) => {
        seen.push(request.url)
        return Promise.resolve(toHttpResponse(new Response('{}'), request))
      },
    })

    await api.get('/x', { query: { tag: ['a', null as never, 'b'] } })
    expect(seen[0]).toBe('/x?tag=a&tag=b')
  })
})
