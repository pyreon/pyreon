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
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[Pyreon] lathe: spec did not parse to an object')
  }
  const refusal = openApiVersionProblem(raw)
  if (refusal) throw new Error(refusal)
  return { doc: convert(raw as Json) }
}

/**
 * Why a parsed document is not an OpenAPI 3.x spec Lathe can read, or
 * `undefined` when it is.
 *
 * Checked BEFORE conversion, because conversion is lenient by design and a
 * lenient reader turns the wrong document into an EMPTY client rather than an
 * error: a Swagger 2 spec (whose models live under `definitions` and whose
 * bodies live in `in: body` parameters) produced 0 models and exit 0, and a
 * YAML file that was not a spec at all overwrote a working generated tree --
 * `api-surface.json` included, which silently reset the contract baseline.
 *
 * Shared with `lathe pull`, so a download is refused by the same rule that
 * would refuse it at generate time.
 */
export function openApiVersionProblem(doc: unknown): string | undefined {
  const d = obj(doc)
  if (!d) return '[Pyreon] lathe: the spec did not parse to an object.'
  if (d.swagger !== undefined) {
    return (
      `[Pyreon] lathe: this is a Swagger ${String(d.swagger)} document, and Lathe reads OpenAPI 3.x.\n` +
      '  Swagger 2 keeps models in `definitions` and request bodies in `in: body` parameters,\n' +
      '  so reading it as 3.x would produce an empty client. Convert it first, then generate:\n' +
      '    npx swagger2openapi swagger.json -o openapi.json'
    )
  }
  // A YAML `openapi: 3.0` (unquoted) reads as the NUMBER 3, which is still a
  // 3.x document; stringifying first accepts it rather than refusing a spec on
  // a quoting technicality.
  const version = typeof d.openapi === 'number' ? String(d.openapi) : d.openapi
  if (typeof version !== 'string') {
    return (
      '[Pyreon] lathe: this document has no `openapi` version key, so it is not an OpenAPI spec.\n' +
      '  Nothing was generated and the output directory was not touched.\n' +
      '  Check that `input` points at the API description (it starts with `openapi: 3.x`).'
    )
  }
  if (!/^3(\.|$)/.test(version)) {
    return (
      `[Pyreon] lathe: \`openapi: ${version}\` is not a version Lathe reads — it supports OpenAPI 3.0 and 3.1.\n` +
      '  Nothing was generated and the output directory was not touched.'
    )
  }
  return undefined
}

function convert(spec: Json): IrDocument {
  const notes: IrNote[] = []
  const ctx: Ctx = { spec, notes, modelNames: new Map(), resolving: new Set(), opAt: new Map() }

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
      type: toType(schema, ptr('components', 'schemas', key), ctx),
      doc: str(schema.description) ?? str(schema.title),
    })
  }

  noteSecurity(spec, ctx)
  const operations = collectOperations(spec, ctx)

  // Post-pass: two union shapes a real spec produces that the emitted schema
  // DSL cannot express. Runs here, after models exist, because deciding either
  // one needs to resolve `$ref`s.
  normalizeUnions(models, operations, ctx)

  return {
    title: str(info.title) ?? 'API',
    version: specVersion(info.version, notes),
    baseUrl,
    models,
    operations,
    notes,
  }
}

/**
 * Fix up union shapes the schema DSL cannot express.
 *
 * Both were found by running the GitHub spec through the generator, and both
 * emitted code that did not typecheck:
 *
 *  - a `oneOf`/`anyOf` with ONE member. `s.union` requires at least two, and a
 *    one-member union is just that member anyway.
 *  - a `discriminator` whose members are not all OBJECTS. GitHub's
 *    `GET /repos/{}/contents/{}` discriminates over a set that includes an
 *    ARRAY branch; `s.discriminatedUnion` takes object schemas only, so it
 *    degrades to a plain union rather than emitting something invalid.
 */
