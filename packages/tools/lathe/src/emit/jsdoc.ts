/**
 * The JSDoc on every generated operation, and the sample arguments behind it.
 *
 * Generated code is read in exactly one place: an editor hover. So the block
 * above `getPetById` is written for the person hovering it — the spec's own
 * summary and description, what each parameter means, whether the operation
 * is deprecated, and a call they can copy — rather than for someone
 * maintaining the generator.
 *
 * The example values are the SAME values the mock fixtures return and the
 * Atlas previews request with (`core/sample-value.ts`): a spec `example` when
 * it satisfies the declared type, otherwise a deterministic sample. So the
 * call a reader copies out of a hover is one the mocks answer.
 */

import { modelIndex } from '../core/graph'
import type { IrDocument, IrOperation, IrParam, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import { conforms } from '../core/sample'
import { sampleValue } from '../core/sample-value'
import { bodyArg, hasInput } from './operation-types'

/** Which generated declaration a block documents — it decides the example. */
export type OperationDocKind = 'endpoint' | 'query' | 'mutation' | 'native'

/**
 * Deterministic call arguments for an operation, shaped like the endpoint's
 * first parameter (`{ params, query, headers, cookies, json | form | … }`).
 *
 * Every REQUIRED input is present; an optional one only when the spec gave it
 * an example (a hover showing every optional query parameter is noise).
 * `undefined` when the operation takes no input at all.
 */
export function sampleArgs(op: IrOperation, doc: IrDocument): Record<string, unknown> | undefined {
  if (!hasInput(op)) return undefined
  const out: Record<string, unknown> = {}
  const group = (list: readonly IrParam[], coerce: (v: unknown) => unknown): Record<string, unknown> | undefined => {
    const picked = list.filter((p) => p.required || p.example !== undefined)
    if (picked.length === 0) return undefined
    return Object.fromEntries(picked.map((p) => [p.name, coerce(paramValue(p, doc))]))
  }
  const params = group(op.pathParams, pathValue)
  if (params) out.params = params
  const query = group(op.queryParams, queryValue)
  if (query) out.query = query
  const headers = group(op.headerParams, scalarValue)
  if (headers) out.headers = headers
  const cookies = group(op.cookieParams, scalarValue)
  if (cookies) out.cookies = cookies
  if (op.body && op.body.encoding !== 'binary') {
    const example = op.body.example
    out[bodyArg(op.body)] =
      example !== undefined && conforms(example, op.body.type, (n) => modelIndex(doc).get(n)?.type)
        ? example
        : sampleValue(op.body.type, doc)
  }
  return out
}

/** A parameter's example when it satisfies the type, else a derived sample. */
function paramValue(p: IrParam, doc: IrDocument): unknown {
  if (p.example !== undefined && conforms(p.example, p.type, (n) => modelIndex(doc).get(n)?.type)) return p.example
  return sampleValue(p.type, doc)
}

/** A path segment is `string | number` on the endpoint; anything else is stringified. */
function pathValue(v: unknown): unknown {
  return typeof v === 'string' || typeof v === 'number' ? v : String(v)
}

/** Headers and cookies are scalars. */
function scalarValue(v: unknown): unknown {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v) ? v : JSON.stringify(v)
}

/**
 * A query value the endpoint can send: a scalar, an array of scalars, or a
 * flat object of those. Anything deeper is typed `string` on the endpoint (the
 * caller serializes it), so the sample is serialized the same way.
 */
function queryValue(v: unknown): unknown {
  const scalar = (x: unknown): boolean => x === null || ['string', 'number', 'boolean'].includes(typeof x)
  if (scalar(v)) return v
  if (Array.isArray(v)) return v.every(scalar) ? v : JSON.stringify(v)
  if (typeof v === 'object' && Object.values(v as object).every((x) => scalar(x) || (Array.isArray(x) && x.every(scalar))))
    return v
  return JSON.stringify(v)
}

/**
 * Render a JSON value as a TypeScript object literal — unquoted keys where
 * they are identifiers, single-quoted strings. A value that fits the line
 * stays on it; one that does not is broken across lines, and each of its
 * children gets the same choice, so short arrays inside a large object stay
 * inline.
 */
export function jsLiteral(value: unknown, indent = 0, column = indent): string {
  const flat = flatLiteral(value)
  if (column + flat.length <= 80 || value === null || typeof value !== 'object') return flat
  const inner = ' '.repeat(indent + 2)
  const close = ' '.repeat(indent)
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => `${inner}${jsLiteral(v, indent + 2)},`).join('\n')}\n${close}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return `{\n${entries
    .map(([k, v]) => `${inner}${propKey(k)}: ${jsLiteral(v, indent + 2, indent + 4 + propKey(k).length)},`)
    .join('\n')}\n${close}}`
}

function flatLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(flatLiteral).join(', ')}]`
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length === 0 ? '{}' : `{ ${entries.map(([k, v]) => `${propKey(k)}: ${flatLiteral(v)}`).join(', ')} }`
}

/** A single-quoted string literal, safe inside a comment (the writer escapes `*\/`). */
function quote(s: string): string {
  return `'${s.replace(/[\\']/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
}

