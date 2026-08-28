import { describe, expect, it } from 'vitest'
import { loadOpenApi } from '../input/openapi'

/**
 * `$ref` resolution, which is where a spec stops being a document and starts
 * being a graph — and where the input layer's central promise applies: a spec
 * feature Lathe cannot represent is a REPORTED loss, never a silent one.
 *
 * Each of these paths returns an empty schema, so getting one wrong does not
 * crash. It produces a client that generates, compiles, and quietly describes
 * the wrong shape.
 */
const spec = (body: string): string => `
openapi: 3.0.3
info: { title: T, version: '1' }
paths:
${body}
`

const withBook = (schema: string, extra = ''): string =>
  spec(`  /books:
    get:
      operationId: getBooks
      responses:
        '200':
          content:
            application/json:
              schema: ${schema}
components:
  schemas:
    Book:
      type: object
      properties: { id: { type: string } }
${extra}`)

describe('$ref resolution', () => {
  it('resolves a local component ref', () => {
    const { doc } = loadOpenApi(withBook(`{ $ref: '#/components/schemas/Book' }`))
    expect(doc.models.some((m) => m.name === 'Book')).toBe(true)
  })

  it('REPORTS a remote ref instead of silently emitting nothing', () => {
    // Lathe reads one document and never fetches. Dropping the ref quietly
    // would produce a client whose response type is `unknown` with no
    // indication why.
    const { doc } = loadOpenApi(withBook(`{ $ref: 'https://other/spec.yaml#/X' }`))
    const note = doc.notes.find((n) => n.code === 'unsupported-ref')
    expect(note, 'a remote ref must be reported').toBeDefined()
    expect(note?.message).toContain('never fetches')
    // and it says what to do about it
    expect(note?.message).toContain('Bundle the spec first')
  })

  it('REPORTS a ref that does not resolve', () => {
    // A spec can reference a component that is not there — a typo, or a
    // partial bundle. Silence here is a response typed from an empty schema.
    const { doc } = loadOpenApi(withBook(`{ $ref: '#/components/schemas/Missing' }`))
    expect(doc.notes.some((n) => n.code === 'unsupported-ref')).toBe(true)
  })

  it('honours JSON-pointer escapes (~1 for /, ~0 for ~)', () => {
    // A component name containing a slash is legal and MUST be escaped in the
    // pointer. Treating `~1` literally looks up a key that does not exist and
    // lands on the dangling-ref path, which reports a problem the spec does not
    // have — a false report is its own kind of silence.
    const { doc } = loadOpenApi(
      withBook(`{ $ref: '#/components/schemas/odd~1name' }`, `    odd/name:
      type: object
      properties: { ok: { type: boolean } }`),
    )
    expect(doc.notes.some((n) => n.code === 'unsupported-ref')).toBe(false)
  })

  it('a ref alongside other keys still resolves rather than being ignored', () => {
    const { doc } = loadOpenApi(
      withBook(`{ $ref: '#/components/schemas/Book', description: 'a book' }`),
    )
    expect(doc.notes.some((n) => n.code === 'unsupported-ref')).toBe(false)
  })
})
