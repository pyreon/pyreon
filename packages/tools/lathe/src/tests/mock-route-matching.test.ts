/**
 * Generated mock routes must actually INTERCEPT the request they describe.
 *
 * The route table used to emit the DECLARED path as a plain string
 * (`'/books/:id'`). `@pyreon/http`'s `MockRoute` matches a string as a SUFFIX
 * of the request's path+query, and `/books/:id` is not a suffix of
 * `/v1/books/b1` — so every generated mock for a parameterised operation
 * matched nothing and fell through to the real network. Nothing caught it: the
 * route table looked right, the file typechecked, and the only symptom was a
 * test or a workbench card making a real request it was supposed to be
 * insulated from.
 *
 * The lesson is why this file runs the routes through the REAL middleware
 * rather than asserting on the emitted text. A `toContain("/books/:id")`
 * assertion passes against the broken version — it can only tell you the
 * emitter wrote what it meant to.
 */
import { createHttp } from '@pyreon/http'
import { mock, type MockRoute } from '@pyreon/http/mock'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /books:
    get: { operationId: listBooks, tags: [b], responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Book' } } } } } } }
  /books/{id}:
    get:
      operationId: getBook
      tags: [b]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } } }
    delete:
      operationId: deleteBook
      tags: [b]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '204': { description: gone } }
  /books/{id}/reviews:
    get:
      operationId: listReviews
      tags: [b]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Book' } } } } } }
components:
  schemas:
    Book:
      type: object
      required: [id, title]
      properties:
        id: { type: string }
        title: { type: string }
`

const mocksText = (): string => {
  const cfg = resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'mocks'] })
  const f = generate(SPEC, cfg).files.find((x) => x.path === 'mocks.ts')
  if (!f) throw new Error('no mocks.ts')
  return f.contents
}

/**
 * Evaluate the emitted route table.
 *
 * The generated module imports `@pyreon/http/mock`, which a plain `eval` cannot
 * resolve — so only the `routes` array literal is taken and evaluated. It is
 * the value under test; `mock()` is applied here from the real package.
 */
function emittedRoutes(): MockRoute[] {
  const text = mocksText()
  const start = text.indexOf('export const routes')
  const open = text.indexOf('[', start)
  const close = text.indexOf('\n]', open)
  const literal = text.slice(open, close + 2)
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal}`)() as MockRoute[]
}

describe('generated mock routes intercept the requests they describe', () => {
  it('a path-parameter route matches the RESOLVED url', async () => {
    const api = createHttp({ baseUrl: 'https://api.test/v1', use: [mock(emittedRoutes())] })
    const getBook = api.endpoint('GET /books/:id')
    // Reaching the network here would throw; a match returns the fixture.
    const book = (await getBook({ params: { id: 'b1' } })) as { id: string }
    expect(book).toHaveProperty('title')
  })

  it('a path-parameter route does NOT swallow a deeper path', async () => {
    // `/books/:id` must not match `/books/b1/reviews` — the route ends at a
    // query string or the end of the URL. Without that bound the detail
    // fixture answers the reviews request with a single object where the
    // caller expects a list.
    const api = createHttp({ baseUrl: 'https://api.test/v1', use: [mock(emittedRoutes())] })
    const reviews = (await api.endpoint('GET /books/:id/reviews')({
      params: { id: 'b1' },
    })) as unknown[]
    expect(Array.isArray(reviews)).toBe(true)
  })

  it('a query string does not stop a path-parameter route matching', async () => {
    const api = createHttp({ baseUrl: 'https://api.test/v1', use: [mock(emittedRoutes())] })
    const book = (await api.endpoint('GET /books/:id')({
      params: { id: 'b1' },
      query: { expand: 'author' },
    })) as { id: string }
    expect(book).toHaveProperty('title')
  })

  it('a no-content operation emits NO json, so the mock answers like the server', () => {
    // `json: null` made the mock reply 200 with the body `null` while the real
    // server replies 204 with nothing — so an app tested against fixtures saw
    // `null` where production gives `undefined`.
    const del = emittedRoutes().find((r) => r.method === 'DELETE')
    expect(del, 'the DELETE route should exist').toBeDefined()
    expect(Object.hasOwn(del as object, 'json')).toBe(false)
  })

  it('a route with no path parameter stays a plain string', () => {
    // A RegExp everywhere would work, and would make every generated table
    // harder to read for no gain.
    const list = emittedRoutes().find((r) => typeof r.path === 'string')
    expect(list?.path).toBe('/books')
  })
})
