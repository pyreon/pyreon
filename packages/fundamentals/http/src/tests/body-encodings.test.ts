/**
 * Non-JSON request bodies: `form`, `multipart`, `cookies`, and header records
 * carrying non-string / absent values.
 *
 * The client could only say `json:`. Stripe and Twilio accept ONLY
 * form-encoded mutation bodies, and uploads are multipart everywhere, so a
 * generated client for either sent every mutation in an encoding the server
 * rejects. The wire bytes are asserted here, through the real client, because
 * "it built a URLSearchParams" says nothing about what reached the server.
 */
import { describe, expect, it } from 'vitest'
import { encodeCookies, encodeForm, encodeMultipart } from '../body'
import { createHttp } from '../client'
import { createMock } from '../mock'

function makeApi() {
  const handle = createMock([{ method: 'POST', path: '/v1/customers', json: { id: 'cus_1' } }, { path: '/me', json: {} }])
  const api = createHttp({ baseUrl: 'https://api.test', use: [handle.middleware] })
  return { api, handle }
}

describe('encodeForm follows OpenAPI encoding styles', () => {
  it('defaults to form + explode: arrays repeat the key, nullish entries are dropped', () => {
    expect(encodeForm({ a: 1, t: ['x', 'y'], skip: undefined, nil: null, ok: true }).toString()).toBe(
      'a=1&t=x&t=y&ok=true',
    )
  })

  it('form without explode comma-joins', () => {
    expect(decodeURIComponent(encodeForm({ t: ['x', 'y'] }, { t: { explode: false } }).toString())).toBe('t=x,y')
  })

  it('deepObject uses brackets, recursively, with indexed arrays (the Stripe shape)', () => {
    const out = encodeForm(
      { metadata: { order: 'A1', n: 2 }, expand: ['customer', 'invoice'], items: [{ price: 'p_1', quantity: 2 }] },
      {
        metadata: { style: 'deepObject', explode: true },
        expand: { style: 'deepObject', explode: true },
        items: { style: 'deepObject', explode: true },
      },
    )
    expect(decodeURIComponent(out.toString())).toBe(
      'metadata[order]=A1&metadata[n]=2&expand[0]=customer&expand[1]=invoice&items[0][price]=p_1&items[0][quantity]=2',
    )
  })

  it('space- and pipe-delimited arrays', () => {
    expect(decodeURIComponent(encodeForm({ t: ['a', 'b'] }, { t: { style: 'pipeDelimited' } }).toString())).toBe('t=a|b')
    expect(encodeForm({ t: ['a', 'b'] }, { t: { style: 'spaceDelimited' } }).get('t')).toBe('a b')
  })

  it('a nested value under the default style falls back to brackets, never [object Object]', () => {
    expect(decodeURIComponent(encodeForm({ o: { a: { b: 1 } } }).toString())).toBe('a[b]=1')
    expect(encodeForm({ o: { a: { b: 1 } } }).toString()).not.toContain('object')
  })
})

