/**
 * The multiplatform claim, measured.
 *
 * Lathe says its native modules lower to Swift and Kotlin. This runs the REAL
 * `@pyreon/native-compiler` over the REAL generated output and checks the
 * emitted source, because the claim is otherwise unfalsifiable.
 *
 * Every assertion here is POSITIVE about the emitted native code. Asserting
 * `warnings.length === 0` alone would pass against a build that reproduced
 * `useQuery` verbatim — zero warnings, and Swift that cannot find the symbol.
 */

import { transform } from '@pyreon/native-compiler'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { verifyNative, worstVerdict } from '../verify/lower'

const SPEC = `
openapi: 3.0.3
info: { title: Bookshelf, version: '1.2.0' }
servers: [{ url: 'https://books.test/v1' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
  /books/{id}:
    get:
      operationId: getBook
      tags: [books]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } }
components:
  schemas:
    Book:
      type: object
      required: [id, title]
      properties:
        id: { type: string, format: uuid }
        title: { type: string, minLength: 2 }
        pages: { type: integer, minimum: 1 }
`

const result = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))
const nativeModule = result.files.find((f) => f.path === 'books.native.tsx')

describe('generated native modules lower', () => {
  it('emitted a native module at all', () => {
    // Guards the premise of every assertion below: a suite that silently had
    // nothing to check would report green while proving nothing.
    expect(nativeModule).toBeDefined()
  })

  for (const target of ['swift', 'kotlin'] as const) {
    describe(target, () => {
      const out = transform(nativeModule!.contents, { target })

      it('compiles with no warnings', () => {
        expect(out.warnings).toEqual([])
      })

      it('emits a real schema struct with parse and constraint checks', () => {
        expect(out.code).toContain('PyreonZodSchema_Book')
        expect(out.code).toContain('PyreonSchemaError')
        // The `minLength: 2` from the spec must survive all the way through.
        expect(out.code).toMatch(/min length 2|minLength|count < 2/)
      })

      it('emits a real PyreonQuery with the baked URL', () => {
        expect(out.code).toContain('PyreonQuery<')
        expect(out.code).toContain('https://books.test/v1/books')
      })

      it('leaves no web-only framework symbol in the output', () => {
        // Each of these compiles here and fails at swiftc/kotlinc time with
        // "cannot find X in scope" — the failure mode this whole check exists
        // to make impossible.
        for (const leak of ['useQuery(', 'createHttp(', 's.object(', 'Infer']) {
          expect(out.code).not.toContain(leak)
        }
      })
    })
  }

  it('verifyNative reports `lowers` on both targets', () => {
    const report = verifyNative(result.files, transform)
    expect(report.ran).toBe(true)
    expect(report.files.length).toBeGreaterThan(0)
    expect(report.files.map((f) => f.verdict)).toEqual(report.files.map(() => 'lowers'))
    expect(worstVerdict(report)).toBe('lowers')
  })

  it('BISECT LOCK: moving useQuery out of the component body breaks it', () => {
    // This is the constraint the whole native layout exists to satisfy, and it
    // fails SILENTLY — PMTC reads a standalone hook as a View and reproduces
    // `useQuery` verbatim with zero warnings. Without this lock, a future
    // refactor to "cleaner" generated hooks would look entirely fine.
    const broken = nativeModule!.contents.replace(
      /export function ListBooksData[\s\S]*$/,
      `export function useListBooks() {\n  return useQuery<Book[]>(() => listBooks.query())\n}\n`,
    )
    const out = transform(broken, { target: 'swift' })
    expect(out.code).not.toContain('PyreonQuery<')
    expect(out.code).toContain('useQuery(')
    // And the verifier must CATCH it rather than trusting the empty warnings.
    const report = verifyNative([{ path: 'x.native.tsx', contents: broken }], transform)
    expect(report.files.every((f) => f.verdict === 'broken')).toBe(true)
  })

  it('BISECT LOCK: splitting the client into another file breaks lowering', () => {
    // PMTC has no module graph. An imported `api` resolves against nothing, so
    // the endpoint URL cannot be baked and the query stays web — which is why
    // the native layout duplicates the client into every tag module.
    const split = nativeModule!.contents.replace(
      /const api = createHttp\([^)]*\)/,
      "import { api } from './client'",
    )
    const out = transform(split, { target: 'swift' })
    expect(out.code).not.toContain('PyreonQuery<')
  })
})
