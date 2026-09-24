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
  IrLiteral,
  IrModel,
  IrNote,
  IrOperation,
  IrParam,
  IrType,
  StringFormat,
} from '../core/ir'
import { assignNames, ident, operationIdFrom, tagFile, typeIdent } from '../core/naming'
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
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[Pyreon] lathe: spec did not parse to an object')
  }
  return { doc: convert(raw as Json) }
}

function convert(spec: Json): IrDocument {
  const notes: IrNote[] = []
  const ctx: Ctx = {
    spec,
    notes,
    modelNames: new Map(),
    modelKeys: new Map(),
    modelTypes: new Map(),
    converting: new Set(),
    refStack: [],
    hoisted: new Map(),
    reentered: new Set(),
    extraModels: [],
    taken: new Set(),
  }

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
  const keys = Object.keys(schemas).sort()
  const assigned = assignNames(keys, typeIdent)
  for (const [i, key] of keys.entries()) {
    const name = assigned[i] as string
    ctx.modelNames.set(key, name)
    ctx.modelKeys.set(name, key)
    ctx.taken.add(name)
  }
  const models: IrModel[] = []
  for (const key of Object.keys(schemas).sort()) {
    const schema = obj(schemas[key])
    if (!schema) continue
    models.push({
      name: ctx.modelNames.get(key) as string,
      type: modelType(key, ctx) ?? { kind: 'unknown', reason: 'cyclic model' },
      doc: str(schema.description) ?? str(schema.title),
    })
  }

  const operations = collectOperations(spec, ctx)
  // Schemas reached through a non-component pointer that turned out to be
  // RECURSIVE were hoisted into named models while converting; they join the
  // document here, after every conversion that could add one.
  models.push(...ctx.extraModels)

  // Post-pass: two union shapes a real spec produces that the emitted schema
  // DSL cannot express. Runs here, after models exist, because deciding either
  // one needs to resolve `$ref`s.
  normalizeUnions(models, operations, ctx)

  return {
    title: str(info.title) ?? 'API',
    version: str(info.version) ?? '0.0.0',
    baseUrl,
    models,
    operations,
    notes,
  }
}

/**
 * Fix up union shapes the schema DSL cannot express.
 *
 * Every rule here exists because a real spec produced output that did not
 * typecheck or -- worse -- threw when the generated module was IMPORTED:
 *
 *  - a `oneOf`/`anyOf` with ONE member. `s.union` requires at least two, and a
 *    one-member union is just that member anyway.
 *  - a `discriminator` the schema library cannot build. `discriminatedUnion`
 *    registers each member's tag values at CONSTRUCTION, so it throws unless
 *    every member is an object whose tag field is REQUIRED and a closed set of
 *    values, and no two members claim the same value. OpenAI's specs use
 *    IMPLICIT discriminators -- the member's tag is a plain `string` and the
 *    values live in `mapping` or in the member's component name -- and GitHub
 *    discriminates over a set that includes an ARRAY. Each of those degrades to
 *    a plain union (which still validates every member correctly) with a note
 *    naming the reason, instead of shipping a module that throws on import.
 */
