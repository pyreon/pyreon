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
import type { IrDocument, IrField, IrNumberType, IrOperation, IrStringType, IrType } from '../core/ir'
import { byTag, CLIENT_FILE, endpointSpec, tagFile } from './client'
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
    f.import('@pyreon/http/mock', 'mock')
    f.importType('@pyreon/http/mock', 'MockRoute')
  }
  f.import(relativeSpecifier('mocks.ts', CLIENT_FILE), 'setDevTransport')
  if (!pyreon) {
    f.line()
    f.doc('One fixture route. Matched on method plus the DECLARED path.')
    f.line('export interface MockRoute {')
    f.line('  method: string')
    f.line('  /** The DECLARED path, placeholders intact. Matched exactly. */')
    f.line('  path: string')
    f.line('  /** Absent for a no-content operation, matching a real 204. */')
    f.line('  json?: unknown')
    f.line('}')
  }

  f.line()
  f.doc(
    `Deterministic fixtures for ${doc.title}.`,
    '',
    'Call `installMocks()` (below) to run the generated client with no server.',
    'Values are derived from the spec — same input, same bytes, every run — so',
    'snapshots stay stable.',
  )
  f.line('export const routes: MockRoute[] = [')
  for (const [, ops] of byTag(doc)) {
    for (const op of ops) {
      f.line(`  {`)
      f.line(`    method: ${q(op.method)},`)
      f.line(`    path: ${mockPath(op, pyreon)},`)
      // `json` is OMITTED for an operation with no response body.
      //
      // Emitting `json: null` made the mock answer 200 with the body `null`
      // while the real server answers 204 with nothing, so an app tested
      // against the fixtures saw `null` where production gives `undefined`.
      // `MockRoute` documents the absent-body case as a real 204, and the
      // adapter installer answers `{ json: undefined }` — both now agree with
      // the server.
      if (op.response) {
        f.line(`    json: ${indentAfterFirst(fixture(op.response, doc, 0), 4)},`)
      }
      f.line(`  },`)
    }
  }
  f.line(']')

  if (pyreon) {
    f.line()
    f.doc('Ready-made middleware over the routes above.')
    f.line('export const mockRoutes = mock(routes)')
  }

  f.line()
  f.doc(
    'Serve every request from the fixtures above, with no server.',
    '',
    'Endpoints bind to the client at declaration time, so middleware cannot be',
    'added to `createHttp` after the fact -- this goes through the transport',
    'seam the client reserves. Call it from a test setup or a workbench',
    'wrapper; pass nothing to `setDevTransport` to go back to the network.',
  )
  f.line('export function installMocks(): void {')
  if (pyreon) {
    f.line('  setDevTransport(mockRoutes)')
  } else {
    f.line('  setDevTransport((req) => {')
    f.line('    for (const route of routes) {')
    f.line('      if (route.method === req.method && route.path === req.path) return { json: route.json }')
    f.line('    }')
    // `null` means NOT HANDLED. A matched route answers with an envelope, so
    // a fixture that is itself `null` (a no-content response) stays
    // distinguishable from no route at all — without the envelope the two
    // collapse and a 204 fixture silently issues a real request.
    f.line('    return null')
    f.line('  })')
  }
  f.line('}')
  return f
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
function mockPath(op: IrOperation, pyreon: boolean): string {
  // The generated adapters match on the DECLARED path, host included when
  // the operation has its own server.
  if (!pyreon) return q(`${op.baseUrl ?? ''}${op.path}`)
  if (op.pathParams.length === 0) return q(op.path)
  const source = op.path
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/?#]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('\\/')
  return regexLiteral(`${source}(?:\\?|$)`)
}

/** A deterministic sample value for a type. */
function fixture(
  type: IrType,
  doc: IrDocument,
  depth: number,
  field?: IrField,
  index = 0,
): unknown {
  if (field?.example !== undefined) return field.example
  if (depth > 6) return null
  switch (type.kind) {
    case 'enum':
      return type.values[0]
    case 'nullable':
      // The non-null shape: a fixture of `null` renders nothing, so it tests
      // nothing. A nullable OPTIONAL field is omitted below instead.
      return fixture(type.inner, doc, depth, field, index)
    case 'string': {
      switch (type.format) {
        case 'email':
          return 'user@example.com'
        case 'uri':
          return 'https://example.com'
        case 'uuid':
          return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
        case 'date':
          return '2026-01-01'
        case 'date-time':
          return '2026-01-01T00:00:00Z'
        default:
          return fitLength(field ? `sample ${field.name}${index > 0 ? ` ${index}` : ''}` : 'sample', type)
      }
    }
    case 'number':
      return numberFixture(type, index)
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

/** Pad or cut a sample string into `[minLength, maxLength]`. */
function fitLength(value: string, type: IrStringType): string {
  let out = value
  if (type.maxLength !== undefined) out = out.slice(0, type.maxLength)
  if (type.minLength !== undefined && out.length < type.minLength) out = out.padEnd(type.minLength, 'x')
  return out
}

/** A sample number inside the spec's bounds, distinct per index. */
function numberFixture(type: IrNumberType, index: number): number {
  const step = type.multipleOf ?? (type.integer ? 1 : 0.5)
  const lo = type.minimum ?? (type.exclusiveMinimum !== undefined ? type.exclusiveMinimum + step : undefined)
  const hi = type.maximum ?? (type.exclusiveMaximum !== undefined ? type.exclusiveMaximum - step : undefined)
  const base = lo !== undefined ? Math.ceil(lo / step) * step : type.integer ? 1 : 1.5
  const value = base + Math.max(0, index - 1) * step
  const picked = hi !== undefined && value > hi ? (lo !== undefined ? Math.ceil(lo / step) * step : Math.floor(hi / step) * step) : value
  return type.integer ? Math.round(picked) : roundToStep(picked, step)
}

/** `3 * 0.1` is `0.30000000000000004`; a fixture should read `0.3`. */
function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(value.toFixed(Math.min(decimals + 2, 20)))
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
