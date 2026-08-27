/**
 * OpenAPI 3.x -> Lathe IR.
 *
 * The job here is LOSS MANAGEMENT. A spec can express far more than any target
 * can represent, and the point of doing that reduction once, at this boundary,
 * is that every loss gets a `code` and a location instead of being rediscovered
 * (differently) by each emitter. `notes` is the product of this module as much
 * as `models` and `operations` are.
 */

import type {
  HttpMethod,
  IrDocument,
  IrField,
  IrModel,
  IrNote,
  IrOperation,
  IrParam,
  IrType,
  StringFormat,
} from '../core/ir'
import { ident, operationIdFrom, typeIdent, uniquifier } from '../core/naming'
import { parseSpecText } from './yaml'

type Json = Record<string, unknown>

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const FORMATS: readonly StringFormat[] = ['email', 'uri', 'uuid', 'date', 'date-time', 'binary']

export interface LoadResult {
  doc: IrDocument
}

/** Parse a spec document (JSON or YAML text) into the IR. */
export function loadOpenApi(source: string): LoadResult {
  const raw = parseSpecText(source)
  if (raw === null || typeof raw !== 'object') {
    throw new Error('[Pyreon] lathe: spec did not parse to an object')
  }
  return { doc: convert(raw as Json) }
}

function convert(spec: Json): IrDocument {
  const notes: IrNote[] = []
  const ctx: Ctx = { spec, notes, modelNames: new Map(), resolving: new Set() }

  const info = obj(spec.info) ?? {}
  const servers = arr(spec.servers)
  const firstServer = servers.length > 0 ? obj(servers[0]) : undefined
  const baseUrl = typeof firstServer?.url === 'string' ? stripTrailingSlash(firstServer.url) : ''
  if (baseUrl === '') {
    notes.push({
      code: 'no-servers',
      at: '#/servers',
      message:
        'spec declares no servers[0].url — generated client uses a relative baseUrl, which cannot lower to native (PMTC needs a literal absolute URL). Pass `baseUrl` in the config to override.',
    })
  }

  // Models first: operations reference them by name, and naming must be
  // assigned in a stable order so regeneration is byte-identical.
  const schemas = obj(obj(spec.components)?.schemas) ?? {}
  const uniq = uniquifier()
  for (const key of Object.keys(schemas).sort()) {
    ctx.modelNames.set(key, uniq(typeIdent(key)))
  }
  const models: IrModel[] = []
  for (const key of Object.keys(schemas).sort()) {
    const schema = obj(schemas[key])
    if (!schema) continue
    models.push({
      name: ctx.modelNames.get(key) as string,
      type: toType(schema, `#/components/schemas/${key}`, ctx),
      doc: str(schema.description) ?? str(schema.title),
    })
  }

  const operations = collectOperations(spec, ctx)

  return {
    title: str(info.title) ?? 'API',
    version: str(info.version) ?? '0.0.0',
    baseUrl,
    models,
    operations,
    notes,
  }
}

interface Ctx {
  spec: Json
  notes: IrNote[]
  /** Spec schema key -> generated model name. */
  modelNames: Map<string, string>
  /** Guards `$ref` cycles while resolving inline. */
  resolving: Set<string>
}

function collectOperations(spec: Json, ctx: Ctx): IrOperation[] {
  const paths = obj(spec.paths) ?? {}
  const ops: IrOperation[] = []
  const uniq = uniquifier()
  for (const rawPath of Object.keys(paths).sort()) {
    const item = obj(paths[rawPath])
    if (!item) continue
    // Path-level parameters apply to every operation under the path.
    const shared = arr(item.parameters)
    for (const method of METHODS) {
      const op = obj(item[method.toLowerCase()])
      if (!op) continue
      const at = `#/paths/${rawPath}/${method.toLowerCase()}`
      let id = str(op.operationId)
      if (!id) {
        id = operationIdFrom(method, rawPath)
        ctx.notes.push({
          code: 'missing-operation-id',
          at,
          message: `operation has no operationId — derived \`${id}\` from method + path. Add one to the spec to make the generated name stable against path edits.`,
        })
      }
      const params = [...shared, ...arr(op.parameters)]
      const pathParams: IrParam[] = []
      const queryParams: IrParam[] = []
      for (const p of params) {
        const po = obj(deref(p, at, ctx))
        if (!po) continue
        const name = str(po.name)
        if (!name) continue
        const target = po.in === 'path' ? pathParams : po.in === 'query' ? queryParams : null
        if (!target) continue
        target.push({
          // A PATH parameter's name must match the `:placeholder` the path was
          // rewritten to, so it takes the same `ident()` normalization -- they
          // disagreed for any name that was not already an identifier, and the
          // raw form reached a TYPE position where a `}` breaks out of the
          // generated signature. A QUERY parameter's name is a WIRE name
          // (`?page=2`), so it stays verbatim and is quoted at emit instead.
          name: po.in === 'path' ? ident(name) : name,
          type: toType(obj(po.schema) ?? { type: 'string' }, `${at}/parameters/${name}`, ctx),
          // A path parameter is always required, whatever the spec claims.
          required: po.in === 'path' ? true : po.required === true,
          doc: str(po.description),
        })
      }
      ops.push({
        id: uniq(ident(id)),
        method,
        path: toPyreonPath(rawPath),
        tag: str(arr(op.tags)[0]) ?? 'default',
        summary: str(op.summary) ?? str(op.description),
        pathParams,
        queryParams,
        body: bodyType(op, at, ctx),
        response: responseType(op, at, ctx),
      })
    }
  }
  return ops
}