describe('the client sends each body encoding on the wire', () => {
  it('form: body text and content-type', async () => {
    const { api, handle } = makeApi()
    await api.post('/v1/customers', { form: { email: 'a@b.c', metadata: { k: 'v' } }, formEncoding: { metadata: { style: 'deepObject' } } })
    const call = handle.calls[0]!
    expect(call.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(decodeURIComponent(String(call.body))).toBe('email=a@b.c&metadata[k]=v')
  })

  it('multipart: a FormData body whose file part survives, and NO manual content-type', async () => {
    const { api, handle } = makeApi()
    const file = new Blob(['hello'], { type: 'text/plain' })
    await api.post('/v1/customers', { multipart: { file, purpose: 'x', tags: ['a', 'b'] } })
    const call = handle.calls[0]!
    expect(call.body).toBeInstanceOf(FormData)
    const fd = call.body as FormData
    expect(await (fd.get('file') as Blob).text()).toBe('hello')
    expect(fd.get('purpose')).toBe('x')
    expect(fd.getAll('tags')).toEqual(['a', 'b'])
    expect(call.headers['content-type']).toBeUndefined()
  })

  it('cookies become a Cookie header, merged with one already set', async () => {
    const { api, handle } = makeApi()
    await api.get('/me', { cookies: { session: 'a b', theme: undefined }, headers: { cookie: 'x=1' } })
    expect(handle.calls[0]!.headers['cookie']).toBe('x=1; session=a%20b')
  })

  it('a header record OMITS undefined values instead of sending "undefined"', async () => {
    const { api, handle } = makeApi()
    await api.get('/me', { headers: { 'x-request-id': undefined, 'x-retries': 3, 'x-dry': false } })
    const h = handle.calls[0]!.headers
    expect(h['x-request-id']).toBeUndefined()
    expect(h['x-retries']).toBe('3')
    expect(h['x-dry']).toBe('false')
  })

  it('refuses two body encodings at once', async () => {
    const { api } = makeApi()
    await expect(api.post('/v1/customers', { json: {}, form: {} })).rejects.toThrow(/ONE of `json`, `form`/)
  })
})

describe('endpoints carry the encodings', () => {
  it('declared formEncoding applies to the call, and per-call headers MERGE over declared ones', async () => {
    const { api, handle } = makeApi()
    const create = api.endpoint('POST /v1/customers', {
      headers: { 'stripe-version': '2024-01-01' },
      formEncoding: { metadata: { style: 'deepObject', explode: true } },
    })
    await create({ form: { metadata: { a: '1' } }, headers: { 'idempotency-key': 'k1' } })
    const call = handle.calls[0]!
    expect(decodeURIComponent(String(call.body))).toBe('metadata[a]=1')
    // Before: `args.headers ?? options.headers` dropped the declared set.
    expect(call.headers['stripe-version']).toBe('2024-01-01')
    expect(call.headers['idempotency-key']).toBe('k1')
  })

  it('a raw body passes through with a declared content-type', async () => {
    const { api, handle } = makeApi()
    const upload = api.endpoint('POST /v1/customers', { headers: { 'content-type': 'application/octet-stream' } })
    const bytes = new Uint8Array([1, 2, 3])
    await upload({ body: bytes })
    expect(handle.calls[0]!.headers['content-type']).toBe('application/octet-stream')
    expect(handle.calls[0]!.body).toBe(bytes)
  })
})

describe('encodeMultipart / encodeCookies directly', () => {
  it('an object part is JSON text', () => {
    expect(encodeMultipart({ meta: { a: 1 } }).get('meta')).toBe('{"a":1}')
  })
  it('cookies are percent-encoded and nullish ones omitted', () => {
    expect(encodeCookies({ a: 'x;y', b: null, c: 1 })).toBe('a=x%3By; c=1')
  })
})

describe('the remaining shapes', () => {
  it('form without explode on an OBJECT joins key,value pairs', () => {
    expect(decodeURIComponent(encodeForm({ o: { a: 1, b: 'x', c: null } }, { o: { explode: false } }).toString())).toBe('o=a,1,b,x')
  })

  it('a Date serializes as ISO text in form, multipart and deepObject', () => {
    const d = new Date('2026-01-02T03:04:05.000Z')
    expect(encodeForm({ at: d }).get('at')).toBe(d.toISOString())
    expect(encodeForm({ o: { at: d } }, { o: { style: 'deepObject' } }).get('o[at]')).toBe(d.toISOString())
    expect(encodeMultipart({ at: d }).get('at')).toBe(d.toISOString())
  })

  it('an array of objects under the default style falls back to brackets', () => {
    expect(decodeURIComponent(encodeForm({ items: [{ p: 1 }] }).toString())).toBe('items[0][p]=1')
  })

  it('per-call headers merge over declared ones in every HeadersInit form, and null removes one', async () => {
    const { api, handle } = makeApi()
    const ep = api.endpoint('GET /me', { headers: { a: '1', b: '2' } })
    await ep({ headers: new Headers({ b: '3' }) })
    await ep({ headers: [['c', '4']] })
    await ep({ headers: { a: null } })
    expect(handle.calls[0]!.headers).toMatchObject({ a: '1', b: '3' })
    expect(handle.calls[1]!.headers).toMatchObject({ a: '1', b: '2', c: '4' })
    expect(handle.calls[2]!.headers.a).toBeUndefined()
    expect(handle.calls[2]!.headers.b).toBe('2')
  })
})

describe('edge values', () => {
  it('cookies alone set the header; all-nullish cookies set nothing', async () => {
    const { api, handle } = makeApi()
    await api.get('/me', { cookies: { a: '1' } })
    await api.get('/me', { cookies: { a: undefined } })
    expect(handle.calls[0]!.headers.cookie).toBe('a=1')
    expect(handle.calls[1]!.headers.cookie).toBeUndefined()
  })

  it('a caller-set content-type wins for json and form', async () => {
    const { api, handle } = makeApi()
    await api.post('/v1/customers', { json: {}, headers: { 'content-type': 'application/merge-patch+json' } })
    await api.post('/v1/customers', { form: { a: 1 }, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' } })
    expect(handle.calls[0]!.headers['content-type']).toBe('application/merge-patch+json')
    expect(handle.calls[1]!.headers['content-type']).toBe('application/x-www-form-urlencoded; charset=utf-8')
  })

  it('an exploded object property holding an array uses brackets; a Blob is not an object field', () => {
    expect(decodeURIComponent(encodeForm({ o: { tags: ['a'] } }).toString())).toBe('tags[0]=a')
    expect(encodeMultipart({ f: [new Blob(['z']), 'y', null] }).getAll('f')).toHaveLength(2)
  })
})
