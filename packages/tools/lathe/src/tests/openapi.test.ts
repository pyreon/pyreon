import { loadOpenApi } from '../input/openapi'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers:
  - url: https://api.test/v1
paths:
  /books/{bookId}:
    get:
      operationId: getBook
      tags: [books]
      parameters:
        - { name: bookId, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Book' }
  /books:
    get:
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
components:
  schemas:
    Entity:
      type: object
      required: [id]
      properties: { id: { type: string, format: uuid } }
    Book:
      allOf:
        - $ref: '#/components/schemas/Entity'
        - type: object
          required: [title]
          properties:
            title: { type: string, minLength: 1 }
            status: { type: string, enum: [a, b] }
            note: { type: string, nullable: true }
`

describe('openapi -> ir', () => {
  const { doc } = loadOpenApi(SPEC)

  it('converts OpenAPI path syntax to the Pyreon endpoint form', () => {
    // `@pyreon/http` declares `:id`; a `{id}` reaching the endpoint literal
    // would produce a URL with braces in it.
    expect(doc.operations.find((o) => o.id === 'getBook')?.path).toBe('/books/:bookId')
  })

  it('flattens allOf, including through a $ref', () => {
    // The inheritance idiom. If the $ref arm is not resolved, `id` silently
    // disappears from every model that extends a base.
    const book = doc.models.find((m) => m.name === 'Book')
    expect(book?.type.kind).toBe('object')
    const names = book?.type.kind === 'object' ? book.type.fields.map((f) => f.name) : []
    expect(names).toContain('id')
    expect(names).toContain('title')
  })

  it('carries enum, nullable and required through to the fields', () => {
    const book = doc.models.find((m) => m.name === 'Book')
    const fields = book?.type.kind === 'object' ? book.type.fields : []
    const status = fields.find((f) => f.name === 'status')
    expect(status?.type).toEqual({ kind: 'string', enum: ['a', 'b'] })
    expect(fields.find((f) => f.name === 'note')?.nullable).toBe(true)
    expect(fields.find((f) => f.name === 'title')?.required).toBe(true)
    expect(fields.find((f) => f.name === 'status')?.required).toBe(false)
  })

  it('derives an operationId when the spec omits one, and SAYS so', () => {
    // A derived name is fine; a derived name nobody was told about is a
    // rename waiting to happen the next time the path changes.
    const derived = doc.operations.find((o) => o.path === '/books' && o.method === 'GET')
    expect(derived?.id).toBe('getBooks')
    expect(doc.notes.some((n) => n.code === 'missing-operation-id')).toBe(true)
  })

  it('marks a path parameter required even when the spec does not', () => {
    const { doc: d } = loadOpenApi(
      SPEC.replace('{ name: bookId, in: path, required: true', '{ name: bookId, in: path'),
    )
    expect(d.operations.find((o) => o.id === 'getBook')?.pathParams[0]?.required).toBe(true)
  })

  it('is deterministic: the same spec produces the same IR', () => {
    // Regeneration must be byte-identical or every run is an unreviewable diff.
    expect(JSON.stringify(loadOpenApi(SPEC).doc)).toBe(JSON.stringify(loadOpenApi(SPEC).doc))
  })

  it('records a note when the spec declares no server', () => {
    const { doc: d } = loadOpenApi(SPEC.replace(/servers:\n  - url: .*\n/, ''))
    expect(d.baseUrl).toBe('')
    expect(d.notes.some((n) => n.code === 'no-servers')).toBe(true)
  })
})
