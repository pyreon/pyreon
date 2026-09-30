/**
 * A `bigint` as a path / query / header / cookie PARAMETER.
 *
 * `@pyreon/http/json` decodes an int64 past 2^53 - 1 as a `bigint`, so the
 * value a caller has in hand for "fetch this record again" is a bigint. It
 * must be accepted where the id goes back out — as its exact decimal digits,
 * never through a lossy `Number(…)` — and it must not break the query KEY,
 * which `@pyreon/query` hashes with `JSON.stringify` (a TypeError on a bigint).
 */
import { hashKey, QueryClient } from '@pyreon/query'
import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { losslessJson } from '../json'
import { createMock } from '../mock'
import { toQueryOptions } from '../query'
import { buildQuery, buildUrl } from '../url'

const BIG = 9007199254740993n // 2^53 + 1: Number(BIG) is …992
const MAX = 9223372036854775807n // int64 max

describe('URL serialization', () => {
  it('writes a bigint path parameter as its exact digits', () => {
    expect(buildUrl('/api', '/entries/:id', { id: BIG }, undefined)).toBe('/api/entries/9007199254740993')
    expect(buildUrl(undefined, '/a/:x/:y', { x: -MAX, y: 0n }, undefined)).toBe('/a/-9223372036854775807/0')
  })

  it('writes a bigint query value — scalar, array and object — as exact digits', () => {
    expect(buildQuery({ after: BIG })).toBe('?after=9007199254740993')
    expect(buildQuery({ ids: [BIG, 1n, 2] })).toBe('?ids=9007199254740993&ids=1&ids=2')
    expect(buildQuery({ ids: [BIG, MAX] }, { ids: { style: 'form', explode: false } })).toBe(
      '?ids=9007199254740993%2C9223372036854775807',
    )
    expect(buildQuery({ range: { from: BIG, to: [MAX] } })).toBe(
      '?range%5Bfrom%5D=9007199254740993&range%5Bto%5D=9223372036854775807',
    )
  })
})

describe('through the client', () => {
  it('sends bigint path, query, header and cookie values as exact digits', async () => {
    const handle = createMock([{ path: /.*/, json: {} }])
    const api = createHttp({ baseUrl: '/v1', use: [handle.middleware] })
    await api.get('/entries/:id', {
      params: { id: BIG },
      query: { after: MAX },
      headers: { 'x-tenant': BIG },
      cookies: { session: MAX },
    })
    const call = handle.calls[0]!
    expect(call.url).toBe('/v1/entries/9007199254740993?after=9223372036854775807')
    expect(call.headers['x-tenant']).toBe('9007199254740993')
    expect(call.headers.cookie).toBe('session=9223372036854775807')
  })

  it('round-trips: an id decoded as a bigint goes back out digit for digit', async () => {
    const handle = createMock([
      { path: '/entries', json: [{ id: BIG }] },
      { path: /^\/entries\/\d+$/, json: { ok: true } },
    ])
    const api = createHttp({ use: [handle.middleware], json: losslessJson })
    const listed = (await api.get('/entries').json()) as Array<{ id: bigint }>
    expect(listed[0]!.id).toBe(BIG)

    const getEntry = api.endpoint('GET /entries/:id')
    await getEntry({ params: { id: listed[0]!.id } })
    expect(handle.calls[1]!.url).toBe('/entries/9007199254740993')
  })
})

describe('query keys', () => {
  it('an endpoint key holding a bigint hashes, and matches the key of the same URL', () => {
    const api = createHttp()
    const getEntry = api.endpoint('GET /entries/:id')
    const key = getEntry.key({ params: { id: BIG }, query: { ids: [MAX], f: { n: 1n } } })
    // `JSON.stringify` throws on a bigint; the key must not carry one.
    expect(() => hashKey(key)).not.toThrow()
    expect(key).toEqual([
      'GET',
      '/entries/:id',
      { params: { id: '9007199254740993' }, query: { ids: ['9223372036854775807'], f: { n: '1' } } },
    ])
    // Same URL, same cache entry.
    expect(hashKey(key)).toBe(
      hashKey(getEntry.key({ params: { id: '9007199254740993' }, query: { ids: ['9223372036854775807'], f: { n: '1' } } })),
    )
  })

  it('leaves a key without a bigint untouched (same object identity)', () => {
    const api = createHttp()
    const params = { id: 5 }
    const key = api.endpoint('GET /entries/:id').key({ params })
    expect((key[2] as { params: unknown }).params).toBe(params)
  })

  it('a bigint-keyed endpoint query fetches through a real QueryClient', async () => {
    const handle = createMock([{ path: /^\/entries\/\d+$/, json: { id: 1 } }])
    const api = createHttp({ use: [handle.middleware] })
    const getEntry = api.endpoint('GET /entries/:id')
    const client = new QueryClient()
    const data = await client.fetchQuery(getEntry.query({ params: { id: BIG } }))
    expect(data).toEqual({ id: 1 })
    expect(handle.calls[0]!.url).toBe('/entries/9007199254740993')
    expect(client.getQueryData(getEntry.key({ params: { id: BIG } }))).toEqual({ id: 1 })
  })

  it('toQueryOptions scopes a bigint the same way', () => {
    const api = createHttp()
    const { queryKey } = toQueryOptions(api, '/entries/:id', { params: { id: BIG } })
    expect(() => hashKey(queryKey)).not.toThrow()
    expect(queryKey).toEqual(['GET', '/entries/:id', { params: { id: '9007199254740993' } }])
  })
})
