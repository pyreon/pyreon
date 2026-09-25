/**
 * Mock emission.
 *
 * Kubb reaches for MSW here. Pyreon does not need to: `@pyreon/http` ships
 * `createMock` / `mock()` as middleware on the client itself, so a generated
 * mock is an array of routes rather than a service worker, works identically
 * in node and the browser, and needs no separate install or setup step.
 *
 * Fixture values are derived from the spec's own `example` where it has one,
 * and from the field's type and format where it does not. Derivation is
 * DETERMINISTIC — no randomness — because a mock that changes shape between
 * runs turns every snapshot test into a flake.
 */

import { modelIndex } from '../core/graph'
import type { IrDocument, IrField, IrOperation, IrType } from '../core/ir'
import { responseKindOf } from '../core/media'
import { byCodeUnit } from '../core/order'
import { conforms, sampleNumber, sampleString } from '../core/sample'
import { CLIENT_FILE, endpointSpec, tagFile } from './client'
import type { ClientName } from './client-runtime'
import { jsonLiteral, q, regexLiteral, relativeSpecifier, SourceFile } from './writer'

/**
 * Emit `mocks.ts` — a deterministic route table plus the installer.
 *
 * The TABLE is identical for every client; only the installer differs, because
 * `@pyreon/http` already ships a `mock()` middleware and the generated
 * adapters answer through their own `DevTransport` seam instead.
 *
 * Route matching for an adapter is EXACT string equality on the declared path
 * (`/books/:id`), not a pattern match against a resolved URL — the seam hands
 * the transport the declared path alongside the resolved one precisely so this
 * needs no regex and can never mis-match a route whose parameter value happens
 * to contain a slash.
 */
