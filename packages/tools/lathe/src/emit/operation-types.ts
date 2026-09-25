/**
 * The TYPES of one operation's call site — what a call sends and what it
 * resolves to — shared by the endpoint declarations and the hooks.
 *
 * The endpoint declaration is the single source: it is declared with these
 * types as its generics (`api.endpoint<Spec, V, Input, Kind>(…)`), and every
 * hook DERIVES its types from the endpoint (`Parameters<typeof op>[0]`,
 * `Awaited<ReturnType<typeof op>>`) rather than re-rendering them. That is
 * what closed audit A8: the hook used to spell the response from the spec
 * (`'up' | 'down'`) while the endpoint inferred it from the schema (which a
 * validator may widen to `string`), and the two disagreed.
 */
import type { IrBody, IrOperation, IrParam, IrType } from '../core/ir'
import { responseKindOf } from '../core/media'
import { propKey } from '../core/naming'
import { tsType } from './schema'
import { childTypes } from '../core/walk'

export type ModelTypes = ReadonlyMap<string, IrType>

/** Does the operation SEND anything (params, query or a body)? */
export function hasInput(op: IrOperation): boolean {
  return (
    op.pathParams.length > 0 ||
    op.queryParams.length > 0 ||
    op.headerParams.length > 0 ||
    op.cookieParams.length > 0 ||
    op.body !== undefined ||
    placeholders(op.path).length > 0
  )
}

