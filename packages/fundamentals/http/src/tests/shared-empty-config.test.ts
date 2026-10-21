/**
 * A client created without `use` or `meta` shares one frozen empty middleware
 * list and meta record. These specs lock that the sharing is invisible: an
 * extended client's middleware and a request's meta never reach another client.
 */
import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { toHttpResponse } from '../transport'
import type { HttpMiddleware, HttpRequest, Transport } from '../types'

const seen: HttpRequest[] = []
const transport: Transport = (request) => {
  seen.push(request)
  return Promise.resolve(toHttpResponse(new Response('{}', { status: 200 }), request))
}

describe('shared empty middleware and meta', () => {
  it('keeps an extended client’s middleware out of the base and its siblings', async () => {
    const calls: string[] = []
    const tag =
      (name: string): HttpMiddleware =>
      (req, next) => {
        calls.push(name)
        return next(req)
      }
    const base = createHttp({ transport })
    const a = base.extend({ use: [tag('a')] })
    const sibling = createHttp({ transport })

    await base.get('/x')
    await sibling.get('/x')
    expect(calls).toEqual([])
    await a.get('/x')
    expect(calls).toEqual(['a'])
  })

  it('gives each request its own meta, and per-request meta does not stick', async () => {
    seen.length = 0
    const api = createHttp({ transport })
    await api.get('/x', { meta: { trace: 1 } })
    await api.get('/y')
    const other = createHttp({ transport })
    await other.get('/z')
    expect(seen.map((r) => r.meta)).toEqual([{ trace: 1 }, {}, {}])
    expect(seen[1]!.meta).not.toBe(seen[2]!.meta)
  })

  it('still merges configured meta through extend', async () => {
    seen.length = 0
    const api = createHttp({ transport, meta: { app: 'x' } }).extend({ meta: { v: 2 } })
    await api.get('/x')
    expect(seen[0]!.meta).toEqual({ app: 'x', v: 2 })
  })
})