export function emitMocks(doc: IrDocument, client: ClientName = 'pyreon'): SourceFile {
  const f = new SourceFile('mocks.ts')
  const pyreon = client === 'pyreon'
  if (pyreon) {
    f.import('@pyreon/http/mock', 'createMock')
    f.importType('@pyreon/http/mock', 'MockRoute')
    f.importType('@pyreon/http', 'HttpMiddleware')
    f.import(relativeSpecifier('mocks.ts', CLIENT_FILE), 'apiBaseUrl', 'setDevTransport')
  } else {
    f.import(relativeSpecifier('mocks.ts', CLIENT_FILE), 'apiBaseUrl', 'setDevTransport')
    f.line()
    f.doc(
      'One fixture route — the same shape as `@pyreon/http/mock`\'s `MockRoute`, so',
      'the table reads the same whichever client was generated.',
    )
    f.line('export interface MockRoute {')
    f.line('  method: string')
    f.line('  /** Tested against the BASE-RELATIVE request URL. */')
    f.line('  path: RegExp')
    f.line('  /** Defaults to 200, or 204 when there is no body. */')
    f.line('  status?: number | undefined')
    f.line('  headers?: Record<string, string> | undefined')
    f.line('  /** Absent for a no-content operation, matching a real 204. */')
    f.line('  json?: unknown')
    f.line('  /** A raw body — for a non-JSON response. */')
    f.line('  body?: string | undefined')
    f.line('  /** Simulated latency, in ms. */')
    f.line('  delay?: number | undefined')
    f.line('  /** Reject with this instead of answering. */')
    f.line('  error?: unknown')
    f.line('}')
  }

  // Most SPECIFIC first (audit D2): the table is searched in order, and a
  // literal segment must win over a parameter in the same position, or
  // `GET /users/me` is answered by the `/users/{id}` fixture.
  const ops = [...doc.operations].sort(bySpecificity)

  f.line()
  f.doc(
    `Deterministic fixtures for ${doc.title}.`,
    '',
    'Install with `installMocks()` to run the generated client with no server.',
    'Values are derived from the spec — constraints first, so every fixture is',
    'one its own schema accepts — and are the same bytes every run, so',
    'snapshots stay stable. Ordered most-specific first.',
  )
  f.line('export const routes: MockRoute[] = [')
  for (const op of ops) {
    f.line(`  {`)
    f.line(`    method: ${q(op.method)},`)
    f.line(`    path: ${mockPath(op)},`)
    // `json` is OMITTED for an operation with no response body.
    //
    // Emitting `json: null` made the mock answer 200 with the body `null`
    // while the real server answers 204 with nothing, so an app tested
    // against the fixtures saw `null` where production gives `undefined`.
    if (op.response) {
      const kind = responseKindOf(op)
      if (kind === 'json') {
        f.line(`    json: ${indentAfterFirst(fixture(op.response, doc, 0), 4)},`)
      } else {
        // A non-JSON response answers with a BODY in its own media type, so
        // the client decodes it exactly as it will decode the server's.
        f.line(`    body: ${q(`sample ${op.id}`)},`)
        f.line(`    headers: { 'content-type': ${q(op.responseMedia ?? 'text/plain')} },`)
      }
    }
    f.line(`  },`)
  }
  f.line(']')

  f.line()
  f.doc('Operation ids that have a mock route — what {@link mockOperation} accepts.')
  f.line(
    `export type MockedOperation = ${ops.length > 0 ? [...ops].sort((a, b) => byCodeUnit(a.id, b.id)).map((o) => q(o.id)).join(' | ') : 'never'}`,
  )
  f.line()
  f.line('const index: Record<MockedOperation, number> = {')
  for (const [i, op] of ops.entries()) f.line(`  ${op.id}: ${i},`)
  f.line('}')
  f.line()
  f.doc(
    'The routes CURRENTLY answering — `routes` with any {@link mockOperation}',
    'overrides applied. The middleware reads this array on every request.',
  )
  f.line('const active: MockRoute[] = [...routes]')
  f.line()
  f.doc(
    "Override one operation's mock — for a test that needs an empty list, an",
    'error, a slow response. Returns a function restoring the generated route;',
    '{@link resetMocks} restores them all. An error `status` with no body answers',
    "with the operation's declared error fixture, when it has one.",
    '',
    '```ts',
    ops[0]
      ? `const restore = mockOperation(${q(ops[0].id)}, ${pyreon ? '{ status: 500, json: { message: \'down\' } }' : '{ error: new Error(\'down\') }'})`
      : "const restore = mockOperation('someOperation', { delay: 200 })",
    'afterEach(resetMocks)',
    '```',
  )
  const withErrors = ops.filter((o) => (o.errors?.length ?? 0) > 0)
  if (withErrors.length > 0) {
    f.doc(
      "Schema-valid ERROR bodies per operation, keyed like the spec's responses",
      "(`404`, `4XX`, `default`). `mockOperation(id, { status: 404 })` answers with",
      "the most specific one, so a test can drive the typed `err.matched` branch.",
    )
    f.line('export const errorFixtures: { [K in MockedOperation]?: Record<string, unknown> } = {')
    for (const op of withErrors) {
      f.line(`  ${op.id}: {`)
      for (const e of op.errors ?? []) f.line(`    ${q(e.status)}: ${indentAfterFirst(fixture(e.type, doc, 0), 4)},`)
      f.line('  },')
    }
    f.line('}')
    f.line()
    f.line('function errorFixture(id: MockedOperation, status: number): { json: unknown } | undefined {')
    f.line('  const table = errorFixtures[id]')
    f.line('  if (!table) return undefined')
    f.line('  const exact = String(status)')
    f.line('  for (const key of [exact, `${exact.charAt(0)}XX`, "default"]) {')
    f.line('    if (key in table) return { json: table[key] }')
    f.line('  }')
    f.line('  return undefined')
    f.line('}')
    f.line()
  }
  f.line(
    `export function mockOperation(id: MockedOperation, override: Partial<Omit<MockRoute, 'method' | 'path'>>): () => void {`,
  )
  f.line('  const i = index[id]')
  f.line('  const generated = routes[i] as MockRoute')
  if (withErrors.length > 0) {
    // An error STATUS with no body of its own answers with the declared error
    // fixture -- never with the SUCCESS body, which no server sends on a 404.
    f.line('  const status = override.status')
    f.line('  const bare = override.json === undefined && override.body === undefined && override.error === undefined')
    f.line('  if (status !== undefined && status >= 400 && bare) {')
    f.line('    active[i] = { method: generated.method, path: generated.path, ...errorFixture(id, status), ...override }')
    f.line('  } else {')
    f.line('    active[i] = { ...generated, ...override }')
    f.line('  }')
  } else {
    f.line('  active[i] = { ...generated, ...override }')
  }
  f.line('  return () => {')
  f.line('    active[i] = generated')
  f.line('  }')
  f.line('}')
  f.line()
  f.doc('Undo every {@link mockOperation} override.')
  f.line('export function resetMocks(): void {')
  f.line('  active.splice(0, active.length, ...routes)')
  f.line('}')

  f.line()
  f.line('function baseRelative(url: string): string {')
  f.line("  const strip = (u: string): string => u.replace(/^[a-z][a-z\\d+\\-.]*:\\/\\/[^/?#]*/i, '')")
  f.line('  const path = strip(url)')
  f.line("  const base = strip(apiBaseUrl()).replace(/\\/+$/, '')")
  f.line("  return base !== '' && path.startsWith(base) ? path.slice(base.length) : path")
  f.line('}')
  if (pyreon) {
    f.line()
    f.doc(
      'The mock middleware.',
      '',
      "Routes are anchored at the client's base URL (audit D2): the request URL",
      'is made relative to `apiBaseUrl()` — read per request, so a',
      '`configureApi({ baseUrl })` switch keeps matching — before the anchored',
      'patterns are tested. An unanchored `/pets/:id` also matched',
      '`/owners/1/pets/2`.',
    )
    f.line('const handle = createMock(active)')
    f.line()
    f.line('export const mockRoutes: HttpMiddleware = (req, next) =>')
    f.line('  handle.middleware({ ...req, url: baseRelative(req.url) }, () => next(req))')
    f.line()
    f.doc('Every request a mock answered, in order (URLs base-relative) — for assertions.')
    f.line('export const mockCalls = handle.calls')
  } else {
    f.line()
    f.doc('Every request a mock answered, in order (URLs base-relative) — for assertions.')
    f.line('export const mockCalls: { method: string; url: string; headers: Record<string, string> }[] = []')
  }

  f.line()
  f.doc(
    'Serve every request from the fixtures above, with no server.',
    '',
    'Goes through the transport slot the client reserves for this, which is',
    'separate from `configureApi({ use })` — installing mocks keeps any auth or',
    'logging middleware. Call it from a test setup or a workbench wrapper; pass',
    '`null` to `setDevTransport` to go back to the network.',
  )
  f.line('export function installMocks(): void {')
  if (pyreon) {
    f.line('  setDevTransport(mockRoutes)')
  } else {
    // BELOW the library (its fetch / adapter), so the library's interceptors
    // and hooks have run on the request this sees — as they have on a real one.
    f.line('  setDevTransport(async (req) => {')
    f.line('    const url = baseRelative(req.url)')
    f.line('    const route = active.find((r) => r.method === req.method && r.path.test(url))')
    // `null` means NOT HANDLED. A matched route answers with an envelope, so
    // a no-content response stays distinguishable from no route at all.
    f.line('    if (!route) return null')
    f.line('    mockCalls.push({ method: req.method, url, headers: req.headers })')
    f.line('    if (route.delay) await new Promise((resolve) => setTimeout(resolve, route.delay))')
    f.line('    if (route.error !== undefined) throw route.error')
    f.line('    return { status: route.status, json: route.json, body: route.body, headers: route.headers }')
    f.line('  })')
  }
  f.line('}')
  return f
}

