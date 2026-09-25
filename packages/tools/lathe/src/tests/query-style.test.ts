/**
 * Query parameter `style` / `explode`, and object query parameters (audit
 * A10/B2). Lathe used to ignore both: a CSV array went out as repeated keys
 * and an object as `filter=%5Bobject+Object%5D`, whose TYPE the endpoint also
 * rejected. The generated endpoint now declares the serialization the spec
 * states wherever it differs from the runtime's default.
 */
import type { HttpMiddleware } from '@pyreon/http'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

const ok = { '200': { description: 'x', content: { 'application/json': { schema: { type: 'string' } } } } }
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        parameters: [
          { name: 'ids', in: 'query', style: 'form', explode: false, schema: { type: 'array', items: { type: 'integer' } } },
          { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'words', in: 'query', style: 'spaceDelimited', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'filter', in: 'query', style: 'deepObject', explode: true, schema: { $ref: '#/components/schemas/Filter' } },
          { name: 'page', in: 'query', schema: { type: 'object', properties: { size: { type: 'integer' }, cursor: { type: 'string' } } } },
        ],
        responses: ok,
      },
    },
  },
  components: { schemas: { Filter: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'done'] } } } } },
})

afterAll(() => cleanEmitted('b2'))

describe('query serialization follows the spec', () => {
  it('declares only the styles that differ from the runtime default', () => {
    const e = emitToDisk('b2', SPEC, { plugins: ['schemas', 'client'] })
    const ep = e.layer('endpoints')
    expect(ep).toContain(`ids: { style: 'form', explode: false }`)
    expect(ep).toContain(`words: { style: 'spaceDelimited', explode: false }`)
    // OpenAPI's default for an OBJECT is form + exploded; the runtime's is brackets.
    expect(ep).toContain(`page: { style: 'form', explode: true }`)
    // Arrays under the default and deepObject objects need nothing.
    expect(ep).not.toMatch(/tags: \{ style/)
    expect(ep).not.toMatch(/filter: \{ style/)
  })

  it('sends what the spec says', async () => {
    const e = emitToDisk('b2', SPEC, { plugins: ['schemas', 'client'] })
    const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/index.ts')
    let url = ''
    client.setDevTransport(async (req) => {
      url = req.url
      return { raw: new Response('"ok"'), status: 200, ok: true, headers: new Headers(), request: req }
    })
    try {
      await eps.listItems?.({
        query: { ids: [1, 2], tags: ['a', 'b'], words: ['x', 'y'], filter: { status: 'open' }, page: { size: 10 } },
      })
    } finally {
      client.setDevTransport(null)
    }
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toBe(
      'https://api.test/items?ids=1,2&tags=a&tags=b&words=x y&filter[status]=open&size=10',
    )
  })

  it('an object query parameter typechecks, on every client', () => {
    for (const client of ['pyreon', 'fetch'] as const) {
      const { errors } = typecheckSpec(`b2-${client}`, SPEC, { client, plugins: ['schemas', 'client', 'queries'] })
      expect(errors, errors.join('\n')).toEqual([])
    }
  })
})