/** `:name` placeholders in a declared path — `\\:` is a literal colon. */
function placeholders(path: string): string[] {
  return [...path.matchAll(/\\:|:([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((m) => m[1])
    .filter((n): n is string => n !== undefined)
}

/**
 * The input type an endpoint is declared with, rendered as a type literal.
 *
 * `exactOptionalPropertyTypes`-correct (audit E4): an optional member is
 * `?: T | undefined`, so a caller may pass a value that MIGHT be undefined —
 * the natural shape of a signal-derived argument.
 */
export function inputType(op: IrOperation, models: ModelTypes): string {
  const parts: string[] = []
  // A placeholder the spec forgot to declare is still REQUIRED by the path
  // (`@pyreon/http` types `params` from the path literal), so it is typed
  // loosely rather than left out of an input the endpoint would then reject.
  const declared = new Set(op.pathParams.map((p) => p.name))
  const undeclared = placeholders(op.path).filter((n) => !declared.has(n))
  const params = [
    ...op.pathParams.map((p) => `${propKey(p.name)}: ${pathParamTs(p, models)}`),
    ...[...new Set(undeclared)].map((n) => `${n}: string | number`),
  ]
  if (params.length > 0) parts.push(`params: { ${params.join('; ')} }`)
  const record = (name: string, list: readonly IrParam[], ts: (p: IrParam) => string, rest?: string): void => {
    if (list.length === 0) return
    const inner = list
      .map((p) => (p.required ? `${propKey(p.name)}: ${ts(p)}` : `${propKey(p.name)}?: ${ts(p)} | undefined`))
      .join('; ')
    // A header record may carry OTHER keys too (an idempotency key, a trace
    // id); the declared ones are typed, the rest stay open.
    const type = rest ? `{ ${inner} } & ${rest}` : `{ ${inner} }`
    parts.push(list.some((p) => p.required) ? `${name}: ${type}` : `${name}?: (${type}) | undefined`)
  }
  record('query', op.queryParams, (p) => queryParamTs(p, models))
  record('headers', op.headerParams, (p) => headerParamTs(p, models), 'Record<string, string | number | boolean | null | undefined>')
  record('cookies', op.cookieParams, (p) => headerParamTs(p, models))
  if (op.body) {
    const t = bodyTs(op.body, models)
    const arg = bodyArg(op.body)
    parts.push(op.body.required ? `${arg}: ${t}` : `${arg}?: ${t} | undefined`)
  }
  return parts.length > 0 ? `{ ${parts.join('; ')} }` : '{}'
}

/**
 * A path parameter's type. The runtime substitutes `String(value)`, and
 * `@pyreon/http` types the slot `string | number`; a spec declaring anything
 * else (a boolean, an object) cannot be expressed in that slot, so it widens
 * to it rather than emitting a type the endpoint rejects.
 */
function pathParamTs(p: IrParam, models: ModelTypes): string {
  const t = resolve(p.type, models)
  const ok =
    t.kind === 'string' ||
    t.kind === 'number' ||
    (t.kind === 'enum' && t.values.every((v) => typeof v === 'string' || typeof v === 'number'))
  return ok ? tsType(p.type) : 'string | number'
}

/**
 * A query parameter's type, when the runtime can SEND it: a scalar, an array
 * of scalars, or a flat object of those (serialized per its `queryStyle`).
 * Anything deeper has no query-string form, so it widens to `string` — the
 * caller serializes it — instead of emitting a type the endpoint rejects.
 */
function queryParamTs(p: IrParam, models: ModelTypes): string {
  if (!sendable(p.type, models, 0)) return 'string'
  // An object MODEL is an `interface`, which has no implicit index signature
  // and so is not a query-object value; its shape is inlined instead.
  const t = resolve(p.type, models)
  return t.kind === 'object' && p.type.kind === 'ref' ? tsType(t) : tsType(p.type)
}

/** A header or cookie value: a scalar only — anything else widens to `string`. */
function headerParamTs(p: IrParam, models: ModelTypes): string {
  return scalar(p.type, models) ? tsType(p.type) : 'string'
}

function sendable(type: IrType, models: ModelTypes, depth: number): boolean {
  const t = resolve(type, models)
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'enum':
      return true
    case 'nullable':
      return sendable(t.inner, models, depth)
    case 'array':
      return depth < 2 && scalar(t.items, models)
    case 'union':
      return t.options.every((o) => sendable(o, models, depth))
    case 'object':
      return (
        depth === 0 &&
        t.additional === undefined &&
        t.fields.every((f) => sendable(f.type, models, depth + 1))
      )
    default:
      return false
  }
}

function scalar(type: IrType, models: ModelTypes): boolean {
  const t = resolve(type, models)
  if (t.kind === 'nullable') return scalar(t.inner, models)
  const k = t.kind
  return k === 'string' || k === 'number' || k === 'boolean' || k === 'enum'
}

export function resolve(type: IrType, models: ModelTypes, depth = 0): IrType {
  if (type.kind === 'ref' && depth < 16) {
    const target = models.get(type.name)
    return target ? resolve(target, models, depth + 1) : { kind: 'unknown', reason: 'unresolved' }
  }
  return type
}

/** The `responseType` an endpoint needs, or `undefined` for JSON. */
export function responseTypeOf(op: IrOperation): 'text' | 'blob' | 'stream' | undefined {
  const kind = responseKindOf(op)
  return kind === 'json' ? undefined : kind
}

/**
 * The call-argument NAME a body travels under -- one per wire encoding, the
 * same names `@pyreon/http` and the generated adapter runtime accept.
 */
export function bodyArg(body: IrBody): 'json' | 'form' | 'multipart' | 'body' {
  switch (body.encoding) {
    case 'json':
      return 'json'
    case 'form':
      return 'form'
    case 'multipart':
      return 'multipart'
    case 'text':
    case 'binary':
      return 'body'
  }
}

/** The TS type a caller passes for a body. */
export function bodyTs(body: IrBody, models: ReadonlyMap<string, IrType>): string {
  if (body.encoding === 'text') return 'string'
  if (body.encoding === 'binary') return 'Blob | ArrayBuffer'
  if (body.encoding === 'form' || body.encoding === 'multipart') {
    // An ENCODED body is typed as what the encoder accepts. `@pyreon/http`
    // (and the adapter runtime) take `Record<string, FormValue>` for `form`,
    // whose object branch is an index signature -- and two things in a spec's
    // body do not fit one: a model named by a ref (rendered as an `interface`,
    // which has no implicit index signature) and a value of unknown shape
    // (`unknown`). Stripe's form bodies carry both on almost every mutation,
    // which was 250 type errors in its generated hooks. So refs are inlined
    // and unknown becomes `FormValue` -- the precise shape, spelled so the
    // encoder's type accepts it, with nothing loosened to `any`.
    return tsType(
      encodableBody(body.type, models, new Set()),
      0,
      false,
      false,
      body.encoding === 'multipart',
      'Record<string, FormValue>',
      'FormValue',
    )
  }
  return tsType(expandFileRefs(body.type, models, new Set()), 0, false, false, false)
}

/**
 * A form / multipart body with every model ref INLINED (see `bodyTs`).
 *
 * A ref that closes a cycle cannot be inlined -- there is no finite shape --
 * and a form body cannot express recursion anyway, so it becomes an unknown
 * value, i.e. any `FormValue`.
 */
function encodableBody(type: IrType, models: ReadonlyMap<string, IrType>, expanding: ReadonlySet<string>): IrType {
  switch (type.kind) {
    case 'ref': {
      const target = models.get(type.name)
      if (!target || expanding.has(type.name)) return { kind: 'unknown', reason: 'recursive form value' }
      return encodableBody(target, models, new Set([...expanding, type.name]))
    }
    case 'array':
      return { ...type, items: encodableBody(type.items, models, expanding) }
    case 'nullable':
      return { kind: 'nullable', inner: encodableBody(type.inner, models, expanding) }
    case 'union':
      return { ...type, options: type.options.map((o) => encodableBody(o, models, expanding)) }
    case 'object':
      return {
        ...type,
        fields: type.fields.map((f) => ({ ...f, type: encodableBody(f.type, models, expanding) })),
        additional: type.additional ? encodableBody(type.additional, models, expanding) : undefined,
      }
    default:
      return type
  }
}

/** The body type whose model refs a generated file must import. */
export function bodyRefType(body: IrBody, models: ReadonlyMap<string, IrType>): IrType {
  return body.encoding === 'form' || body.encoding === 'multipart'
    ? encodableBody(body.type, models, new Set())
    : expandFileRefs(body.type, models, new Set())
}

function hasBinary(type: IrType, models: ReadonlyMap<string, IrType>, seen: Set<string>): boolean {
  if (type.kind === 'string') return type.format === 'binary'
  if (type.kind === 'ref') {
    if (seen.has(type.name)) return false
    seen.add(type.name)
    const target = models.get(type.name)
    return target ? hasBinary(target, models, seen) : false
  }
  return childTypes(type).some((c) => hasBinary(c, models, seen))
}

function expandFileRefs(type: IrType, models: ReadonlyMap<string, IrType>, expanding: Set<string>): IrType {
  switch (type.kind) {
    case 'ref': {
      const target = models.get(type.name)
      if (!target || expanding.has(type.name) || !hasBinary(target, models, new Set())) return type
      return expandFileRefs(target, models, new Set([...expanding, type.name]))
    }
    case 'array':
      return { ...type, items: expandFileRefs(type.items, models, expanding) }
    case 'nullable':
      return { kind: 'nullable', inner: expandFileRefs(type.inner, models, expanding) }
    case 'union':
      return { ...type, options: type.options.map((o) => expandFileRefs(o, models, expanding)) }
    case 'object':
      return {
        ...type,
        fields: type.fields.map((f) => ({ ...f, type: expandFileRefs(f.type, models, expanding) })),
        additional: type.additional ? expandFileRefs(type.additional, models, expanding) : undefined,
      }
    default:
      return type
  }
}
