import { generate } from '../core/generate'
import { resolveConfig } from '../core/config'
import { verifyNative } from '../verify/lower'

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
    post:
      operationId: createBook
      tags: [books]
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Book' }
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } }
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
        title: { type: string, minLength: 1 }
        status: { type: string, enum: [available, lost] }
`

const web = resolveConfig({ input: 'x', plugins: ['types', 'schemas', 'client', 'queries', 'mocks', 'atlas'] })
const native = resolveConfig({ input: 'x', target: 'multiplatform' })

describe('generate', () => {
  it('emits the idiomatic split for the web target', () => {
    const r = generate(SPEC, web)
    const paths = r.files.map((f) => f.path)
    expect(paths).toContain('schemas.ts')
    expect(paths).toContain('client.ts')
    expect(paths).toContain('endpoints/books.ts')
    expect(paths).toContain('queries/books.ts')
    // Native modules are NOT emitted for the web target.
    expect(paths.some((p) => p.endsWith('.native.tsx'))).toBe(false)
  })

  it('renders schemas as a bare top-level `const` bound to an s.object literal', () => {
    // This exact shape is what PMTC's recognizer requires. Wrapping it in a
    // helper call or a `satisfies` compiles fine and silently un-lowers it.
    const src = file(generate(SPEC, web), 'schemas.ts')
    expect(src).toContain('export const Book = s.object({')
    expect(src).toContain('id: s.string().uuid(),')
    expect(src).toContain('title: s.string().min(1),')
    expect(src).toContain("status: s.enum(['available', 'lost']).optional(),")
  })

  it('puts the response generic on useQuery, not on .query()', () => {
    // PMTC reads the decode type off `useQuery<T>`. With the generic on
    // `.query<T>()` instead it emits a decode of `Any`, which does not compile
    // on Swift — and it says so only as a warning, so nothing else catches it.
    // The INVARIANT is where the generic sits, not the surrounding shape — the
    // options spread was added later and must not weaken this.
    const src = file(generate(SPEC, web), 'queries/books.ts')
    expect(src).toContain('useQuery<Book[]>(')
    expect(src).not.toContain('.query<')
  })

  it('emits ONE self-contained module per tag for the native target', () => {
    const r = generate(SPEC, native)
    const src = file(r, 'books.native.tsx')
    // Client, schema and endpoint must share a top level: PMTC resolves
    // nothing across files, so a shared `client.ts` would stop them lowering.
    expect(src).toContain('const api = createHttp(')
    expect(src).toContain('export const Book = s.object({')
    expect(src).toContain("export const listBooks = api.endpoint('GET /books'")
  })

  it('does not import `Infer` into a native module', () => {
    // TypeScript erases `import type`, but PMTC's warn pass reads the import
    // statement itself and reports the whole module as un-lowerable.
    const src = file(generate(SPEC, native), 'books.native.tsx')
    expect(src).not.toContain('Infer')
    expect(src).toContain('export type Book = {')
  })

  it('narrows enums to plain strings on the native path', () => {
    // `s.enum` does not lower. Emitting it anyway would produce a schema that
    // validates on web and not on native, which is the divergence class this
    // repo treats as a defect rather than a trade-off.
    expect(file(generate(SPEC, native), 'books.native.tsx')).toContain('status: s.string().optional(),')
  })

  it('generates a data component only for operations that can reach native', () => {
    const src = file(generate(SPEC, native), 'books.native.tsx')
    expect(src).toContain('export function ListBooksData(')
    // `getBook` takes a path parameter, so its URL cannot be baked.
    expect(src).not.toContain('GetBookData')
  })

  it('enables schema support on the generated client', () => {
    // REGRESSION (found by the bookshelf e2e). `@pyreon/http` keeps schema
    // support opt-in so the core costs nothing when unused — so an endpoint
    // declared with `{ response }` against a client that never enabled it
    // fails at RUNTIME: the request returns 200 and the query settles as an
    // error. Nothing static catches it; the response is on the wire.
    const src = file(generate(SPEC, web), 'client.ts')
    expect(src).toContain("import { standardSchema } from '@pyreon/http/schema'")
    expect(src).toContain('schema: standardSchema,')
    // Same requirement in the native layout, which inlines its own client.
    expect(file(generate(SPEC, native), 'books.native.tsx')).toContain('schema: standardSchema')
  })

  it('attaches a response schema to EVERY describable response, composites included', () => {
    // `Endpoint<S, TResponse>` takes its response type from this clause. An
    // earlier version emitted it only for a bare $ref, which left an
    // array-returning operation at `TResponse = unknown` — so `.query()` gave
    // `QueryOptionsLike<unknown>` and the generated hook did not typecheck in
    // the consumer's repo. The composite form needs `s` imported too.
    const src = file(generate(SPEC, web), 'endpoints/books.ts')
    expect(src).toContain("api.endpoint('GET /books/:id', { response: Book })")
    expect(src).toContain("api.endpoint('GET /books', { response: s.array(Book) })")
    expect(src).toContain("import { s } from '@pyreon/validate'")
  })

  it('writes optional properties with an explicit `| undefined`', () => {
    // `exactOptionalPropertyTypes` is on in the consumer presets, where
    // `x?: number` and `x?: number | undefined` are different types. The
    // schema infers the second, so a type written without it does not match
    // its own schema.
    expect(file(generate(SPEC, native), 'books.native.tsx')).toContain(
      'status?: string | undefined',
    )
  })

  it('calls the data signal in a native data component', () => {
    // Result fields are signals. Passing `q.data` uncalled hands the child a
    // function, which renders as the closure source.
    expect(file(generate(SPEC, native), 'books.native.tsx')).toContain('props.children(q.data())')
  })

  it('emits mock fixtures under `json`, from the /mock subpath', () => {
    // `MockRoute` has no `response` key, and neither `mock` nor `MockRoute` is
    // exported from the package root — both were wrong in the first cut and
    // only a typecheck of the OUTPUT caught them.
    const src = file(generate(SPEC, web), 'mocks.ts')
    expect(src).toContain("from '@pyreon/http/mock'")
    expect(src).toContain('json:')
    expect(src).not.toContain('response:')
  })

  it('reports per-operation reach with a reason', () => {
    const r = generate(SPEC, native)
    expect(r.reach.get('listBooks')?.reach).toBe('web+native')
    expect(r.reach.get('getBook')?.reach).toBe('web-only')
    expect(r.reach.get('getBook')?.reason).toContain('literal params')
    expect(r.reach.get('createBook')?.reach).toBe('web-only')
  })

  it('marks every operation web-only when the baseUrl is not absolute', () => {
    const rel = resolveConfig({ input: 'x', target: 'multiplatform', baseUrl: '/api' })
    const r = generate(SPEC, rel)
    expect([...r.reach.values()].every((v) => v.reach === 'web-only')).toBe(true)
  })

  it('is byte-identical across runs', () => {
    const a = generate(SPEC, native).files.map((f) => `${f.path}\n${f.contents}`).join('')
    const b = generate(SPEC, native).files.map((f) => `${f.path}\n${f.contents}`).join('')
    expect(a).toBe(b)
  })

  it('emits deterministic mock fixtures with no randomness', () => {
    const src = file(generate(SPEC, web), 'mocks.ts')
    expect(src).toContain('export const mockRoutes = mock(routes)')
    expect(src).toContain('"available"')
    expect(file(generate(SPEC, web), 'mocks.ts')).toBe(src)
  })

  it('emits an Atlas scenario per enum value', () => {
    const src = file(generate(SPEC, web), 'atlas.scenarios.ts')
    expect(src).toContain("'ListBooksData'")
    expect(src).toContain("name: 'status: available'")
    expect(src).toContain("name: 'status: lost'")
  })

  it('honours the plugin selection', () => {
    const only = generate(SPEC, resolveConfig({ input: 'x', plugins: ['schemas'] }))
    expect(only.files.map((f) => f.path)).toEqual(['schemas.ts'])
  })
})

describe('verify', () => {
  it('SKIPS loudly when the native compiler is absent', () => {
    // A verification that could not run must never look like one that ran and
    // passed — that is the dead-gate shape.
    const r = verifyNative(generate(SPEC, native).files, undefined)
    expect(r.ran).toBe(false)
    expect(r.reason).toContain('native-compiler')
  })

  it('reports `broken` when a framework symbol leaks into the output', () => {
    const fake = (): { code: string; warnings: string[] } => ({
      code: 'struct X { useQuery({ }) }',
      warnings: [],
    })
    const r = verifyNative(generate(SPEC, native).files, fake)
    expect(r.files.every((f) => f.verdict === 'broken')).toBe(true)
    expect(r.files[0]?.leaked).toContain('useQuery(')
  })

  it('treats a `does NOT compile` warning as broken, not advisory', () => {
    const fake = (): { code: string; warnings: string[] } => ({
      code: 'PyreonQuery<X> PyreonZodSchema_Book',
      warnings: ['Declaration q: useQuery without a response type ... does NOT compile'],
    })
    const r = verifyNative(generate(SPEC, native).files, fake)
    expect(r.files.every((f) => f.verdict === 'broken')).toBe(true)
  })

  it('reports web-only when a schema lowered but the query did not', () => {
    // The lenient version of this returned `lowers` on any single marker, so a
    // module that decoded nothing still reported success.
    const fake = (): { code: string; warnings: string[] } => ({
      code: 'PyreonZodSchema_Book PyreonSchemaError',
      warnings: [],
    })
    const r = verifyNative(generate(SPEC, native).files, fake)
    expect(r.files.every((f) => f.verdict === 'web-only')).toBe(true)
  })
})

function file(r: ReturnType<typeof generate>, path: string): string {
  const f = r.files.find((x) => x.path === path)
  if (!f) throw new Error(`no generated file ${path}; got ${r.files.map((x) => x.path).join(', ')}`)
  return f.contents
}
