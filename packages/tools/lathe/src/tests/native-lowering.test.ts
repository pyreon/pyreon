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
    //
    // Cut at the FIRST data component rather than a named one. The emit now
    // produces several (one per non-mutating operation), and a rule anchored
    // to one name silently stopped testing its own premise the moment a
    // second component was emitted BEFORE it: the file still contained an
    // in-body query, so `PyreonQuery<` was still present and the lock could
    // no longer fail for the reason it exists.
    const firstComponent = nativeModule!.contents.search(/export function \w+Data\(/)
    expect(firstComponent, 'no data component to move out of the body').toBeGreaterThan(-1)
    const broken =
      nativeModule!.contents.slice(0, firstComponent) +
      `export function useListBooks() {\n  return useQuery<Book[]>(() => listBooks.query())\n}\n`
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

/**
 * A path parameter is the ordinary case, not an edge case: `GET /books/{id}`
 * is what an API screen actually calls. Lathe used to SKIP emitting a native
 * data component for those operations entirely, because PMTC resolved the URL
 * to a compile-time constant and a prop read has no compile-time value — so
 * the generated native surface covered collection endpoints only.
 *
 * PMTC now lowers a runtime `:param` through `useQuery` (its harness is keyed
 * on the resulting URL, so it re-fetches when the prop changes). These specs
 * assert the emit takes that shape AND that the real compiler lowers it —
 * asserting only the emitted text would pass against a shape that compiles to
 * a web fetch on both targets.
 */
describe('a path-param operation emits a prop-driven native component', () => {
  const cfg = resolveConfig({
    input: 'spec.yaml',
    output: 'gen',
    target: 'multiplatform',
    plugins: ['types', 'schemas', 'client', 'queries'],
  } as never)
  const files = generate(SPEC, cfg)
  const native = files.files.find((f) => f.path.endsWith('.native.tsx'))

  it('emits the component at all — it used to be skipped', () => {
    expect(native?.contents).toContain('export function GetBookData(')
  })

  it('takes the path param as a PROP, typed from the spec', () => {
    expect(native?.contents).toContain('props: { id: string; children:')
  })

  it('reads `props.id` rather than destructuring it', () => {
    // A destructure reads the getter once and freezes the value, so the query
    // would never re-fetch for a new id — the emit would look correct and the
    // screen would show the first record forever.
    expect(native?.contents).toContain('getBook.query({ params: { id: props.id } })')
    expect(native?.contents).not.toMatch(/const\s*\{\s*id\s*\}\s*=\s*props/)
  })

  it('lowers to native on BOTH targets, with no warning', () => {
    const report = verifyNative(files.files, transform)
    const forNative = report.files.filter((f) => f.path.endsWith('.native.tsx'))
    expect(forNative.length).toBeGreaterThan(0)
    for (const f of forNative) {
      expect(f.verdict, `${f.path} [${f.target}] warned: ${f.warnings.join(' | ')}`).toBe('lowers')
      expect(f.leaked).toEqual([])
    }
    expect(worstVerdict(report)).toBe('lowers')
  })
})

describe('`format: uri` means the same thing on device as on the web', () => {
  // The web emits `.url({ protocol })` (any RFC 3986 scheme). The native module
  // used to emit a bare `.url()`, which PMTC now lowers as `@pyreon/validate`
  // does -- http(s) only -- so a device would reject a `git:` URI the web
  // accepts. Both paths spell it the same way, and the protocol form lowers.
  const spec = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /repos:
    get:
      operationId: getRepo
      tags: [r]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Repo' } } } } }
components:
  schemas:
    Repo:
      type: object
      required: [clone]
      properties:
        clone: { type: string, format: uri }
`
  const mod = generate(spec, resolveConfig({ input: 'x', target: 'multiplatform' })).files.find(
    (f) => f.path === 'r.native.tsx',
  )

  it('emits the protocol form on the native path too', () => {
    expect(mod?.contents).toContain('.url({ protocol: /^[A-Za-z][A-Za-z0-9+.-]*$/ })')
  })

  it('lowers to an any-scheme URI check on both targets, with no url warning', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(mod?.contents ?? '', { target })
      expect(r.warnings.filter((w) => /url/i.test(w))).toEqual([])
      expect(r.code).toContain('[A-Za-z][A-Za-z0-9+.-]*:')
    }
  })
})

/**
 * A read with no typed response body -- the Petstore 3 `logoutUser` shape.
 *
 * It used to get a data component like every other GET, as
 * `useQuery<unknown>(...)`, which PMTC lowers to a decode of `Any`: not
 * compilable on Swift. One content-less GET turned its whole tag module BROKEN.
 * Nothing renders from an absent body, so the component is left out and the
 * reach analysis says why.
 */
describe('a content-less GET does not break its native module', () => {
  const CONTENTLESS = `
openapi: 3.0.3
info: { title: Session, version: '1' }
servers: [{ url: 'https://s.test/v1' }]
paths:
  /me:
    get:
      operationId: getMe
      tags: [session]
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Me' } } }
  /logout:
    get:
      operationId: logout
      tags: [session]
      responses: { default: { description: done } }
components:
  schemas:
    Me: { type: object, required: [id], properties: { id: { type: string } } }
`
  const out = generate(CONTENTLESS, resolveConfig({ input: 'x', target: 'multiplatform' }))
  const mod = out.files.find((f) => f.path === 'session.native.tsx')

  it('still declares the endpoint, but emits no data component for it', () => {
    expect(mod?.contents).toContain('export const logout = api.endpoint(')
    expect(mod?.contents).toContain('export function GetMeData(')
    expect(mod?.contents).not.toContain('LogoutData(')
  })

  it('reports the operation web-only, with the reason, rather than lowering it', () => {
    expect(out.reach.get('logout')?.reach).toBe('web-only')
    expect(out.reach.get('logout')?.reason).toContain('no typed JSON response')
    expect(out.reach.get('getMe')?.reach).toBe('web+native')
  })

  it('the real compiler lowers the module on both targets', () => {
    const report = verifyNative(out.files, transform)
    expect(report.files.length).toBe(2)
    for (const f of report.files) {
      expect(f.verdict, `${f.target}: ${f.warnings.join(' | ')}`).toBe('lowers')
    }
  })
})

describe('non-string enums on the native path', () => {
  // The native target narrows an enum to ONE scalar schema: PMTC has no literal
  // union, so a numeric or boolean enum must become `number()` / `boolean()`
  // -- and the TS type must agree, or the emitted module does not typecheck.
  const spec = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test/v1' }]
paths:
  /k:
    get:
      operationId: getK
      tags: [k]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/K' } } } } }
components:
  schemas:
    K:
      type: object
      required: [level, on]
      properties:
        level: { type: integer, enum: [1, 2, 3] }
        on: { type: boolean, enum: [true, false] }
`
  const mod = generate(spec, resolveConfig({ input: 'x', target: 'multiplatform' })).files.find(
    (f) => f.path === 'k.native.tsx',
  )

  it('narrows the schema and the type to the scalar', () => {
    expect(mod?.contents).toMatch(/level: s\.number\(\)/)
    expect(mod?.contents).toMatch(/on: s\.boolean\(\)/)
    expect(mod?.contents).toMatch(/level: number/)
    expect(mod?.contents).toMatch(/on: boolean/)
  })

  for (const target of ['swift', 'kotlin'] as const) {
    it(`lowers to ${target} with no warnings`, () => {
      expect(transform(mod!.contents, { target }).warnings).toEqual([])
    })
  }
})