/** `/users/{id}` -> `/users/:id`, the shape `@pyreon/http` declares. */
function toPyreonPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_m, name: string) => `:${ident(name)}`)
}

function bodyType(op: Json, at: string, ctx: Ctx): IrType | undefined {
  const rb = obj(deref(op.requestBody, at, ctx))
  if (!rb) return undefined
  const content = obj(rb.content)
  if (!content) return undefined
  return pickContent(content, `${at}/requestBody`, ctx)
}

function responseType(op: Json, at: string, ctx: Ctx): IrType | undefined {
  const responses = obj(op.responses)
  if (!responses) return undefined
  // First 2xx wins, numerically, so `200` beats `201` deterministically.
  const ok = Object.keys(responses)
    .filter((k) => /^2\d\d$/.test(k))
    .sort()[0]
  const chosen = ok ?? (responses.default !== undefined ? 'default' : undefined)
  if (!chosen) return undefined
  const res = obj(deref(responses[chosen], at, ctx))
  const content = obj(res?.content)
  if (!content) return undefined
  return pickContent(content, `${at}/responses/${chosen}`, ctx)
}

/**
 * Choose a media type.
 *
 * JSON wins when present. When it is not, the choice is REPORTED — a generated
 * client that silently decodes `text/csv` as JSON fails at runtime, far from
 * the spec line that caused it.
 */
function pickContent(content: Json, at: string, ctx: Ctx): IrType | undefined {
  const keys = Object.keys(content)
  const json = keys.find((k) => k === 'application/json' || k.endsWith('+json'))
  if (!json) {
    const first = keys[0]
    if (!first) return undefined
    ctx.notes.push({
      code: 'multiple-content-types',
      at,
      message: `no JSON media type (found ${keys.join(', ')}) — using \`${first}\` and typing it as unknown.`,
    })
    return { kind: 'unknown', reason: `media type ${first}` }
  }
  if (keys.length > 1) {
    ctx.notes.push({
      code: 'multiple-content-types',
      at,
      message: `${keys.length} media types (${keys.join(', ')}) — generated code uses ${json}.`,
    })
  }
  const schema = obj(obj(content[json])?.schema)
  return schema ? toType(schema, at, ctx) : { kind: 'unknown', reason: 'no schema' }
}

/** Resolve a local `$ref`. Remote refs are refused rather than fetched. */
function deref(node: unknown, at: string, ctx: Ctx): unknown {
  const o = obj(node)
  if (!o) return node
  const ref = str(o.$ref)
  if (!ref) return node
  if (!ref.startsWith('#/')) {
    ctx.notes.push({
      code: 'unsupported-ref',
      at,
      message: `remote $ref \`${ref}\` is not resolved — Lathe reads one document and never fetches. Bundle the spec first.`,
    })
    return { }
  }
  let cur: unknown = ctx.spec
  for (const seg of ref.slice(2).split('/')) {
    const key = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    cur = obj(cur)?.[key]
    if (cur === undefined) {
      ctx.notes.push({ code: 'unsupported-ref', at, message: `$ref \`${ref}\` does not resolve.` })
      return {}
    }
  }
  return cur
}