/**
 * Most specific first: segment by segment, a literal beats a parameter; a
 * longer path beats its own prefix; ties fall back to the method and the id,
 * so the order is total and regeneration byte-identical.
 */
function bySpecificity(a: IrOperation, b: IrOperation): number {
  const sa = a.path.split('/')
  const sb = b.path.split('/')
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const pa = (sa[i] as string).startsWith(':') ? 1 : 0
    const pb = (sb[i] as string).startsWith(':') ? 1 : 0
    if (pa !== pb) return pa - pb
  }
  if (sa.length !== sb.length) return sb.length - sa.length
  return byCodeUnit(`${a.path} ${a.method} ${a.id}`, `${b.path} ${b.method} ${b.id}`)
}

/**
 * The `path` a mock route matches on.
 *
 * The two clients match differently, and one of them needed fixing.
 *
 * `@pyreon/http`'s `MockRoute` takes a string that must be a SUFFIX of the
 * request's path+query, or a RegExp tested against the whole URL. A declared
 * path carrying `:id` is neither — `/books/:id` is not a suffix of
 * `/v1/books/b1` — so every generated mock for a parameterised operation
 * silently matched nothing and fell through to the real network. A RegExp
 * closes it: the parameter becomes one non-empty segment, and the route still
 * ends at a query string or the end of the URL, so `/books/:id` cannot swallow
 * `/books/b1/reviews`.
 *
 * The generated adapters do not have this problem. Their seam is handed the
 * DECLARED path alongside the resolved one, so matching is exact string
 * equality and no pattern is involved.
 *
 * The literal is spelled by `regexLiteral`, not by a template here. This used
 * to escape regex METACHARACTERS and no line terminator, which is a different
 * question from the one the emit asks: a `/` and all four JavaScript line
 * terminators END a literal, so a spec path carrying a newline produced
 * `Unterminated regular expression` and took the whole `mocks.ts` module with
 * it -- under the DEFAULT config, for every operation in the file. The
 * metacharacter escape is still needed and still here; it just is not the
 * lexical half.
 */