/** `` `GET /pets/:id` `` — the wire shape, always part of the block. */
function wireLine(op: IrOperation): string {
  return `\`${op.method} ${op.path}\``
}

/** One bullet per documented input, in call order. */
function parameterLines(op: IrOperation): string[] {
  const lines: string[] = []
  const add = (where: string, list: readonly IrParam[]): void => {
    for (const p of list) {
      const flags = [where, p.required ? undefined : 'optional', p.deprecated ? 'deprecated' : undefined]
        .filter(Boolean)
        .join(', ')
      const doc = p.doc ? ` — ${oneLine(p.doc)}` : ''
      lines.push(`- \`${p.name}\` (${flags})${doc}`)
    }
  }
  add('path', op.pathParams)
  add('query', op.queryParams)
  add('header', op.headerParams)
  add('cookie', op.cookieParams)
  if (op.body) {
    const t = op.body.type
    const named = t.kind === 'ref' ? t.name : t.kind === 'array' && t.items.kind === 'ref' ? `${t.items.name}[]` : undefined
    const what = named ? ` — \`${named}\`` : ''
    lines.push(`- \`${bodyArg(op.body)}\` (body, ${op.body.mediaType}${op.body.required ? '' : ', optional'})${what}`)
  }
  return lines.length > 0 ? ['Parameters:', ...lines] : []
}

/** Collapse whitespace so a multi-paragraph description fits a bullet. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The copyable call for a declaration kind, or `undefined` when there is none. */
function exampleLines(op: IrOperation, doc: IrDocument, kind: OperationDocKind, name: string): string[] | undefined {
  const sample = sampleArgs(op, doc)
  const args = sample === undefined ? undefined : (shortened(sample) as Record<string, unknown>)
  const lit = (column: number): string => (args ? jsLiteral(args, 0, column) : '')
  switch (kind) {
    case 'native':
      return undefined
    case 'endpoint':
      return [`${op.response ? 'const result = ' : ''}await ${name}(${lit(name.length + 22)})`]
    case 'query':
      return args
        ? [`const q = ${name}(() => (${lit(name.length + 18)}))`, 'q.data() // undefined until the request settles']
        : [`const q = ${name}()`, 'q.data() // undefined until the request settles']
    case 'mutation':
      return [`const m = ${name}()`, `m.mutate(${lit(9)})`]
  }
}

/**
 * The sample, with every array of objects cut to its first element: a hover
 * needs the SHAPE of a list, and two full `User` records say nothing a single
 * one does not.
 */
function shortened(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(shortened)
    return items.length > 1 && items.some((v) => v !== null && typeof v === 'object') ? items.slice(0, 1) : items
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shortened(v)]))
  }
  return value
}

/**
 * The parts of an operation's JSDoc block, for `SourceFile.doc`.
 *
 * `usage` is the declaration-specific paragraph (how a hook takes its
 * arguments, what a mutation invalidates); `name` is the declared identifier
 * the example calls.
 */
export function operationDoc(
  op: IrOperation,
  doc: IrDocument,
  kind: OperationDocKind,
  usage: readonly (string | undefined)[] = [],
  name: string = kind === 'endpoint' || kind === 'native' ? op.id : `use${typeIdent(op.id)}`,
): (string | undefined)[] {
  const parts: (string | undefined)[] = [op.summary, '', op.description, '', wireLine(op)]
  const params = parameterLines(op)
  if (params.length > 0) parts.push('', ...params)
  const kept = usage.filter((u): u is string => u !== undefined)
  if (kept.length > 0) parts.push('', ...kept)
  if (op.deprecated) parts.push('', '@deprecated The spec marks this operation deprecated.')
  const example = exampleLines(op, doc, kind, name)
  if (example) parts.push('', '@example', '```ts', ...example, '```')
  if (op.externalDocs) {
    parts.push('', `@see {@link ${op.externalDocs.url}${op.externalDocs.description ? ` ${oneLine(op.externalDocs.description)}` : ''}}`)
  }
  return parts
}

/** A model's block: its description, and `@deprecated` when the spec says so. */
export function modelDoc(model: { doc?: string | undefined; deprecated?: boolean | undefined }): (string | undefined)[] {
  return [model.doc, '', model.deprecated ? '@deprecated The spec marks this schema deprecated.' : undefined]
}

/**
 * The one-line (or short) block above a generated FIELD, or `undefined` when
 * the spec says nothing about it. Rendered inside the interface body.
 */
export function fieldDoc(field: {
  doc?: string | undefined
  deprecated?: boolean | undefined
  example?: unknown
  type?: IrType
}): string[] | undefined {
  const lines: string[] = []
  if (field.doc) lines.push(...field.doc.split('\n'))
  if (field.example !== undefined && isScalar(field.example)) lines.push(`@example ${jsLiteral(field.example)}`)
  if (field.deprecated) lines.push('@deprecated')
  return lines.length > 0 ? lines : undefined
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}