function normalizeUnions(models: IrModel[], operations: IrOperation[], ctx: Ctx): void {
  const byName = new Map(models.map((m) => [m.name, m]))
  /** The object a union member resolves to, following refs; cycle-safe. */
  const objectOf = (t: IrType): Extract<IrType, { kind: 'object' }> | undefined => {
    const seen = new Set<string>()
    let cur: IrType | undefined = t
    while (cur?.kind === 'ref') {
      if (seen.has(cur.name)) return undefined
      seen.add(cur.name)
      cur = byName.get(cur.name)?.type
    }
    return cur?.kind === 'object' ? cur : undefined
  }

  /** Why `options` cannot be a discriminated union on `key`, or undefined. */
  const whyNotDiscriminated = (options: readonly IrType[], key: string): string | undefined => {
    const claimed = new Set<IrLiteral>()
    for (const o of options) {
      const target = objectOf(o)
      if (!target) return 'has a non-object member'
      const field = target.fields.find((f) => f.name === key)
      if (!field) return `has a member without a \`${key}\` field`
      if (!field.required) return `has a member whose \`${key}\` is optional`
      if (field.type.kind !== 'enum') {
        return `has a member whose \`${key}\` is not a fixed value (an implicit discriminator)`
      }
      for (const v of field.type.values) {
        if (claimed.has(v)) return `has two members claiming the tag \`${String(v)}\``
        claimed.add(v)
      }
    }
    return undefined
  }

  const walk = (type: IrType | undefined, at: string): IrType | undefined => {
    if (!type) return type
    switch (type.kind) {
      case 'array':
        return { ...type, items: walk(type.items, at) as IrType }
      case 'nullable':
        return { kind: 'nullable', inner: walk(type.inner, at) as IrType }
      case 'object':
        return {
          ...type,
          fields: type.fields.map((f) => ({ ...f, type: walk(f.type, at) as IrType })),
          additional: walk(type.additional, at),
        }
      case 'union': {
        let options = type.options.map((o) => walk(o, at) as IrType)
        // `anyOf: [X, {type: 'null'}]` is 3.1's canonical nullable -- and
        // `nullable: true` members are the same thing. Lifting null OUT of the
        // union makes it `X | null` rather than a union the discriminator
        // check would then reject for having a non-object member.
        const hasNull = options.some((o) => o.kind === 'null' || o.kind === 'nullable')
        if (hasNull && options.length > 1) {
          options = options.filter((o) => o.kind !== 'null').map((o) => (o.kind === 'nullable' ? o.inner : o))
          if (options.length === 0) return { kind: 'null' }
          const rest = walk({ ...type, options }, at) as IrType
          return rest.kind === 'null' || rest.kind === 'nullable' ? rest : { kind: 'nullable', inner: rest }
        }
        if (options.length === 1) return options[0] as IrType
        if (options.length === 0) {
          ctx.notes.push({ code: 'unsupported-schema', at, message: 'empty oneOf/anyOf - typed as unknown.' })
          return { kind: 'unknown', reason: 'empty union' }
        }
        if (type.discriminator) {
          const why = whyNotDiscriminated(options, type.discriminator)
          if (why) {
            ctx.notes.push({
              code: 'unsupported-schema',
              at,
              message: `discriminator \`${type.discriminator}\` ${why}, which a discriminated union cannot take - emitted as a plain union instead (every member still validates).`,
            })
            return { kind: 'union', options, discriminator: undefined }
          }
        }
        return { ...type, options }
      }
      default:
        return type
    }
  }

  // A discriminator decision reads OTHER models' fields, so every model is
  // walked first with its own result visible to the next -- the member types a
  // union names are final by the time the union is checked. The IR is a
  // finite tree (refs close cycles), so the walk needs no depth cap.
  for (const m of models) m.type = walk(m.type, `#/components/schemas/${m.name}`) as IrType
  for (const op of operations) {
    const at = `#/paths/${op.path}/${op.method.toLowerCase()}`
    if (op.response) op.response = walk(op.response, at)
    if (op.body) op.body = walk(op.body, at)
    op.pathParams = op.pathParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
    op.queryParams = op.queryParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
  }
}

interface Ctx {
  spec: Json
  notes: IrNote[]
  /** Spec schema key -> generated model name. */
  modelNames: Map<string, string>
  /** Generated model name -> spec schema key (the reverse of `modelNames`). */
  modelKeys: Map<string, string>
  /** Component models converted so far, memoized by spec key. */
  modelTypes: Map<string, IrType>
  /** Component models being converted right now -- an `allOf` cycle guard. */
  converting: Set<string>
  /**
   * `$ref` pointers being resolved right now, innermost last. `pure` marks a
   * frame whose target is itself only a `$ref`: a cycle made ENTIRELY of those
   * (`X -> Y -> X`) describes no structure at all.
   */
  refStack: { ref: string; pure: boolean }[]
  /** Non-component pointers hoisted into a named model (recursive ones). */
  hoisted: Map<string, string>
  /** Pointers re-entered during their own resolution (i.e. recursive). */
  reentered: Set<string>
  /** Models synthesized for recursive non-component pointers. */
  extraModels: IrModel[]
  /** Every model name in use, so a synthesized one never collides. */
  taken: Set<string>
}

/**
 * The IR type of a component model, converted ONCE and memoized.
 *
 * `allOf: [{ $ref: Base }]` needs Base's FIELDS, not a reference to it, so the
 * merge used to re-convert Base on every use -- duplicating every note Base
 * produced, and recursing forever on an `allOf` cycle (`A: allOf [A]`, or
 * `A -> B -> A`), which a real spec can reach by accident. Returns
 * `undefined` for a model that is still being converted: the caller is inside
 * a cycle and decides what that means for it.
 */