/** Convert a JSON-Schema-ish node to an IR type. */
function toType(schema: Json, at: string, ctx: Ctx): IrType {
  const ref = str(schema.$ref)
  if (ref) {
    const key = ref.startsWith('#/components/schemas/') ? ref.slice('#/components/schemas/'.length) : undefined
    const name = key ? ctx.modelNames.get(key) : undefined
    if (name) return { kind: 'ref', name }
    const resolved = deref(schema, at, ctx)
    const ro = obj(resolved)
    return ro ? toType(ro, at, ctx) : { kind: 'unknown', reason: `unresolved $ref ${ref}` }
  }

  // allOf: merge object members. This is how specs express inheritance, and
  // flattening is the only representation the targets have.
  const allOf = arr(schema.allOf)
  if (allOf.length > 0) return mergeAllOf(allOf, schema, at, ctx)

  const anyOf = arr(schema.oneOf).length > 0 ? arr(schema.oneOf) : arr(schema.anyOf)
  if (anyOf.length > 0) {
    const discriminator = str(obj(schema.discriminator)?.propertyName)
    return {
      kind: 'union',
      options: anyOf.map((o, i) => toType(obj(o) ?? {}, `${at}/oneOf/${i}`, ctx)),
      discriminator: discriminator ? ident(discriminator) : undefined,
    }
  }

  // OpenAPI 3.1 allows `type: [string, null]`.
  const rawType = schema.type
  const types = Array.isArray(rawType) ? rawType.map(String) : rawType === undefined ? [] : [String(rawType)]
  const nonNull = types.filter((t) => t !== 'null')
  const t = nonNull[0]

  if (Array.isArray(schema.enum) && (t === 'string' || t === undefined)) {
    const values = schema.enum.filter((v): v is string => typeof v === 'string')
    if (values.length > 0) return { kind: 'string', enum: values }
  }

  switch (t) {
    case 'string': {
      const fmt = str(schema.format)
      const format = fmt && (FORMATS as readonly string[]).includes(fmt) ? (fmt as StringFormat) : undefined
      return format ? { kind: 'string', format } : { kind: 'string' }
    }
    case 'integer':
      return { kind: 'number', integer: true }
    case 'number':
      return { kind: 'number', integer: false }
    case 'boolean':
      return { kind: 'boolean' }
    case 'null':
      return { kind: 'null' }
    case 'array': {
      const items = obj(schema.items)
      return { kind: 'array', items: items ? toType(items, `${at}/items`, ctx) : { kind: 'unknown', reason: 'array without items' } }
    }
    case 'object':
    case undefined: {
      const props = obj(schema.properties)
      if (!props) {
        // A bare `{}` / `type: object` with no properties is a free-form map.
        const ap = schema.additionalProperties
        if (ap && typeof ap === 'object') {
          return { kind: 'object', fields: [], additional: toType(ap as Json, `${at}/additionalProperties`, ctx) }
        }
        if (t === 'object' || ap === true) return { kind: 'object', fields: [], additional: { kind: 'unknown', reason: 'free-form object' } }
        return { kind: 'unknown', reason: 'schema declares no type' }
      }
      return { kind: 'object', fields: fieldsOf(schema, props, at, ctx), additional: undefined }
    }
    default:
      ctx.notes.push({ code: 'unsupported-schema', at, message: `unsupported type \`${String(t)}\` — typed as unknown.` })
      return { kind: 'unknown', reason: `type ${String(t)}` }
  }
}

function fieldsOf(schema: Json, props: Json, at: string, ctx: Ctx): IrField[] {
  const required = new Set(arr(schema.required).filter((r): r is string => typeof r === 'string'))
  const out: IrField[] = []
  for (const key of Object.keys(props)) {
    const p = obj(props[key])
    if (!p) continue
    const nullable =
      p.nullable === true ||
      (Array.isArray(p.type) && (p.type as unknown[]).map(String).includes('null'))
    out.push({
      name: key,
      type: toType(p, `${at}/properties/${key}`, ctx),
      required: required.has(key),
      nullable,
      doc: str(p.description) ?? str(p.title),
      min: num(p.minLength) ?? num(p.minimum),
      max: num(p.maxLength) ?? num(p.maximum),
      pattern: str(p.pattern),
      example: p.example,
    })
  }
  return out
}

function mergeAllOf(parts: unknown[], self: Json, at: string, ctx: Ctx): IrType {
  const fields: IrField[] = []
  const seen = new Set<string>()
  let sawNonObject = false
  const push = (t: IrType): void => {
    if (t.kind === 'object') {
      for (const f of t.fields) {
        if (seen.has(f.name)) continue
        seen.add(f.name)
        fields.push(f)
      }
      return
    }
    if (t.kind === 'ref') {
      // Resolve the referenced model so its fields flatten in. `allOf` with a
      // $ref is the standard inheritance idiom and must not degrade to unknown.
      const key = [...ctx.modelNames.entries()].find(([, v]) => v === t.name)?.[0]
      const target = key ? obj(obj(obj(ctx.spec.components)?.schemas)?.[key]) : undefined
      if (target) { push(toType(target, at, ctx)); return }
    }
    sawNonObject = true
  }
  for (let i = 0; i < parts.length; i++) push(toType(obj(parts[i]) ?? {}, `${at}/allOf/${i}`, ctx))
  // Properties declared alongside allOf merge in too.
  const own = obj(self.properties)
  if (own) for (const f of fieldsOf(self, own, at, ctx)) { if (!seen.has(f.name)) { seen.add(f.name); fields.push(f) } }
  if (sawNonObject && fields.length === 0) {
    ctx.notes.push({ code: 'unsupported-schema', at, message: 'allOf of non-object schemas — typed as unknown.' })
    return { kind: 'unknown', reason: 'allOf of non-objects' }
  }
  return { kind: 'object', fields, additional: undefined }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}
function obj(v: unknown): Json | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
