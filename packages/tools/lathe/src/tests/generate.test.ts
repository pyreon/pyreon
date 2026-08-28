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
    // A path param used to disqualify an operation, because PMTC resolved the
    // URL to a compile-time constant. It now lowers through `useQuery` (whose
    // native harness is keyed on the resulting URL, so it re-fetches when the
    // prop changes), so the component IS emitted — with the param as a prop.
    // That it genuinely lowers is asserted in `native-lowering.test.ts`; this
    // spec only fixes the emit's shape.
    expect(src).toContain('export function GetBookData(')
    expect(src).toContain('props: { id: string; children:')
    // The invariant the title names is unchanged and still has live cases:
    // a MUTATION has no data to render, so it gets no data component.
    expect(src).not.toContain('CreateBookData')
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

  it('derives `enabled` from args, so a not-ready query cannot fire', () => {
    // The most common way to get a detail query wrong is to fire it before its
    // id exists. Passing a placeholder id and a matching `enabled` writes the
    // same condition twice, and getting the second one wrong requests
    // `/books/` with an empty segment — a 404 on first paint that reads as a
    // backend fault. Returning `undefined` says "not yet" ONCE.
    const src = file(generate(SPEC, web), 'queries/books.ts')
    expect(src).toContain('args: () => { params: { id: string } } | undefined')
    expect(src).toContain('if (a === undefined) {')
    // Keyed on the endpoint's own prefix, so an invalidation still matches it.
    expect(src).toContain('queryKey: getBook.key.prefix')
    // `enabled` AFTER the caller's options in the disabled branch: a caller's
    // `enabled: true` must not be able to fire a request with a missing path
    // parameter. In the ready branch it respects an explicit `false`.
    expect(src).toContain('...extra, enabled: false }')
    expect(src).toContain('...extra, enabled: extra.enabled !== false }')
  })

  it('leaves a parameterless hook alone — nothing to be not-ready about', () => {
    const src = file(generate(SPEC, web), 'queries/books.ts')
    expect(src).toContain('export function useListBooks(options?: () => Record<string, unknown>) {')
    expect(src).toContain('return useQuery<Book[]>(() => ({ ...listBooks.query(), ...options?.() }))')
  })

  it('reports per-operation reach with a reason', () => {
    const r = generate(SPEC, native)
    expect(r.reach.get('listBooks')?.reach).toBe('web+native')
    // `getBook` takes a path param. That used to make it web-only; PMTC now
    // lowers a runtime `:param` through `useQuery`, so it reaches native and
    // the generated component takes the param as a prop.
    expect(r.reach.get('getBook')?.reach).toBe('web+native')
    expect(r.reach.get('getBook')?.reason).toBeUndefined()
    // The invariant this spec protects — a web-only op is REPORTED, with a
    // reason a reader can act on — is unchanged, and a mutation still is one.
    expect(r.reach.get('createBook')?.reach).toBe('web-only')
    expect(r.reach.get('createBook')?.reason).toContain('mutations')
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

  it('gives array fixture elements DISTINCT identities', () => {
    // Identical elements share an id, which collapses a keyed `<For>` to one
    // row and trips the duplicate-key warning — so a fixture that ships them
    // demonstrates the opposite of what it appears to.
    const src = file(generate(SPEC, web), 'mocks.ts')
    expect(src).toContain('00000000-0000-4000-8000-000000000001')
    expect(src).toContain('00000000-0000-4000-8000-000000000002')
  })

  it('emits deterministic mock fixtures with no randomness', () => {
    const src = file(generate(SPEC, web), 'mocks.ts')
    expect(src).toContain('export const mockRoutes = mock(routes)')
    expect(src).toContain('"available"')
    expect(file(generate(SPEC, web), 'mocks.ts')).toBe(src)
  })

  it('emits an Atlas scenario per PREVIEW STATE', () => {
    // This test used to assert one scenario per ENUM VALUE, keyed by a native
    // data component -- names Atlas never scans, and args that were response
    // fields rather than props. The invariant it protected (the emitter
    // produces scenarios exercising a real variant axis) is kept; the axis is
    // corrected to the one that is actually a prop, and actually worth
    // browsing: the states a live request will not show you on demand.
    const src = file(generate(SPEC, web), 'atlas.scenarios.ts')
    expect(src).toContain("'ListBooksPreview'")
    for (const state of ['Loading', 'Error', 'Empty']) {
      expect(src).toContain(`name: '${state}'`)
    }
    expect(src).not.toContain('ListBooksData')
  })

  it('honours the plugin selection', () => {
    // `index.ts` is the barrel and rides along with any selection -- one
    // import site is useful whether you asked for schemas or the whole client.
    //
    // `api-surface.json` also rides along, and unconditionally: it is not an
    // emitter's output but the record of what the run promised, and a
    // schemas-only run still changed the contract if a model moved. The
    // invariant this spec protects — no CLIENT CODE you did not ask for — is
    // asserted below on the code files.
    const only = generate(SPEC, resolveConfig({ input: 'x', plugins: ['schemas'] }))
    expect(only.files.map((f) => f.path)).toContain('api-surface.json')
    expect(only.files.filter((f) => f.path.endsWith('.ts')).map((f) => f.path)).toEqual([
      'schemas.ts',
      'index.ts',
    ])
  })

  it('the native LAYOUT follows the plugin selection too', () => {
    // The native modules are the client/queries emitters' native layout, not a
    // separate output. Emitting them unconditionally meant asking for schemas
    // only still produced a client and a data component.
    const schemasOnly = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform', plugins: ['schemas'] }))
    // The invariant is "no native module", which is what this asserts directly
    // rather than through an exact file list that a non-emitter output moves.
    expect(schemasOnly.files.filter((f) => f.path.endsWith('.native.tsx'))).toEqual([])
    expect(schemasOnly.files.filter((f) => f.path.endsWith('.ts')).map((f) => f.path)).toEqual([
      'schemas.ts',
      'index.ts',
    ])

    const withClient = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform', plugins: ['client'] }))
    expect(withClient.files.some((f) => f.path.endsWith('.native.tsx'))).toBe(true)
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

describe('SourceFile default imports', () => {
  it('merges a default and named bindings into ONE statement', async () => {
    const { SourceFile } = await import('../emit/writer')
    const f = new SourceFile('x.ts')
    f.importDefault('axios', 'axios')
    f.import('axios', 'isAxiosError')
    f.line('export const x = 1')
    // Two statements for one specifier is legal and reads as an oversight.
    expect(f.build('').contents).toContain("import axios, { isAxiosError } from 'axios'")
  })

  it('REFUSES two different local names for one default binding', async () => {
    const { SourceFile } = await import('../emit/writer')
    const f = new SourceFile('x.ts')
    f.importDefault('axios', 'axios')
    // Silently keeping the first would emit a file referencing a name that was
    // never bound — a generator bug that surfaces as the consumer's compile
    // error, far from here.
    expect(() => f.importDefault('axios', 'http')).toThrow(/already has a default import/)
  })
})
