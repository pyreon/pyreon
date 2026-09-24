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
import type { IrOperation, IrParam, IrType } from '../core/ir'
import { responseKindOf } from '../core/media'
import { propKey } from '../core/naming'
import { tsType } from './schema'

export type ModelTypes = ReadonlyMap<string, IrType>

/** Does the operation SEND anything (params, query or a body)? */
export function hasInput(op: IrOperation): boolean {
  return (
    op.pathParams.length > 0 ||
    op.queryParams.length > 0 ||
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
  if (op.queryParams.length > 0) {
    const inner = op.queryParams
      .map((p) =>
        p.required
          ? `${propKey(p.name)}: ${queryParamTs(p, models)}`
          : `${propKey(p.name)}?: ${queryParamTs(p, models)} | undefined`,
      )
      .join('; ')
    const required = op.queryParams.some((p) => p.required)
    parts.push(required ? `query: { ${inner} }` : `query?: { ${inner} } | undefined`)
  }
  if (op.body) {
    const t = tsType(op.body)
    parts.push(op.bodyRequired ? `json: ${t}` : `json?: ${t} | undefined`)
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
  const kind = resolve(p.type, models).kind
  return kind === 'string' || kind === 'number' ? tsType(p.type) : 'string | number'
}

/**
 * A query parameter's type, when the runtime can SEND it: a scalar, an array
 * of scalars, or a flat object of those (serialized per its `queryStyle`).
 * Anything deeper has no query-string form, so it widens to `string` — the
 * caller serializes it — instead of emitting a type the endpoint rejects.
 */
function queryParamTs(p: IrParam, models: ModelTypes): string {
  return sendable(p.type, models, 0) ? tsType(p.type) : 'string'
}

function sendable(type: IrType, models: ModelTypes, depth: number): boolean {
  const t = resolve(type, models)
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
      return true
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
  const k = resolve(type, models).kind
  return k === 'string' || k === 'number' || k === 'boolean'
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