function normalizeUnions(models: IrModel[], operations: IrOperation[], ctx: Ctx): void {
  const byName = new Map(models.map((m) => [m.name, m]))
  const isObjectish = (t: IrType, depth = 0): boolean => {
    if (depth > 8) return false
    if (t.kind === 'object') return true
    if (t.kind === 'ref') {
      const target = byName.get(t.name)
      return target ? isObjectish(target.type, depth + 1) : false
    }
    return false
  }

  const walk = (type: IrType | undefined, at: string, depth = 0): IrType | undefined => {
    if (!type || depth > 12) return type
    switch (type.kind) {
      case 'array':
        return { ...type, items: walk(type.items, at, depth + 1) as IrType }
      case 'object':
        return {
          ...type,
          fields: type.fields.map((f) => ({ ...f, type: walk(f.type, at, depth + 1) as IrType })),
          additional: walk(type.additional, at, depth + 1),
        }
      case 'union': {
        const options = type.options.map((o) => walk(o, at, depth + 1) as IrType)
        if (options.length === 1) return options[0] as IrType
        if (options.length === 0) {
          ctx.notes.push({ code: 'unsupported-schema', at, message: 'empty oneOf/anyOf - typed as unknown.' })
          return { kind: 'unknown', reason: 'empty union' }
        }
        if (type.discriminator && !options.every((o) => isObjectish(o))) {
          ctx.notes.push({
            code: 'unsupported-schema',
            at,
            message: `discriminator \`${type.discriminator}\` has a non-object member, which a discriminated union cannot take - emitted as a plain union instead.`,
          })
          return { kind: 'union', options, discriminator: undefined }
        }
        if (type.discriminator) {
          const why = unprovableTag(options, type.discriminator)
          if (why) {
            ctx.notes.push({
              code: 'unsupported-schema',
              at,
              message: `discriminator \`${type.discriminator}\` cannot be proven from the members (${why}) - emitted as a plain union instead, which validates the same data without the tag dispatch.`,
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

  /**
   * Why a discriminated union's tag cannot be dispatched on, or `undefined`.
   *
   * Both schema libraries build the tag -> member map when the union is
   * CONSTRUCTED, so a member whose tag field is not a required literal/enum
   * throws at IMPORT of the generated schemas module -- one such model took
   * every other model in the file down with it. The IR is the place to decide,
   * because it is the one place that can see through `$ref`s: each member's tag
   * must be a required, non-nullable string enum, and no two members may claim
   * the same value. Anything else falls back to a plain union, which accepts
   * exactly the same data and only loses the O(1) dispatch.
   */
  const unprovableTag = (options: readonly IrType[], tag: string): string | undefined => {
    const claimed = new Set<string>()
    for (const option of options) {
      let t: IrType | undefined = option
      for (let hops = 0; t?.kind === 'ref' && hops < 8; hops++) t = byName.get(t.name)?.type
      if (t?.kind !== 'object') return 'a member is not an object'
      const field = t.fields.find((f) => f.name === tag)
      if (!field) return `a member has no \`${tag}\` field`
      if (!field.required) return `a member's \`${tag}\` is optional`
      if (field.nullable) return `a member's \`${tag}\` is nullable`
      if (field.type.kind !== 'string' || !field.type.enum || field.type.enum.length === 0) {
        return `a member's \`${tag}\` is not a string literal or enum`
      }
      for (const v of field.type.enum) {
        if (claimed.has(v)) return `two members claim the tag value \`${v}\``
        claimed.add(v)
      }
    }
    return undefined
  }

  // Pointers into the SOURCE document. The generated model name and the
  // Pyreon-shaped path are not spec keys (`Pet_1`, `/pets/:id`), so a note built
  // from them pointed at nothing.
  const specKeyOf = new Map([...ctx.modelNames].map(([key, name]) => [name, key]))
  for (const m of models) {
    m.type = walk(m.type, ptr('components', 'schemas', specKeyOf.get(m.name) ?? m.name)) as IrType
  }
  for (const op of operations) {
    const at = ctx.opAt.get(op) ?? ptr('paths', op.path, op.method.toLowerCase())
    if (op.response) op.response = walk(op.response, at)
    if (op.body) op.body = walk(op.body, at)
  }
}

interface Ctx {
  spec: Json
  notes: IrNote[]
  /** Spec schema key -> generated model name. */
  modelNames: Map<string, string>
  /** Guards `$ref` cycles while resolving inline. */
  resolving: Set<string>
  /** Each operation's pointer in the source document, for post-pass notes. */
  opAt: Map<IrOperation, string>
}

function collectOperations(spec: Json, ctx: Ctx): IrOperation[] {
  const paths = obj(spec.paths) ?? {}
  const ops: IrOperation[] = []
  const uniq = uniquifier()
  const globalSecurity = spec.security !== undefined
  for (const rawPath of Object.keys(paths).sort()) {
    const item = obj(paths[rawPath])
    if (!item) continue
    // Path-level parameters apply to every operation under the path. Each is
    // paired with its OWN pointer: an operation parameter and a path-level one
    // live at different places in the document.
    const shared = arr(item.parameters).map((p, i) => ({
      p,
      at: ptr('paths', rawPath, 'parameters', i),
    }))
    for (const method of METHODS) {
      const op = obj(item[method.toLowerCase()])
      if (!op) continue
      const at = ptr('paths', rawPath, method.toLowerCase())
      let id = str(op.operationId)
      if (!id) {
        id = operationIdFrom(method, rawPath)
        ctx.notes.push({
          code: 'missing-operation-id',
          at,
          message: `operation has no operationId — derived \`${id}\` from method + path. Add one to the spec to make the generated name stable against path edits.`,
        })
      }
      const own = arr(op.parameters).map((p, i) => ({ p, at: sub(at, 'parameters', i) }))
      // An operation parameter OVERRIDES a path-level one with the same
      // name+location (OpenAPI 3.x, "Operation Object > parameters").
      const params = [...shared, ...own]
      const pathParams: IrParam[] = []
      const queryParams: IrParam[] = []
      for (const { p, at: pAt } of params) {
        const po = obj(deref(p, pAt, ctx))
        if (!po) continue
        const name = str(po.name)
        if (!name) continue
        const where = str(po.in)
        const target = where === 'path' ? pathParams : where === 'query' ? queryParams : null
        if (!target) {
          // Header and cookie parameters have nowhere to go in the generated
          // call signature. Dropping one silently is the worst kind of loss:
          // the call compiles, and the server rejects it for a header the
          // caller was never told about.
          ctx.notes.push({
            code: 'unsupported-parameter',
            at: pAt,
            message: `${po.required === true ? 'REQUIRED ' : ''}${where ?? 'unknown-location'} parameter \`${name}\` is not part of the generated call — send it yourself (a request header, or middleware on the client), or the server may reject the request.`,
          })
          continue
        }
        noteSerialization(po, name, where as 'path' | 'query', pAt, ctx)
        if (po.deprecated === true) {
          ctx.notes.push({
            code: 'deprecated',
            at: pAt,
            message: `parameter \`${name}\` is deprecated, but the generated signature carries no \`@deprecated\` marker — call sites get no warning.`,
          })
        }
        target.push({
          // A PATH parameter's name must match the `:placeholder` the path was
          // rewritten to, so it takes the same `ident()` normalization -- they
          // disagreed for any name that was not already an identifier, and the
          // raw form reached a TYPE position where a `}` breaks out of the
          // generated signature. A QUERY parameter's name is a WIRE name
          // (`?page=2`), so it stays verbatim and is quoted at emit instead.
          name: where === 'path' ? ident(name) : name,
          type: toType(obj(po.schema) ?? { type: 'string' }, sub(pAt, 'schema'), ctx),
          // A path parameter is always required, whatever the spec claims.
          required: where === 'path' ? true : po.required === true,
          doc: str(po.description),
        })
      }
      const tags = arr(op.tags).filter((t): t is string => typeof t === 'string' && t.length > 0)
      if (tags.length > 1) {
        ctx.notes.push({
          code: 'extra-tags',
          at: sub(at, 'tags'),
          message: `grouped under its first tag \`${tags[0]}\` only; also tagged ${tags.slice(1).map((t) => `\`${t}\``).join(', ')}.`,
        })
      }
      const summary = str(op.summary)
      const description = str(op.description)
      if (summary && description) {
        ctx.notes.push({
          code: 'description-dropped',
          at: sub(at, 'description'),
          message: 'the operation has both a summary and a description; the generated JSDoc carries the summary only.',
        })
      }
      if (op.deprecated === true) {
        ctx.notes.push({
          code: 'deprecated',
          at,
          message: 'the operation is deprecated, but the generated endpoint and hook carry no `@deprecated` marker — call sites get no warning.',
        })
      }
      // An EXPLICIT operation-level requirement, or the document's global one.
      // `security: []` on an operation opts out of the global requirement.
      const opSecurity = Array.isArray(op.security) ? op.security : undefined
      const required = opSecurity ?? (globalSecurity ? arr(spec.security) : [])
      const schemes = [...new Set(required.flatMap((r) => Object.keys(obj(r) ?? {})))].sort()
      if (schemes.length > 0 && opSecurity) {
        ctx.notes.push({
          code: 'unsupported-security',
          at: sub(at, 'security'),
          message: `requires ${schemes.map((n) => `\`${n}\``).join(' or ')}, which the generated client does not send — the request fails authorization until you add the credential yourself.`,
        })
      }
      const irOp: IrOperation = {
        id: uniq(ident(id)),
        method,
        path: toPyreonPath(rawPath),
        tag: tags[0] ?? 'default',
        summary: summary ?? description,
        pathParams,
        queryParams,
        body: bodyType(op, at, ctx),
        response: responseType(op, at, ctx),
      }
      ctx.opAt.set(irOp, at)
      ops.push(irOp)
    }
  }
  return ops
}

/**
 * Note a parameter whose SERIALIZATION the generated client does not follow.
 *
 * The client serializes the OpenAPI defaults: a path segment as `simple`, a
 * query value as `form` with `explode: true` (an array repeats its key). A
 * spec asking for anything else -- `deepObject`, `spaceDelimited`,
 * `explode: false` -- gets a request the server was not written to parse, and
 * nothing at compile time says so.
 */
function noteSerialization(po: Json, name: string, where: 'path' | 'query', at: string, ctx: Ctx): void {
  const style = str(po.style)
  const explode = typeof po.explode === 'boolean' ? po.explode : undefined
  const defaultStyle = where === 'path' ? 'simple' : 'form'
  const defaultExplode = where === 'query'
  const odd: string[] = []
  if (style && style !== defaultStyle) odd.push(`style: ${style}`)
  if (explode !== undefined && explode !== defaultExplode) odd.push(`explode: ${explode}`)
  if (po.allowReserved === true) odd.push('allowReserved: true')
  if (odd.length === 0) return
  ctx.notes.push({
    code: 'parameter-serialization',
    at,
    message: `${where} parameter \`${name}\` declares ${odd.join(', ')}; the generated client serializes the default (${defaultStyle}${where === 'query' ? ', explode' : ''}), which the server may not parse.`,
  })
}

/**
 * Note every security scheme, and the global requirement.
 *
 * Lathe applies none of them, so the generated client sends no credentials.
 * That is a loss worth leading with: every protected operation fails with a
 * 401 against a client that compiled cleanly.
 */
function noteSecurity(spec: Json, ctx: Ctx): void {
  const schemes = obj(obj(spec.components)?.securitySchemes) ?? {}
  for (const name of Object.keys(schemes).sort()) {
    const scheme = obj(schemes[name]) ?? {}
    const kind = [str(scheme.type), str(scheme.scheme), str(scheme.in)].filter(Boolean).join(' ')
    ctx.notes.push({
      code: 'unsupported-security',
      at: ptr('components', 'securitySchemes', name),
      message: `security scheme \`${name}\`${kind ? ` (${kind})` : ''} is not applied — the generated client sends no credentials for it.`,
    })
  }
  const global = arr(spec.security)
  const names = [...new Set(global.flatMap((r) => Object.keys(obj(r) ?? {})))].sort()
  if (names.length > 0) {
    ctx.notes.push({
      code: 'unsupported-security',
      at: '#/security',
      message: `every operation requires ${names.map((n) => `\`${n}\``).join(' or ')} unless it opts out; the generated client sends no credentials, so those requests fail authorization until you add them yourself.`,
    })
  }
}

/** `/users/{id}` -> `/users/:id`, the shape `@pyreon/http` declares. */
function toPyreonPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_m, name: string) => `:${ident(name)}`)
}

function bodyType(op: Json, at: string, ctx: Ctx): IrType | undefined {
  const rbAt = sub(at, 'requestBody')
  const rb = obj(deref(op.requestBody, rbAt, ctx))
  if (!rb) return undefined
  const content = obj(rb.content)
  if (!content) return undefined
  const type = pickContent(content, rbAt, ctx)
  // `requestBody.required` defaults to FALSE in OpenAPI, and the generated
  // `json` argument is required either way. A caller that wants to omit it gets
  // a compile error for something the spec allows.
  if (type && rb.required !== true) {
    ctx.notes.push({
      code: 'optional-request-body',
      at: rbAt,
      message: 'the request body is optional in the spec (`required` is not `true`), but the generated `json` argument is required.',
    })
  }
  return type
}

function responseType(op: Json, at: string, ctx: Ctx): IrType | undefined {
  const responses = obj(op.responses)
  if (!responses) return undefined
  const rAt = sub(at, 'responses')
  // First 2xx wins, numerically, so `200` beats `201` deterministically.
  const successes = Object.keys(responses)
    .filter((k) => /^2(\d\d|XX)$/i.test(k))
    .sort()
  const ok = successes[0]
  const chosen = ok ?? (responses.default !== undefined ? 'default' : undefined)

  // What the typed result does NOT carry. Each is a response the spec
  // describes and the generated call cannot surface: a different success
  // shape, or an error body that reaches the caller as an untyped rejection.
  const withBody = (k: string): boolean => {
    const r = obj(deref(responses[k], sub(rAt, k), ctx))
    return obj(r?.content) !== undefined && Object.keys(obj(r?.content) ?? {}).length > 0
  }
  const others = successes.slice(1).filter(withBody)
  if (others.length > 0) {
    ctx.notes.push({
      code: 'other-success-responses',
      at: rAt,
      message: `only \`${ok}\` is typed; the ${others.map((k) => `\`${k}\``).join(', ')} response${others.length > 1 ? 's are' : ' is'} decoded as if ${others.length > 1 ? 'they were' : 'it were'} \`${ok}\`.`,
    })
  }
  const errors = Object.keys(responses)
    .filter((k) => k !== chosen && (/^[45](\d\d|XX)$/i.test(k) || k === 'default'))
    .filter(withBody)
    .sort()
  if (errors.length > 0) {
    ctx.notes.push({
      code: 'error-responses',
      at: rAt,
      message: `error response${errors.length > 1 ? 's' : ''} ${errors.map((k) => `\`${k}\``).join(', ')} ${errors.length > 1 ? 'are' : 'is'} not typed — a failed call rejects with an error whose body is \`unknown\`.`,
    })
  }

  if (!chosen) return undefined
  const cAt = sub(rAt, chosen)
  const res = obj(deref(responses[chosen], cAt, ctx))
  const headers = Object.keys(obj(res?.headers) ?? {}).sort()
  if (headers.length > 0) {
    ctx.notes.push({
      code: 'response-headers',
      at: sub(cAt, 'headers'),
      message: `response header${headers.length > 1 ? 's' : ''} ${headers.map((h) => `\`${h}\``).join(', ')} ${headers.length > 1 ? 'are' : 'is'} not exposed — the generated call resolves to the body only.`,
    })
  }
  const content = obj(res?.content)
  if (!content) return undefined
  return pickContent(content, cAt, ctx)
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
      code: 'non-json-media-type',
      at: sub(at, 'content'),
      message: `no JSON media type (found ${keys.join(', ')}) — using \`${first}\` and typing it as unknown.`,
    })
    return { kind: 'unknown', reason: `media type ${first}` }
  }
  if (keys.length > 1) {
    ctx.notes.push({
      code: 'multiple-content-types',
      at: sub(at, 'content'),
      message: `${keys.length} media types (${keys.join(', ')}) — generated code uses ${json}.`,
    })
  }
  const schema = obj(obj(content[json])?.schema)
  return schema ? toType(schema, sub(at, 'content', json, 'schema'), ctx) : { kind: 'unknown', reason: 'no schema' }
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
    const keyword = arr(schema.oneOf).length > 0 ? 'oneOf' : 'anyOf'
    return {
      kind: 'union',
      options: anyOf.map((o, i) => toType(obj(o) ?? {}, sub(at, keyword, i), ctx)),
      discriminator: discriminator ? ident(discriminator) : undefined,
    }
  }

  // `const` pins a value. Nothing here enforces it -- the schema below is typed
  // by its base type (or `unknown`) -- so the loss is named rather than taken
  // silently.
  if (schema.const !== undefined) {
    ctx.notes.push({
      code: 'unsupported-const',
      at: sub(at, 'const'),
      message: `\`const: ${JSON.stringify(schema.const)}\` is not enforced — the value is typed by its base type (or \`unknown\` when none is declared).`,
    })
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
    if (p.deprecated === true) {
      ctx.notes.push({
        code: 'deprecated',
        at: sub(at, 'properties', key),
        message: `property \`${key}\` is deprecated, but the generated type carries no \`@deprecated\` marker.`,
      })
    }
    const nullable =
      p.nullable === true ||
      (Array.isArray(p.type) && (p.type as unknown[]).map(String).includes('null'))
    out.push({
      name: key,
      type: toType(p, sub(at, 'properties', key), ctx),
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
  for (let i = 0; i < parts.length; i++) push(toType(obj(parts[i]) ?? {}, sub(at, 'allOf', i), ctx))
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
 * `info.version`, as the string the banner and the surface record.
 *
 * YAML reads an unquoted `version: 1` as a NUMBER, and the old `str()`-only
 * read turned every such spec into `0.0.0` -- a version the author never wrote,
 * stamped on every generated file. A number is stringified instead, with a note,
 * because the conversion is lossy for the case that matters: `version: 1.0`
 * reads as `1` before this code ever sees it.
 */
function specVersion(raw: unknown, notes: IrNote[]): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    notes.push({
      code: 'numeric-version',
      at: '#/info/version',
      message: `\`info.version\` is the number ${raw}, not a string -- used as \`${raw}\`. Quote it in YAML (\`version: '1.0'\`); an unquoted \`1.0\` has already lost its \`.0\` by the time it is read.`,
    })
    return String(raw)
  }
  return str(raw) ?? '0.0.0'
}

/**
 * An RFC 6901 JSON pointer (`#/paths/~1pets~1{id}/get`).
 *
 * A segment's `~` and `/` must be escaped, or the pointer does not resolve:
 * every path key starts with `/`, so every operation note used to point at
 * `#/paths//pets/get`.
 */
export function ptr(...segments: ReadonlyArray<string | number>): string {
  return `#/${segments.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}

/** Append segments to an existing pointer. */
function sub(at: string, ...segments: ReadonlyArray<string | number>): string {
  return `${at}/${ptr(...segments).slice(2)}`
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