function mockPath(op: IrOperation): string {
  // EVERY route is a pattern (audit D1): a plain string matched as a SUFFIX,
  // so `GET /pets?limit=5` missed the `/pets` route and went to the network —
  // any list endpoint with paging arguments escaped the mocks. Anchored at the
  // BASE-RELATIVE path (see `mockRoutes`), ending at a query, a fragment or
  // the end.
  return regexLiteral(`^${pathPattern(op.path)}(?:[?#]|$)`)
}

/**
 * Regex source for a declared path, read with `@pyreon/http`'s OWN grammar:
 * `:name` is one non-empty segment value, `\\:` is a literal colon (audit
 * A11 — a custom verb such as `/v1/:name\\:cancel`). Splitting on `/` and
 * testing `startsWith(':')` treated `:name\\:cancel` as one opaque parameter
 * and escaped `projects\\:list` to a pattern demanding a real backslash.
 */
function pathPattern(path: string): string {
  let out = ''
  let cursor = 0
  for (const m of path.matchAll(/\\:|:([A-Za-z_][A-Za-z0-9_]*)/g)) {
    out += escapeRegex(path.slice(cursor, m.index))
    out += m[1] === undefined ? ':' : '[^/?#]+'
    cursor = m.index + m[0].length
  }
  return out + escapeRegex(path.slice(cursor))
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A deterministic sample value for a type. */
function fixture(
  type: IrType,
  doc: IrDocument,
  depth: number,
  field?: IrField,
  index = 0,
): unknown {
  // A spec `example` is used only when it satisfies the schema it sits in —
  // real specs carry examples that contradict their own types (audit C7).
  if (field?.example !== undefined && conforms(field.example, type, (n) => modelType(doc, n))) {
    return field.example
  }
  if (depth > 6) return null
  switch (type.kind) {
    case 'enum':
      return type.values[0]
    case 'nullable':
      // The non-null shape: a fixture of `null` renders nothing, so it tests
      // nothing. A nullable OPTIONAL field is omitted below instead.
      return fixture(type.inner, doc, depth, field, index)
    case 'string':
      return sampleString(type, field, index)
    case 'number':
      return sampleNumber(type, index)
    case 'boolean':
      return true
    case 'null':
      return null
    case 'unknown':
      return null
    case 'array': {
      // Two elements: one is indistinguishable from a scalar in a UI, three is
      // noise. Two proves the list renders. The INDEX is threaded so the
      // elements differ — identical elements share an id, which collapses a
      // keyed `<For>` to one row and trips the duplicate-key warning, so a
      // fixture that ships them tests the opposite of what it looks like.
      //
      // `minItems` / `maxItems` win over the two: a fixture the generated
      // schema rejects fails every test that uses it, with a validation error
      // about data the test never wrote.
      const n = Math.min(Math.max(2, type.minItems ?? 0), type.maxItems ?? Number.POSITIVE_INFINITY)
      return Array.from({ length: n }, (_, i) => fixture(type.items, doc, depth + 1, undefined, i + 1))
    }
    case 'ref': {
      const model = modelIndex(doc).get(type.name)
      return model ? fixture(model.type, doc, depth + 1, undefined, index) : null
    }
    case 'union':
      return type.options.length > 0 ? fixture(type.options[0] as IrType, doc, depth + 1) : null
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const f of type.fields) {
        // Optional fields are included when they carry an example, and when
        // they are an ENUM — an enum drives a visible variant (a status badge,
        // a filter), so a fixture that omits it renders the one state a UI
        // never has to handle. Other optionals stay out to keep fixtures small.
        const base = f.type.kind === 'nullable' ? f.type.inner : f.type
        const isEnum = base.kind === 'enum'
        if (!f.required && f.example === undefined && !isEnum) continue
        out[f.name] = fixture(f.type, doc, depth + 1, f, index)
      }
      return out
    }
  }
}

function modelType(doc: IrDocument, name: string): IrType | undefined {
  return modelIndex(doc).get(name)?.type
}

/** JSON literal, with every line after the first indented to `pad`. */
function indentAfterFirst(value: unknown, pad: number): string {
  const json = jsonLiteral(value, 2)
  return json
    .split('\n')
    .map((l, i) => (i === 0 ? l : ' '.repeat(pad) + l))
    .join('\n')
}

/** Operation ids that got a fixture — used by the CLI report. */
export function mockedOperations(doc: IrDocument): IrOperation[] {
  return doc.operations.filter((o) => o.response !== undefined)
}

export { tagFile, endpointSpec }