function modelType(key: string, ctx: Ctx): IrType | undefined {
  const done = ctx.modelTypes.get(key)
  if (done) return done
  if (ctx.converting.has(key)) return undefined
  const schema = obj(obj(obj(ctx.spec.components)?.schemas)?.[key])
  if (!schema) return undefined
  ctx.converting.add(key)
  const t = toType(schema, `#/components/schemas/${key}`, ctx)
  ctx.converting.delete(key)
  ctx.modelTypes.set(key, t)
  return t
}

/** A model name derived from `base` that is not yet in use. */
function claimName(base: string, ctx: Ctx): string {
  const root = typeIdent(base)
  let name = root
  for (let n = 2; ctx.taken.has(name); n++) name = `${root}${n}`
  ctx.taken.add(name)
  return name
}

function collectOperations(spec: Json, ctx: Ctx): IrOperation[] {
  const paths = obj(spec.paths) ?? {}
  const ops: IrOperation[] = []
  // Raw operation ids, collected FIRST so identifiers are assigned over the
  // whole document at once -- see `assignNames` for why a running counter
  // produced duplicate ids.
  const rawIds: string[] = []
  const tags = new Set<string>()
  for (const rawPath of Object.keys(paths).sort()) {
    const item = obj(paths[rawPath])
    if (!item) continue
    for (const method of METHODS) {
      const op = obj(item[method.toLowerCase()])
      if (!op) continue
      rawIds.push(str(op.operationId) ?? operationIdFrom(method, rawPath))
      tags.add(str(arr(op.tags)[0]) ?? 'default')
    }
  }
  const ids = assignNames(rawIds, ident)
  const tagNames = tagFileNames([...tags])
  let next = 0

  for (const rawPath of Object.keys(paths).sort()) {
    const item = obj(paths[rawPath])
    if (!item) continue
    // Path-level parameters apply to every operation under the path.
    const shared = arr(item.parameters)
    // One identifier per `{placeholder}`, unique WITHIN the path: `{a-b}` and
    // `{a_b}` both normalize to `aB`, and two `:aB` segments bind one value
    // to both.
    const placeholders = [...rawPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
    const placeholderIds = new Map<string, string>()
    assignNames(placeholders, ident).forEach((id, i) => placeholderIds.set(placeholders[i] as string, id))
    for (const method of METHODS) {
      const op = obj(item[method.toLowerCase()])
      if (!op) continue
      const at = `#/paths/${rawPath}/${method.toLowerCase()}`
      const id = ids[next++] as string
      if (!str(op.operationId)) {
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
          // rewritten to, so it takes the same per-path identifier -- they
          // disagreed for any name that was not already an identifier, and the
          // raw form reached a TYPE position where a `}` breaks out of the
          // generated signature. A QUERY parameter's name is a WIRE name
          // (`?page=2`), so it stays verbatim and is quoted at emit instead.
          name: po.in === 'path' ? (placeholderIds.get(name) ?? ident(name)) : name,
          type: toType(obj(po.schema) ?? { type: 'string' }, `${at}/parameters/${name}`, ctx),
          // A path parameter is always required, whatever the spec claims.
          required: po.in === 'path' ? true : po.required === true,
          doc: str(po.description),
        })
      }
      ops.push({
        id,
        method,
        path: toPyreonPath(rawPath, placeholderIds),
        tag: tagNames.get(str(arr(op.tags)[0]) ?? 'default') as string,
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

/**
 * Tags whose FILE names are unique.
 *
 * Every per-tag output is a file named by `tagFile(tag)`, which lowercases --
 * so `Users` and `users` wrote `endpoints/users.ts` twice and one silently
 * replaced the other (on a case-insensitive filesystem even two DIFFERENT
 * spellings do). A tag keeps its spelling when its file name is free, and is
 * suffixed deterministically when it is not.
 */
function tagFileNames(raw: readonly string[]): Map<string, string> {
  const taken = new Set<string>()
  const out = new Map<string, string>()
  for (const tag of [...raw].sort()) {
    let t = tag
    for (let n = 2; taken.has(tagFile(t)); n++) t = `${tag} ${n}`
    taken.add(tagFile(t))
    out.set(tag, t)
  }
  return out
}

/** `/users/{id}` -> `/users/:id`, the shape `@pyreon/http` declares. */
function toPyreonPath(path: string, ids: ReadonlyMap<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_m, name: string) => `:${ids.get(name) ?? ident(name)}`)
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
    const key = decodePointerSegment(seg)
    cur = obj(cur)?.[key]
    if (cur === undefined) {
      ctx.notes.push({ code: 'unsupported-ref', at, message: `$ref \`${ref}\` does not resolve.` })
      return {}
    }
  }
  return cur
}

/**
 * Convert a JSON-Schema-ish node to an IR type.
 *
 * Nullability is resolved HERE, for every node, rather than by the caller that
 * happens to hold a property: 3.0 `nullable: true` and 3.1 `type: [X, 'null']`
 * mean the same thing wherever they appear -- a component model, an array
 * item, a response root, a parameter. Resolving it only for direct object
 * properties (what this used to do) dropped it on GitHub's 63 `nullable-*`
 * component models, and every one of their 414 uses then rejected `null`.
 */
function toType(schema: Json, at: string, ctx: Ctx): IrType {
  const inner = toTypeNonNull(schema, at, ctx)
  return declaresNull(schema) ? nullable(inner) : inner
}

/** 3.0 `nullable: true`, or `null` among 3.1's `type` list. */
function declaresNull(schema: Json): boolean {
  if (schema.nullable === true) return true
  return Array.isArray(schema.type) && schema.type.some((t) => t === 'null')
}

/** Wrap in `nullable`, collapsing the cases where that adds nothing. */
function nullable(inner: IrType): IrType {
  if (inner.kind === 'null' || inner.kind === 'nullable' || inner.kind === 'unknown') return inner
  return { kind: 'nullable', inner }
}

function toTypeNonNull(schema: Json, at: string, ctx: Ctx): IrType {
  const ref = str(schema.$ref)
  if (ref) return refType(ref, schema, at, ctx)

  // allOf: merge object members. This is how specs express inheritance, and
  // flattening is the only representation the targets have.
  const allOf = arr(schema.allOf)
  if (allOf.length > 0) return mergeAllOf(allOf, schema, at, ctx)

  // An EMPTY `oneOf`/`anyOf` falls through to the type switch and lands on
  // `unknown` anyway, which is safe -- but silently. A spec that declares a
  // union of nothing is worth saying out loud.
  const declaredUnion = Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)
  const anyOf = arr(schema.oneOf).length > 0 ? arr(schema.oneOf) : arr(schema.anyOf)
  if (declaredUnion && anyOf.length === 0) {
    ctx.notes.push({ code: 'unsupported-schema', at, message: 'empty oneOf/anyOf - typed as unknown.' })
    return { kind: 'unknown', reason: 'empty union' }
  }
  if (anyOf.length > 0) {
    const discriminator = str(obj(schema.discriminator)?.propertyName)
    return {
      kind: 'union',
      options: anyOf.map((o, i) => toType(obj(o) ?? {}, `${at}/oneOf/${i}`, ctx)),
      // The WIRE name. It was `ident()`-ed, which turned `pet_type` into
      // `petType` -- a key no member has, so `s.discriminatedUnion` threw at
      // module import in dev and made every member unreachable in production.
      discriminator,
    }
  }

  // `const` (3.1) and `enum` are both a closed set of values, so they share a
  // kind. A `const` is the 3.1 spelling of a discriminator tag; typing it
  // `unknown` (what happened before) accepted any value at all.
  if ('const' in schema) {
    const v = schema.const
    if (isLiteral(v)) return enumOf([v])
    return unsupported(at, ctx, '`const` whose value is not a JSON scalar')
  }
  if (Array.isArray(schema.enum)) {
    const values = schema.enum.filter(isLiteral)
    if (values.length === schema.enum.length && values.length > 0) return enumOf(values)
    if (values.length === 0) return unsupported(at, ctx, '`enum` with no scalar values')
    ctx.notes.push({
      code: 'unsupported-schema',
      at,
      message: `enum holds ${schema.enum.length - values.length} non-scalar value(s) -- kept the ${values.length} scalar one(s); the rest are not accepted.`,
    })
    return enumOf(values)
  }

  // OpenAPI 3.1 allows a LIST of types. `null` among them was handled by the
  // caller; more than one remaining type is a union of each (it used to keep
  // only the first, so `[string, integer]` rejected every integer).
  const rawType = schema.type
  const types = Array.isArray(rawType) ? rawType.map(String) : rawType === undefined ? [] : [String(rawType)]
  const nonNull = types.filter((t) => t !== 'null')
  if (types.length > 0 && nonNull.length === 0) return { kind: 'null' }
  if (nonNull.length > 1) {
    return {
      kind: 'union',
      options: nonNull.map((t) => toTypeNonNull({ ...schema, type: t, nullable: undefined }, at, ctx)),
      discriminator: undefined,
    }
  }
  const t = nonNull[0] ?? inferType(schema)

  switch (t) {
    case 'string':
      return stringType(schema)
    case 'integer':
    case 'number':
      return numberType(schema, t === 'integer')
    case 'boolean':
      return { kind: 'boolean' }
    case 'array': {
      const items = obj(schema.items)
      return {
        kind: 'array',
        items: items ? toType(items, `${at}/items`, ctx) : { kind: 'unknown', reason: 'array without items' },
        minItems: count(schema.minItems),
        maxItems: count(schema.maxItems),
        uniqueItems: schema.uniqueItems === true ? true : undefined,
      }
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
      return unsupported(at, ctx, `unsupported type \`${String(t)}\``)
  }
}

/**
 * A `$ref`: a component model by name, anything else inlined -- and, when
 * inlining finds the pointer RECURSIVE, hoisted into a named model.
 *
 * Only `#/components/schemas/*` refs became models, so a recursive schema
 * anywhere else (`#/$defs/Node`, a pointer into a property) was inlined
 * forever: Bun's proper tail calls turned the recursion into a silent hang, and
 * V8 overflowed the stack. `lathe check` in CI hung with it. A recursive
 * pointer now closes through `kind: 'ref'` exactly like a component model, so
 * the emitters' existing cycle handling (`lazy`) applies. A cycle made only of
 * refs (`X: $ref Y`, `Y: $ref X`) describes no value at all; that is reported
 * as `cyclic-ref` and typed `unknown`.
 */
function refType(ref: string, schema: Json, at: string, ctx: Ctx): IrType {
  const key = ref.startsWith('#/components/schemas/') ? ref.slice('#/components/schemas/'.length) : undefined
  const name = key !== undefined ? ctx.modelNames.get(decodePointerSegment(key)) : undefined
  if (name) return { kind: 'ref', name }
  const hoisted = ctx.hoisted.get(ref)
  if (hoisted) return { kind: 'ref', name: hoisted }

  const open = ctx.refStack.findIndex((f) => f.ref === ref)
  if (open !== -1) {
    // Re-entered while resolving itself. Every frame from there to here being
    // a bare `$ref` means the cycle never passes through a schema.
    if (ctx.refStack.slice(open).every((f) => f.pure)) {
      ctx.notes.push({
        code: 'cyclic-ref',
        at,
        message: `\`$ref\` \`${ref}\` resolves back to itself through references alone, so it describes no value — typed as unknown.`,
      })
      return { kind: 'unknown', reason: `cyclic $ref ${ref}` }
    }
    ctx.reentered.add(ref)
    let synthetic = ctx.hoisted.get(ref)
    if (!synthetic) {
      synthetic = claimName(ref.split('/').pop() || 'Schema', ctx)
      ctx.hoisted.set(ref, synthetic)
    }
    return { kind: 'ref', name: synthetic }
  }

  const target = obj(deref(schema, at, ctx))
  if (!target) return { kind: 'unknown', reason: `unresolved $ref ${ref}` }
  ctx.refStack.push({ ref, pure: typeof target.$ref === 'string' && Object.keys(target).length === 1 })
  const t = toType(target, at, ctx)
  ctx.refStack.pop()
  const synthetic = ctx.hoisted.get(ref)
  if (synthetic && ctx.reentered.has(ref)) {
    ctx.extraModels.push({ name: synthetic, type: t, doc: str(target.description) ?? str(target.title) })
    ctx.reentered.delete(ref)
    return { kind: 'ref', name: synthetic }
  }
  return t
}

/** The type a schema with no `type` keyword implies by its other keywords. */
function inferType(schema: Json): string | undefined {
  if (schema.items !== undefined) return 'array'
  if (schema.properties !== undefined || schema.additionalProperties !== undefined) return 'object'
  if (typeof schema.minLength === 'number' || typeof schema.maxLength === 'number' || typeof schema.pattern === 'string') {
    return 'string'
  }
  return undefined
}

function unsupported(at: string, ctx: Ctx, what: string): IrType {
  ctx.notes.push({ code: 'unsupported-schema', at, message: `${what} — typed as unknown.` })
  return { kind: 'unknown', reason: what }
}

function isLiteral(v: unknown): v is IrLiteral {
  return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
}

/** An enum, with `null` lifted out into `nullable` so emitters see one shape. */
function enumOf(values: readonly IrLiteral[]): IrType {
  const unique = [...new Set(values)]
  const nonNull = unique.filter((v) => v !== null)
  if (nonNull.length === 0) return { kind: 'null' }
  const e: IrType = { kind: 'enum', values: nonNull }
  return nonNull.length === unique.length ? e : { kind: 'nullable', inner: e }
}

function stringType(schema: Json): IrType {
  const fmt = str(schema.format)
  const format = fmt && (FORMATS as readonly string[]).includes(fmt) ? (fmt as StringFormat) : undefined
  return {
    kind: 'string',
    format,
    minLength: count(schema.minLength),
    maxLength: count(schema.maxLength),
    pattern: str(schema.pattern),
  }
}

function numberType(schema: Json, integer: boolean): IrType {
  // 3.0 spells a strict bound as `minimum: 5, exclusiveMinimum: true`; 3.1 as
  // `exclusiveMinimum: 5`. Both normalize to the number. Reading the 3.0 form
  // as an inclusive `minimum` (what happened before) accepted the bound itself.
  let minimum = num(schema.minimum)
  let maximum = num(schema.maximum)
  let exclusiveMinimum = num(schema.exclusiveMinimum)
  let exclusiveMaximum = num(schema.exclusiveMaximum)
  if (schema.exclusiveMinimum === true && minimum !== undefined) {
    exclusiveMinimum = minimum
    minimum = undefined
  }
  if (schema.exclusiveMaximum === true && maximum !== undefined) {
    exclusiveMaximum = maximum
    maximum = undefined
  }
  const multipleOf = num(schema.multipleOf)
  return {
    kind: 'number',
    integer,
    minimum,
    maximum,
    exclusiveMinimum,
    exclusiveMaximum,
    multipleOf: multipleOf !== undefined && multipleOf > 0 ? multipleOf : undefined,
  }
}

function fieldsOf(schema: Json, props: Json, at: string, ctx: Ctx): IrField[] {
  const required = new Set(arr(schema.required).filter((r): r is string => typeof r === 'string'))
  const out: IrField[] = []
  for (const key of Object.keys(props)) {
    const p = obj(props[key])
    if (!p) continue
    out.push({
      name: key,
      type: toType(p, `${at}/properties/${key}`, ctx),
      required: required.has(key),
      doc: str(p.description) ?? str(p.title),
      example: p.example,
      readOnly: p.readOnly === true ? true : undefined,
      writeOnly: p.writeOnly === true ? true : undefined,
    })
  }
  return out
}

function mergeAllOf(parts: unknown[], self: Json, at: string, ctx: Ctx): IrType {
  const fields: IrField[] = []
  const seen = new Set<string>()
  let sawNonObject = false
  const push = (t: IrType): void => {
    // A nullable part (GitHub's `nullable-*` models) still contributes its
    // fields; whether the MERGED shape admits null is the allOf's own call.
    if (t.kind === 'nullable') { push(t.inner); return }
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
      const key = ctx.modelKeys.get(t.name)
      if (key !== undefined) {
        const target = modelType(key, ctx)
        if (target) { push(target); return }
        // Still being converted: an allOf CYCLE. A schema that is "all of
        // itself and X" is just X, so the cyclic part contributes nothing.
        ctx.notes.push({
          code: 'cyclic-ref',
          at,
          message: `allOf reaches \`${t.name}\` again while merging it — the cyclic part contributes no fields.`,
        })
        return
      }
      const hoisted = ctx.extraModels.find((m) => m.name === t.name)
      if (hoisted) { push(hoisted.type); return }
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

/**
 * One JSON-pointer segment, as it appears in a URI fragment: percent-decoded
 * first (RFC 6901 §6), then `~1` -> `/` and `~0` -> `~` (§4, in that order).
 */
function decodePointerSegment(seg: string): string {
  let s = seg
  try {
    s = decodeURIComponent(seg)
  } catch {
    // A lone `%` is not an escape; the segment is taken literally.
  }
  return s.replace(/~1/g, '/').replace(/~0/g, '~')
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
/** A non-negative integer count (`minLength`, `minItems`, …). */
function count(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
}
