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
  BodyEncoding,
  HttpMethod,
  IrBody,
  IrDocument,
  IrField,
  IrFieldEncoding,
  IrLiteral,
  IrModel,
  IrNote,
  IrOperation,
  IrPagination,
  IrParam,
  IrSecurityScheme,
  IrType,
  StringFormat,
} from '../core/ir'
import { assignNames, ident, modelIdent, operationIdent, operationIdFrom, tagFile } from '../core/naming'
import { splitByDirection } from './direction'
import { parseSpecText } from './yaml'

type Json = Record<string, unknown>

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const FORMATS: readonly StringFormat[] = ['email', 'uri', 'uuid', 'date', 'date-time', 'binary']

export interface LoadResult {
  doc: IrDocument
}

export interface LoadOptions {
  /**
   * The URL the spec was fetched from. A RELATIVE `servers[].url` (petstore's
   * `/api/v3`) is resolved against it, as OpenAPI specifies; without it a
   * relative server stays relative and is reported.
   */
  sourceUrl?: string | undefined
}

/** Parse a spec document (JSON or YAML text) into the IR. */
export function loadOpenApi(source: string, options: LoadOptions = {}): LoadResult {
  const raw = parseSpecText(source)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[Pyreon] lathe: spec did not parse to an object')
  }
  const refusal = openApiVersionProblem(raw)
  if (refusal) throw new Error(refusal)
  return { doc: convert(raw as Json, options) }
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

/**
 * The URL a `servers[]` entry means.
 *
 * Server VARIABLES (`https://{region}.api.test/{version}`) are substituted with
 * their `default` -- the value OpenAPI says to use when none is chosen; they
 * were baked in with literal braces. A RELATIVE url is resolved against the
 * spec's own URL when that is known (OpenAPI §Server Object).
 */
function serverUrl(server: Json | undefined, at: string, ctx: Ctx, sourceUrl: string | undefined): string {
  let url = str(server?.url)
  if (!url) return ''
  const vars = obj(server?.variables)
  url = url.replace(/\{([^}]+)\}/g, (match, name: string) => {
    const def = obj(vars?.[name])?.default
    if (typeof def === 'string' || typeof def === 'number') return String(def)
    ctx.notes.push({
      code: 'no-servers',
      at,
      message: `server variable \`{${name}}\` has no default — it stays in the URL literally. Pass \`baseUrl\` in the config.`,
    })
    return match
  })
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
    if (sourceUrl) {
      try {
        return stripTrailingSlash(new URL(url, sourceUrl).href)
      } catch {
        // An unparseable source URL leaves the server relative; reported below.
      }
    }
    ctx.notes.push({
      code: 'no-servers',
      at,
      message: `server url \`${url}\` is RELATIVE — the web client resolves it against the page's origin, but native needs an absolute URL (PMTC bakes it at compile time). Pass \`baseUrl\` in the config, or generate from the spec's URL so it can be resolved.`,
    })
  }
  return stripTrailingSlash(url)
}

function convert(spec: Json, options: LoadOptions = {}): IrDocument {
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
    baseUrl: '',
    sourceUrl: undefined,
    opAt: new Map(),
    int64At: new Set(),
  }

  const info = obj(spec.info) ?? {}
  const servers = arr(spec.servers)
  const firstServer = servers.length > 0 ? obj(servers[0]) : undefined
  const baseUrl = serverUrl(firstServer, ptr('servers', 0), ctx, options.sourceUrl)
  ctx.baseUrl = baseUrl
  ctx.sourceUrl = options.sourceUrl
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
  const assigned = assignNames(keys, modelIdent)
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
      deprecated: schema.deprecated === true ? true : undefined,
    })
  }

  const securitySchemes = collectSecuritySchemes(spec, ctx)
  ctx.appliedSecurity = new Set(securitySchemes.map((sc) => sc.name))
  noteSecurity(spec, securitySchemes, ctx)
  const operations = collectOperations(spec, ctx)
  // Schemas reached through a non-component pointer that turned out to be
  // RECURSIVE were hoisted into named models while converting; they join the
  // document here, after every conversion that could add one.
  models.push(...ctx.extraModels)

  // readOnly / writeOnly: request and response shapes of one model. Before the
  // union pass, so a discriminator is validated against the final shapes.
  splitByDirection(models, operations, (base) => claimName(base, ctx))

  // Post-pass: two union shapes a real spec produces that the emitted schema
  // DSL cannot express. Runs here, after models exist, because deciding either
  // one needs to resolve `$ref`s.
  normalizeUnions(models, operations, ctx)
  noteInt64(ctx)

  return {
    title: str(info.title) ?? 'API',
    version: specVersion(info.version, notes),
    baseUrl,
    ...(securitySchemes.length > 0 ? { securitySchemes } : {}),
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
      if (!target) return 'a member is not an object'
      const field = target.fields.find((f) => f.name === key)
      if (!field) return `a member has no \`${key}\` field`
      if (!field.required) return `a member's \`${key}\` is optional`
      if (field.type.kind !== 'enum') {
        return `a member's \`${key}\` is not a fixed value — an implicit discriminator`
      }
      for (const v of field.type.values) {
        if (claimed.has(v)) return `two members claim the tag value \`${String(v)}\``
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

  // A discriminator decision reads OTHER models' fields, so every model is
  // walked first with its own result visible to the next -- the member types a
  // union names are final by the time the union is checked. The IR is a
  // finite tree (refs close cycles), so the walk needs no depth cap.
  // Pointers into the SOURCE document. The generated model name and the
  // Pyreon-shaped path are not spec keys (`Pet_1`, `/pets/:id`), so a note built
  // from them pointed at nothing.
  for (const m of models) {
    const key = ctx.modelKeys.get(m.name)
    m.type = walk(m.type, key !== undefined ? ptr('components', 'schemas', key) : ptr('components', 'schemas', m.name)) as IrType
  }
  for (const op of operations) {
    const at = ctx.opAt.get(op) ?? ptr('paths', op.path, op.method.toLowerCase())
    if (op.response) op.response = walk(op.response, at)
    if (op.body) op.body = { ...op.body, type: walk(op.body.type, at) as IrType }
    op.headerParams = op.headerParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
    op.cookieParams = op.cookieParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
    op.pathParams = op.pathParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
    op.queryParams = op.queryParams.map((p) => ({ ...p, type: walk(p.type, at) as IrType }))
  }
}

interface Ctx {
  spec: Json
  /** Security scheme names the generated client has a helper for. */
  appliedSecurity?: ReadonlySet<string>
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
  /** The document's resolved base URL (`servers[0]`). */
  baseUrl: string
  /** Where the spec came from, for resolving relative server URLs. */
  sourceUrl: string | undefined
  /** Each operation's pointer in the source document, for post-pass notes. */
  opAt: Map<IrOperation, string>
  /** Pointers of every `format: int64` number, for one aggregated note. */
  int64At: Set<string>
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
  const t = toType(schema, ptr('components', 'schemas', key), ctx)
  ctx.converting.delete(key)
  ctx.modelTypes.set(key, t)
  return t
}

/** A model name derived from `base` that is not yet in use. */
function claimName(base: string, ctx: Ctx): string {
  const root = modelIdent(base)
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
  const ids = assignNames(rawIds, operationIdent)
  const tagNames = tagFileNames([...tags])
  const globalSecurity = spec.security !== undefined
  let next = 0

  for (const rawPath of Object.keys(paths).sort()) {
    const item = obj(paths[rawPath])
    if (!item) continue
    // Path-level parameters apply to every operation under the path. Each is
    // paired with its OWN pointer: an operation parameter and a path-level one
    // live at different places in the document.
    const shared = arr(item.parameters).map((p, i) => ({ p, at: ptr('paths', rawPath, 'parameters', i) }))
    // One identifier per `{placeholder}`, unique WITHIN the path: `{a-b}` and
    // `{a_b}` both normalize to `aB`, and two `:aB` segments bind one value
    // to both.
    const placeholders = [...rawPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string)
    const placeholderIds = new Map<string, string>()
    assignNames(placeholders, ident).forEach((id, i) => placeholderIds.set(placeholders[i] as string, id))
    for (const method of METHODS) {
      const op = obj(item[method.toLowerCase()])
      if (!op) continue
      const at = ptr('paths', rawPath, method.toLowerCase())
      const id = ids[next++] as string
      if (!str(op.operationId)) {
        ctx.notes.push({
          code: 'missing-operation-id',
          at,
          message: `operation has no operationId — derived \`${id}\` from method + path. Add one to the spec to make the generated name stable against path edits.`,
        })
      }
      const params = [...shared, ...arr(op.parameters).map((p, i) => ({ p, at: sub(at, 'parameters', i) }))]
      const pathParams: IrParam[] = []
      const queryParams: IrParam[] = []
      const headerParams: IrParam[] = []
      const cookieParams: IrParam[] = []
      // An operation-level parameter OVERRIDES a path-level one with the same
      // (name, in) -- OpenAPI 3 §Operation Object. Concatenating them gave two
      // `q` parameters with different types and required-ness.
      const byKey = new Map<string, { po: Json; pAt: string }>()
      for (const { p, at: pAt } of params) {
        const po = obj(deref(p, pAt, ctx))
        const name = po ? str(po.name) : undefined
        if (!po || !name) continue
        byKey.set(`${String(po.in)}:${name}`, { po, pAt })
      }
      for (const { po, pAt } of byKey.values()) {
        const name = str(po.name) as string
        const where = str(po.in)
        const target =
          po.in === 'path'
            ? pathParams
            : po.in === 'query'
              ? queryParams
              : po.in === 'header' && !IGNORED_HEADERS.has(name.toLowerCase())
                ? headerParams
                : po.in === 'cookie'
                  ? cookieParams
                  : null
        if (!target) {
          // An `Accept` / `Content-Type` / `Authorization` header parameter is
          // ignored by rule (OpenAPI says so) and is not a loss. Anything else
          // without a place in the call -- an unknown location -- is.
          if (where !== 'header') {
            ctx.notes.push({
              code: 'unsupported-parameter',
              at: pAt,
              message: `${po.required === true ? 'REQUIRED ' : ''}${where ?? 'unknown-location'} parameter \`${name}\` is not part of the generated call — \`in\` must be path, query, header or cookie.`,
            })
          }
          continue
        }
        if (where === 'path' || where === 'query') noteSerialization(po, name, where, pAt, ctx)
        target.push({
          // A PATH parameter's name must match the `:placeholder` the path was
          // rewritten to, so it takes the same per-path identifier -- they
          // disagreed for any name that was not already an identifier, and the
          // raw form reached a TYPE position where a `}` breaks out of the
          // generated signature. A QUERY parameter's name is a WIRE name
          // (`?page=2`), so it stays verbatim and is quoted at emit instead.
          name: po.in === 'path' ? (placeholderIds.get(name) ?? ident(name)) : name,
          type: toType(paramSchema(po), sub(pAt, 'schema'), ctx),
          // A path parameter is always required, whatever the spec claims.
          required: po.in === 'path' ? true : po.required === true,
          doc: str(po.description),
          deprecated: po.deprecated === true ? true : undefined,
          example: exampleOf(po, paramSchema(po)),
          ...(po.in === 'query' ? queryStyle(po) : {}),
        })
      }
      // Operation- and path-level `servers` override the document's (Box's
      // uploads go to upload.box.com, not api.box.com). They were ignored.
      const ownServers = arr(op.servers).length > 0 ? arr(op.servers) : arr(item.servers)
      const ownBase = ownServers.length > 0 ? serverUrl(obj(ownServers[0]), sub(at, 'servers', 0), ctx, ctx.sourceUrl) : ''
      noteOperation(op, at, spec, globalSecurity, ctx)
      const irOp: IrOperation = {
        id,
        method,
        baseUrl: ownBase !== '' && ownBase !== ctx.baseUrl ? ownBase : undefined,
        path: toPyreonPath(rawPath, placeholderIds),
        tag: tagNames.get(str(arr(op.tags)[0]) ?? 'default') as string,
        summary: str(op.summary) ?? str(op.description),
        description: str(op.summary) && str(op.description) !== str(op.summary) ? str(op.description) : undefined,
        deprecated: op.deprecated === true ? true : undefined,
        externalDocs: externalDocsOf(op.externalDocs),
        pathParams: withUndeclaredPathParams(pathParams, placeholders, placeholderIds),
        queryParams,
        headerParams,
        cookieParams,
        body: bodyOf(method, op, at, ctx),
        ...responseOf(op, at, ctx),
        ...paginationOf(op['x-pyreon-pagination'], at, ctx),
      }
      ctx.opAt.set(irOp, at)
      ops.push(irOp)
    }
  }
  return ops
}

/**
 * Notes for what an operation declares and the generated call does not carry:
 * extra tags and a security requirement.
 */
function noteOperation(op: Json, at: string, spec: Json, globalSecurity: boolean, ctx: Ctx): void {
  const tags = arr(op.tags).filter((t): t is string => typeof t === 'string' && t.length > 0)
  if (tags.length > 1) {
    ctx.notes.push({
      code: 'extra-tags',
      at: sub(at, 'tags'),
      message: `grouped under its first tag \`${tags[0]}\` only; also tagged ${tags.slice(1).map((t) => `\`${t}\``).join(', ')}.`,
    })
  }
  // An EXPLICIT operation-level requirement, or the document's global one.
  // `security: []` on an operation opts out of the global requirement.
  const opSecurity = Array.isArray(op.security) ? op.security : undefined
  const required = opSecurity ?? (globalSecurity ? arr(spec.security) : [])
  const schemes = [...new Set(required.flatMap((r) => Object.keys(obj(r) ?? {})))]
    .filter((n) => !ctx.appliedSecurity?.has(n))
    .sort()
  if (schemes.length > 0 && opSecurity) {
    ctx.notes.push({
      code: 'unsupported-security',
      at: sub(at, 'security'),
      message: `requires ${schemes.map((n) => `\`${n}\``).join(' or ')}, which the generated client has no helper for — add the credential with your own \`configureApi({ use })\` middleware.`,
    })
  }
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
  // A QUERY parameter's style/explode is HONOURED (the endpoint's
  // `queryStyle`, audit B2), so only a style the client has no serializer for
  // is a loss there. A path segment is always `simple`.
  const honoured = where === 'query' && QUERY_STYLES.some((q) => q === (style ?? 'form'))
  if (!honoured && style && style !== defaultStyle) odd.push(`style: ${style}`)
  if (!honoured && explode !== undefined && explode !== defaultExplode) odd.push(`explode: ${explode}`)
  if (po.allowReserved === true) odd.push('allowReserved: true')
  if (odd.length === 0) return
  ctx.notes.push({
    code: 'parameter-serialization',
    at,
    message: `${where} parameter \`${name}\` declares ${odd.join(', ')}; the generated client does not serialize that, which the server may not parse.`,
  })
}

/**
 * Note every security scheme, and the global requirement.
 *
 * Lathe applies none of them, so the generated client sends no credentials.
 * That is a loss worth leading with: every protected operation fails with a
 * 401 against a client that compiled cleanly.
 */
function noteSecurity(spec: Json, supported: readonly IrSecurityScheme[], ctx: Ctx): void {
  const applied = new Set(supported.map((sc) => sc.name))
  const global = arr(spec.security)
  const names = [...new Set(global.flatMap((r) => Object.keys(obj(r) ?? {})))].sort()
  const unapplied = names.filter((n) => !applied.has(n))
  if (unapplied.length > 0) {
    ctx.notes.push({
      code: 'unsupported-security',
      at: '#/security',
      message: `every operation requires ${unapplied.map((n) => `\`${n}\``).join(' or ')} unless it opts out; the generated client has no helper for ${unapplied.length > 1 ? 'those schemes' : 'that scheme'}, so add the credential with your own \`configureApi({ use })\` middleware.`,
    })
  }
}

function collectSecuritySchemes(spec: Json, ctx: Ctx): IrSecurityScheme[] {
  const schemes = obj(obj(spec.components)?.securitySchemes) ?? {}
  const out: IrSecurityScheme[] = []
  for (const key of Object.keys(schemes).sort()) {
    const at = `#/components/securitySchemes/${key}`
    const sc = obj(deref(schemes[key], at, ctx))
    if (!sc) continue
    const doc = str(sc.description)
    const type = str(sc.type)
    const scheme = str(sc.scheme)?.toLowerCase()
    if (type === 'http' && scheme === 'basic') {
      out.push({ name: key, kind: 'basic', doc })
    } else if ((type === 'http' && scheme === 'bearer') || type === 'oauth2' || type === 'openIdConnect') {
      out.push({ name: key, kind: 'bearer', doc })
    } else if (type === 'apiKey' && (sc.in === 'header' || sc.in === 'query' || sc.in === 'cookie') && str(sc.name)) {
      out.push({ name: key, kind: 'apiKey', in: sc.in, param: str(sc.name) as string, doc })
    } else {
      ctx.notes.push({
        code: 'unsupported-security',
        at,
        message: `security scheme \`${key}\` (${type ?? 'no type'}${scheme ? ` ${scheme}` : ''}) has no generated helper — apply it with your own middleware via \`configureApi({ use })\`.`,
      })
    }
  }
  return out
}

/**
 * The `x-pyreon-pagination` operation extension (audit E3) — the same shape
 * as the `pagination` config entry. Malformed input is NOTED and ignored:
 * a wrong pagination declaration produces a hook that loops or stops early,
 * which is worse than no hook.
 */
function paginationOf(raw: unknown, at: string, ctx: Ctx): Pick<IrOperation, 'pagination'> {
  if (raw === undefined) return {}
  const parsed = parsePagination(raw)
  if (typeof parsed === 'string') {
    ctx.notes.push({ code: 'invalid-pagination', at: `${at}/x-pyreon-pagination`, message: parsed })
    return {}
  }
  return { pagination: parsed }
}

/** Parse a pagination declaration, or return why it is invalid. */
export function parsePagination(raw: unknown): IrPagination | string {
  const o = obj(raw)
  if (!o) return 'x-pyreon-pagination must be an object.'
  const param = str(o.param)
  if (!param) return 'pagination needs `param` — the query parameter that advances the page.'
  const hasMore = str(o.hasMore)
  const path = (v: unknown): string => (typeof v === 'string' ? v : '')
  switch (o.kind) {
    case 'cursor':
      if (typeof o.next !== 'string') return 'cursor pagination needs `next` — the response path holding the next cursor.'
      return { kind: 'cursor', param, next: o.next, hasMore }
    case 'lastItem':
      if (!str(o.field)) return 'lastItem pagination needs `field` — the item property that is the next cursor.'
      return { kind: 'lastItem', param, items: path(o.items), field: str(o.field) as string, hasMore }
    case 'offset':
    case 'page':
      return {
        kind: o.kind,
        param,
        items: path(o.items),
        hasMore,
        initial: num(o.initial),
      }
    default:
      return `pagination \`kind\` must be one of cursor, lastItem, offset, page (got ${JSON.stringify(o.kind)}).`
  }
}

const QUERY_STYLES = ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'] as const

/** A query parameter's `style` / `explode`, when the spec states them (audit B2). */
function queryStyle(po: Json): Pick<IrParam, 'style' | 'explode'> {
  const out: Pick<IrParam, 'style' | 'explode'> = {}
  const style = QUERY_STYLES.find((s) => s === po.style)
  if (style) out.style = style
  if (typeof po.explode === 'boolean') out.explode = po.explode
  return out
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

/**
 * `/users/{id}` -> `/users/:id`, the shape `@pyreon/http` declares.
 *
 * A LITERAL colon in the spec path is escaped to `\\:` first (audit A11).
 * `@pyreon/http` reads `:name` as a parameter anywhere in a segment, so a
 * Google-style custom verb — `/v1/{name}:cancel` — otherwise declared a second
 * parameter `cancel` the caller could never supply, and the request threw.
 */
function toPyreonPath(path: string, ids: ReadonlyMap<string, string>): string {
  return path
    .replace(/:/g, '\\:')
    .replace(/\{([^}]+)\}/g, (_m, name: string) => `:${ids.get(name) ?? ident(name)}`)
}

/**
 * OpenAPI §Parameter Object: a header parameter named `Accept`,
 * `Content-Type` or `Authorization` SHALL be ignored -- the media type and the
 * security scheme own those.
 */
const IGNORED_HEADERS = new Set(['accept', 'content-type', 'authorization'])

/**
 * A parameter's schema. A parameter may declare `content` (one media type
 * carrying the schema) instead of `schema`; that used to type silently as
 * `string`.
 */
function paramSchema(po: Json): Json {
  const direct = obj(po.schema)
  if (direct) return direct
  const content = obj(po.content)
  const first = content ? obj(content[Object.keys(content)[0] ?? '']) : undefined
  return obj(first?.schema) ?? { type: 'string' }
}

/**
 * A `{placeholder}` the path uses but no parameter declares still has to be
 * supplied -- the runtime throws on a missing one. It is typed `string`, the
 * only honest reading of a path segment.
 */
function withUndeclaredPathParams(
  declared: IrParam[],
  placeholders: readonly string[],
  ids: ReadonlyMap<string, string>,
): IrParam[] {
  const have = new Set(declared.map((p) => p.name))
  const out = [...declared]
  for (const ph of placeholders) {
    const id = ids.get(ph) ?? ident(ph)
    if (have.has(id)) continue
    have.add(id)
    out.push({ name: id, type: { kind: 'string' }, required: true, doc: undefined })
  }
  return out
}

/** The base media type, lowercased, without parameters: `application/json`. */
function baseMediaType(mediaType: string): string {
  return (mediaType.split(';')[0] ?? '').trim().toLowerCase()
}

/**
 * Classify a media type. JSON is any `…/json` or `…+json`, WITH parameters
 * (`application/json; charset=utf-8` was classed non-JSON, so k8s's 70
 * responses typed as `unknown`), and `*\/*` -- a schema under "anything"
 * is still described as JSON.
 */
function encodingOf(mediaType: string): BodyEncoding {
  const base = baseMediaType(mediaType)
  if (base === '*/*' || base.endsWith('/json') || base.endsWith('+json')) return 'json'
  if (base === 'application/x-www-form-urlencoded') return 'form'
  if (base.startsWith('multipart/')) return 'multipart'
  if (base.startsWith('text/')) return 'text'
  return 'binary'
}

/** Preference order when a body offers several media types. */
const ENCODING_RANK: Readonly<Record<BodyEncoding, number>> = { json: 0, form: 1, multipart: 2, text: 3, binary: 4 }

/**
 * The request body (audit A11b honours `required`). A body on GET / HEAD is
 * DROPPED with a note: `fetch` rejects it outright (`Request with GET/HEAD
 * method cannot have body`), so a call that satisfied the old type could not
 * run — and Stripe alone declares 273 of them, each with an empty form body.
 */
function bodyOf(method: string, op: Json, at: string, ctx: Ctx): IrBody | undefined {
  const where = sub(at, 'requestBody')
  const rb = obj(deref(op.requestBody, where, ctx))
  if (!rb) return undefined
  if (method === 'GET' || method === 'HEAD') {
    ctx.notes.push({
      code: 'body-on-get',
      at: where,
      message: `${method} declares a requestBody, which fetch refuses to send — the body is dropped from the generated call. Move the data to query parameters in the spec.`,
    })
    return undefined
  }
  const required = rb.required === true
  const content = obj(rb.content)
  if (!content) return undefined
  const keys = Object.keys(content)
  if (keys.length === 0) return undefined
  const mediaType = [...keys].sort((a, b) => ENCODING_RANK[encodingOf(a)] - ENCODING_RANK[encodingOf(b)])[0] as string
  const encoding = encodingOf(mediaType)
  if (keys.length > 1) {
    ctx.notes.push({
      code: 'multiple-content-types',
      at: sub(where, 'content'),
      message: `${keys.length} media types (${keys.join(', ')}) — generated code sends ${mediaType}.`,
    })
  }
  const media = obj(content[mediaType]) ?? {}
  const schema = obj(media.schema)
  if (encoding === 'text') return { mediaType, encoding, required, type: { kind: 'string' } }
  if (encoding === 'binary') return { mediaType, encoding, required, type: { kind: 'string', format: 'binary' } }
  const example = exampleOf(media, schema)
  const type = schema ? toType(schema, sub(where, 'content', mediaType, 'schema'), ctx) : { kind: 'unknown' as const, reason: 'no schema' }
  return {
    mediaType,
    encoding,
    required,
    type,
    fieldEncoding: encoding === 'form' ? fieldEncodingOf(obj(media.encoding)) : undefined,
    ...(example !== undefined ? { example } : {}),
  }
}

/**
 * The example a parameter or media type carries, in OpenAPI's precedence:
 * its own `example`, then the first `examples` entry's inline `value`, then
 * the schema's `example`. A `$ref`'d or `externalValue` example is skipped
 * rather than fetched -- the generator reads one document.
 *
 * Only JSON values survive: the result is emitted into source (`@example`,
 * preview args), and a YAML date or a function-typed value has no literal.
 */
function exampleOf(holder: Json, schema: Json | undefined): unknown {
  if (holder.example !== undefined) return jsonValue(holder.example)
  const examples = obj(holder.examples)
  if (examples) {
    for (const key of Object.keys(examples)) {
      const entry = obj(examples[key])
      if (entry && entry.$ref === undefined && entry.value !== undefined) return jsonValue(entry.value)
    }
  }
  return schema?.example !== undefined ? jsonValue(schema.example) : undefined
}

/** `value` when it round-trips through JSON unchanged in kind, else `undefined`. */
function jsonValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const items = value.map(jsonValue)
    return items.some((v) => v === undefined) ? undefined : items
  }
  if (typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const j = jsonValue(v)
      if (j === undefined) return undefined
      out[k] = j
    }
    return out
  }
  return undefined
}

/** `externalDocs` with an http(s) URL; anything else is not a link worth emitting. */
function externalDocsOf(value: unknown): { url: string; description?: string | undefined } | undefined {
  const ed = obj(value)
  const url = ed ? str(ed.url) : undefined
  if (!ed || !url || !/^https?:\/\//.test(url)) return undefined
  return { url, description: str(ed.description) }
}

/** A form body's `encoding` map, reduced to style/explode per property. */
function fieldEncodingOf(encoding: Json | undefined): Record<string, IrFieldEncoding> | undefined {
  if (!encoding) return undefined
  const out: Record<string, IrFieldEncoding> = {}
  const styles = new Set(['form', 'deepObject', 'spaceDelimited', 'pipeDelimited'])
  for (const key of Object.keys(encoding).sort()) {
    const e = obj(encoding[key])
    if (!e) continue
    const style = typeof e.style === 'string' && styles.has(e.style) ? (e.style as IrFieldEncoding['style']) : undefined
    const explode = typeof e.explode === 'boolean' ? e.explode : undefined
    if (style !== undefined || explode !== undefined) out[key] = { style, explode }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function responseOf(op: Json, at: string, ctx: Ctx): Pick<IrOperation, 'response' | 'responseMedia'> {
  const responses = obj(op.responses)
  if (!responses) return {}
  const rAt = sub(at, 'responses')
  // First 2xx wins, numerically, so `200` beats `201` deterministically. A
  // `2XX` RANGE counts too, after the explicit codes (OpenAPI: an explicit
  // code takes precedence over the range); ignoring it typed the response
  // `void` and the generated call discarded the body.
  const keys = Object.keys(responses)
  const successes = [...keys.filter((k) => /^2\d\d$/.test(k)).sort(), ...keys.filter((k) => /^2XX$/i.test(k))]
  const ok = successes[0]
  const chosen = ok ?? (responses.default !== undefined ? 'default' : undefined)

  // What the typed result does NOT carry. Each is a response the spec
  // describes and the generated call cannot surface: a different success
  // shape, or an error body that reaches the caller as an untyped rejection.
  const withBody = (k: string): boolean => Object.keys(obj(obj(deref(responses[k], sub(rAt, k), ctx))?.content) ?? {}).length > 0
  const others = successes.slice(1).filter(withBody)
  if (others.length > 0) {
    ctx.notes.push({
      code: 'other-success-responses',
      at: rAt,
      message: `only \`${ok}\` is typed; the ${others.map((k) => `\`${k}\``).join(', ')} response${others.length > 1 ? 's are' : ' is'} decoded as if ${others.length > 1 ? 'they were' : 'it were'} \`${ok}\`.`,
    })
  }
  const errors = keys
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

  if (!chosen) return {}
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
  if (!content) return {}
  return pickResponseContent(content, cAt, ctx)
}

/**
 * Choose a response media type.
 *
 * JSON wins when present. When it is not, the choice is REPORTED — a generated
 * client that silently decodes `text/csv` as JSON fails at runtime, far from
 * the spec line that caused it.
 */
function pickResponseContent(content: Json, at: string, ctx: Ctx): Pick<IrOperation, 'response' | 'responseMedia'> {
  const keys = Object.keys(content)
  const json = keys.find((k) => encodingOf(k) === 'json')
  if (!json) {
    // A non-JSON response is not a LOSS (audit B4): the client decodes it as
    // text, a Blob or a stream by media type. Noted only when a choice was made.
    const first = keys[0]
    if (!first) return {}
    if (keys.length > 1) {
      ctx.notes.push({
        code: 'multiple-content-types',
        at: sub(at, 'content'),
        message: `no JSON media type (found ${keys.join(', ')}) — the client decodes \`${first}\`.`,
      })
    }
    return { response: { kind: 'unknown', reason: `media type ${first}` }, responseMedia: first }
  }
  if (keys.length > 1) {
    ctx.notes.push({
      code: 'multiple-content-types',
      at: sub(at, 'content'),
      message: `${keys.length} media types (${keys.join(', ')}) — generated code uses ${json}.`,
    })
  }
  const schema = obj(obj(content[json])?.schema)
  return {
    response: schema ? toType(schema, sub(at, 'content', json, 'schema'), ctx) : { kind: 'unknown', reason: 'no schema' },
  }
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
  if (ref) {
    // 3.1 gives `$ref` siblings meaning (JSON Schema 2020-12: a `$ref` is one
    // more assertion, not a replacement), and 3.0 authors write them anyway:
    // `{ $ref: Name, maxLength: 20 }`, `{ $ref: Base, required: [id] }`.
    // Ignoring them (what happened before) dropped the constraint. A `$ref`
    // with CONSTRAINING siblings is the allOf of the two; annotation-only
    // siblings (description, readOnly, nullable, …) are read where they
    // always were and leave the plain reference -- and its model name -- alone.
    const siblings = constrainingSiblings(schema)
    if (!siblings) return refType(ref, schema, at, ctx)
    return mergeParts(
      [
        { type: refType(ref, schema, at, ctx), required: [] },
        { type: toTypeNonNull(siblings, at, ctx), required: stringList(siblings.required) },
      ],
      at,
      ctx,
    )
  }

  // allOf: merge object members. This is how specs express inheritance, and
  // flattening is the only representation the targets have.
  const allOf = arr(schema.allOf)
  if (allOf.length > 0) return mergeAllOf(allOf, schema, at, ctx)

  // An EMPTY `oneOf`/`anyOf` falls through to the type switch and lands on
  // `unknown` anyway, which is safe -- but silently. A spec that declares a
  // union of nothing is worth saying out loud.
  const oneOf = arr(schema.oneOf)
  const anyOf = arr(schema.anyOf)
  const declaredUnion = Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)
  if (declaredUnion && oneOf.length === 0 && anyOf.length === 0) {
    ctx.notes.push({ code: 'unsupported-schema', at, message: 'empty oneOf/anyOf - typed as unknown.' })
    return { kind: 'unknown', reason: 'empty union' }
  }
  if (oneOf.length > 0 || anyOf.length > 0) {
    // The WIRE name. It was `ident()`-ed, which turned `pet_type` into
    // `petType` -- a key no member has, so `s.discriminatedUnion` threw at
    // module import in dev and made every member unreachable in production.
    const discriminator = str(obj(schema.discriminator)?.propertyName)
    const unions: IrType[] = []
    if (oneOf.length > 0) {
      unions.push({ kind: 'union', options: oneOf.map((o, i) => toType(obj(o) ?? {}, sub(at, 'oneOf', i), ctx)), discriminator })
    }
    if (anyOf.length > 0) {
      unions.push({
        kind: 'union',
        options: anyOf.map((o, i) => toType(obj(o) ?? {}, sub(at, 'anyOf', i), ctx)),
        discriminator: oneOf.length > 0 ? undefined : discriminator,
      })
    }
    // Properties NEXT TO the union are shared by every member (GitHub 14,
    // OpenAI 2), and a schema with both `oneOf` and `anyOf` must satisfy both.
    // Each was silently dropped; both are an allOf of their parts, so they
    // take the same merge.
    const base = siblingObject(schema)
    if (unions.length === 1 && !base) return unions[0] as IrType
    if (unions.length === 1 && base) {
      // Merge per member from the RAW member, so a member that only adds
      // `required: [x]` to the shared properties keeps that requirement.
      const baseType = toTypeNonNull(base, at, ctx)
      const members = oneOf.length > 0 ? oneOf : anyOf
      const union = unions[0] as Extract<IrType, { kind: 'union' }>
      return {
        kind: 'union',
        options: members.map((m, i) =>
          mergeParts(
            [
              { type: baseType, required: [] },
              { type: union.options[i] as IrType, required: stringList(obj(m)?.required) },
            ],
            at,
            ctx,
          ),
        ),
        discriminator: union.discriminator,
      }
    }
    const parts: MergePart[] = []
    if (base) parts.push({ type: toTypeNonNull(base, at, ctx), required: stringList(schema.required) })
    for (const u of unions) parts.push({ type: u, required: [] })
    return mergeParts(parts, at, ctx)
  }

  // `const` (3.1) and `enum` are both a closed set of values, so they share a
  // kind. A `const` is the 3.1 spelling of a discriminator tag; typing it
  // `unknown` (what happened before) accepted any value at all.
  if ('const' in schema) {
    const v = schema.const
    if (isLiteral(v)) return enumOf([v])
    ctx.notes.push({
      code: 'unsupported-const',
      at: sub(at, 'const'),
      message: `\`const: ${JSON.stringify(v)}\` is not a JSON scalar, so it is not enforced — typed as unknown.`,
    })
    return { kind: 'unknown', reason: 'non-scalar const' }
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
      if (schema.format === 'int64') ctx.int64At.add(at)
      return numberType(schema, t === 'integer')
    case 'boolean':
      return { kind: 'boolean' }
    case 'array': {
      const items = obj(schema.items)
      return {
        kind: 'array',
        items: items ? toType(items, sub(at, 'items'), ctx) : { kind: 'unknown', reason: 'array without items' },
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
          return { kind: 'object', fields: [], additional: toType(ap as Json, sub(at, 'additionalProperties'), ctx) }
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

/**
 * Keywords next to a `$ref` that ANNOTATE rather than constrain. They are read
 * elsewhere (a property's description, readOnly, nullable, deprecated) or not at
 * all, and never turn a named reference into an inline merge.
 */
const REF_ANNOTATIONS = new Set([
  '$ref', 'description', 'title', 'summary', 'example', 'examples', 'default', 'deprecated',
  'readOnly', 'writeOnly', 'nullable', 'externalDocs', 'xml', '$comment', '$id', '$schema', '$anchor',
  // A bare `type` restating the target's own kind constrains nothing new.
  'type',
])

/** The constraining keywords next to a `$ref`, as a schema, or undefined. */
function constrainingSiblings(schema: Json): Json | undefined {
  const rest: Json = {}
  for (const [k, v] of Object.entries(schema)) {
    if (REF_ANNOTATIONS.has(k) || k.startsWith('x-')) continue
    rest[k] = v
  }
  if (Object.keys(rest).length === 0) return undefined
  if (typeof schema.type === 'string' || Array.isArray(schema.type)) rest.type = schema.type
  return rest
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

/**
 * One note for every `format: int64` number in the spec.
 *
 * A JSON number past 2^53 - 1 is ROUNDED by `JSON.parse`, before any schema
 * runs, so no generated type can recover it: mapping the field to `bigint` or a
 * string validates a value that is already wrong. The honest fix lives at parse
 * time (a reviver, or the server sending the id as a string), so this is
 * reported, not papered over. Aggregated because an int64-heavy spec would
 * otherwise bury every other loss under hundreds of identical lines.
 */
function noteInt64(ctx: Ctx): void {
  if (ctx.int64At.size === 0) return
  const all = [...ctx.int64At]
  const first = all[0] as string
  const more = all.length > 1 ? ` (and ${all.length - 1} more)` : ''
  ctx.notes.push({
    code: 'int64-precision',
    at: first,
    message: `${all.length} \`format: int64\` number${all.length === 1 ? '' : 's'}${more} — JSON.parse rounds any value past 2^53 - 1 (9007199254740991) before validation runs, so such values arrive silently rounded. Typed as \`number\`; a \`bigint\` or string mapping would validate an already-wrong value. If the API can exceed that range, have it send the value as a string.`,
  })
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
      type: toType(p, sub(at, 'properties', key), ctx),
      required: required.has(key),
      doc: str(p.description) ?? str(p.title),
      example: p.example,
      deprecated: p.deprecated === true ? true : undefined,
      readOnly: p.readOnly === true ? true : undefined,
      writeOnly: p.writeOnly === true ? true : undefined,
    })
  }
  return out
}

/** One operand of an `allOf`-style merge. */
interface MergePart {
  type: IrType
  /** A part's own `required` list -- `{ required: [x] }` has no properties at all. */
  required: readonly string[]
}

function stringList(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string')
}

/** The object-shaped siblings of a union or allOf, as a schema, if any. */
function siblingObject(schema: Json): Json | undefined {
  if (!obj(schema.properties) && schema.additionalProperties === undefined) return undefined
  return {
    type: 'object',
    properties: schema.properties,
    required: schema.required,
    additionalProperties: schema.additionalProperties,
  }
}

function mergeAllOf(parts: unknown[], self: Json, at: string, ctx: Ctx): IrType {
  const merged: MergePart[] = parts.map((p, i) => {
    const raw = obj(p) ?? {}
    return { type: toType(raw, sub(at, 'allOf', i), ctx), required: stringList(raw.required) }
  })
  // Properties / required / additionalProperties declared ALONGSIDE the allOf
  // are one more part. A sibling `oneOf` is one more part too.
  const own = siblingObject(self)
  if (own) merged.push({ type: toTypeNonNull(own, at, ctx), required: [] })
  else if (Array.isArray(self.required)) merged.push({ type: { kind: 'unknown', reason: 'constraint only' }, required: stringList(self.required) })
  if (arr(self.oneOf).length > 0 || arr(self.anyOf).length > 0) {
    const { allOf: _allOf, properties: _p, required: _r, additionalProperties: _a, ...union } = self
    merged.push({ type: toTypeNonNull(union, at, ctx), required: [] })
  }
  return mergeParts(merged, at, ctx)
}

/** Resolve a part through refs; a cyclic one contributes nothing. */
function resolvePart(t: IrType, at: string, ctx: Ctx): { type: IrType; nullable: boolean } | undefined {
  if (t.kind === 'nullable') {
    const inner = resolvePart(t.inner, at, ctx)
    return inner ? { type: inner.type, nullable: true } : undefined
  }
  if (t.kind === 'ref') {
    const key = ctx.modelKeys.get(t.name)
    if (key !== undefined) {
      const target = modelType(key, ctx)
      if (target) return resolvePart(target, at, ctx)
      // Still being converted: an allOf CYCLE. A schema that is "all of
      // itself and X" is just X, so the cyclic part contributes nothing.
      ctx.notes.push({
        code: 'cyclic-ref',
        at,
        message: `allOf reaches \`${t.name}\` again while merging it — the cyclic part contributes no fields.`,
      })
      return undefined
    }
    const hoisted = ctx.extraModels.find((m) => m.name === t.name)
    if (hoisted) return resolvePart(hoisted.type, at, ctx)
  }
  return { type: t, nullable: false }
}

/** How many merged shapes a union distribution may produce before it gives up. */
const MAX_DISTRIBUTION = 64

/**
 * Merge the operands of an `allOf` (or a union with sibling properties).
 *
 * The previous flattening kept the FIRST declaration of each field and dropped
 * everything it could not flatten, silently:
 *
 *  - a required-only refinement (`allOf: [{$ref: Base}, {required: [x]}]`)
 *    left `x` optional -- `required` is now the union over every part;
 *  - a later part refining a field (`status: string` -> `status: enum`) lost
 *    the refinement -- the more specific type now wins;
 *  - a part that is itself a `oneOf` vanished whenever any fields existed --
 *    it now DISTRIBUTES: `A ∧ (B ∨ C)` is `(A ∧ B) ∨ (A ∧ C)`, keeping the
 *    discriminator;
 *  - sibling `additionalProperties` / nullability were dropped.
 */
function mergeParts(parts: readonly MergePart[], at: string, ctx: Ctx): IrType {
  const resolved: { type: IrType; nullable: boolean; required: readonly string[] }[] = []
  for (const p of parts) {
    const r = resolvePart(p.type, at, ctx)
    resolved.push(r ? { ...r, required: p.required } : { type: { kind: 'unknown', reason: 'cyclic' }, nullable: false, required: p.required })
  }
  // `null` satisfies every part only if every CONSTRAINING part admits it.
  const constraining = resolved.filter((r) => r.type.kind !== 'unknown')
  const admitsNull = constraining.length > 0 && constraining.every((r) => r.nullable)

  const unionAt = resolved.findIndex((r) => r.type.kind === 'union')
  let result: IrType
  if (unionAt !== -1) {
    const union = resolved[unionAt]?.type as Extract<IrType, { kind: 'union' }>
    const rest = resolved.filter((_, i) => i !== unionAt)
    const width = resolved.reduce((n, r) => n * (r.type.kind === 'union' ? r.type.options.length : 1), 1)
    if (width > MAX_DISTRIBUTION) {
      ctx.notes.push({
        code: 'unsupported-schema',
        at,
        message: `merging these parts would expand to ${width} shapes — kept the first union's members without the other constraints.`,
      })
      result = union
    } else {
      // The union's members come AFTER the shared parts, so a member's own
      // refinement of a shared field (its discriminator tag) is what survives.
      const options = union.options.map((member) =>
        mergeParts(
          [...rest.map((r) => ({ type: r.nullable ? nullable(r.type) : r.type, required: r.required })), { type: member, required: [] }],
          at,
          ctx,
        ),
      )
      result = { kind: 'union', options, discriminator: union.discriminator }
    }
  } else {
    result = mergeObjects(resolved, at, ctx)
  }
  return admitsNull ? nullable(result) : result
}

function mergeObjects(
  parts: readonly { type: IrType; required: readonly string[] }[],
  at: string,
  ctx: Ctx,
): IrType {
  const objects = parts.filter((p) => p.type.kind === 'object')
  const values = parts.filter((p) => p.type.kind !== 'object' && p.type.kind !== 'unknown')
  if (objects.length === 0) {
    if (values.length === 0) return { kind: 'unknown', reason: 'allOf of unconstrained parts' }
    const first = (values[0] as { type: IrType }).type
    if (!values.every((v) => v.type.kind === first.kind)) {
      // `string ∧ integer` accepts nothing; keeping the first part keeps the
      // generated schema usable, and the note says the spec is contradictory.
      ctx.notes.push({ code: 'unsupported-schema', at, message: 'allOf of incompatible non-object schemas — kept the first.' })
      return first
    }
    return values.slice(1).reduce((acc, v) => refineType(acc, v.type), first)
  }
  if (values.length > 0) {
    ctx.notes.push({
      code: 'unsupported-schema',
      at,
      message: `allOf mixes object and non-object parts (${values.map((v) => v.type.kind).join(', ')}) — the non-object parts are dropped.`,
    })
  }
  const fields = new Map<string, IrField>()
  let additional: IrType | undefined
  for (const p of objects) {
    const o = p.type as Extract<IrType, { kind: 'object' }>
    for (const f of o.fields) {
      const prev = fields.get(f.name)
      fields.set(
        f.name,
        prev
          ? {
              ...prev,
              ...f,
              type: refineType(prev.type, f.type),
              required: prev.required || f.required,
              doc: f.doc ?? prev.doc,
              example: f.example ?? prev.example,
            }
          : f,
      )
    }
    if (o.additional !== undefined) additional = o.additional
  }
  const required = new Set(parts.flatMap((p) => p.required))
  const out = [...fields.values()].map((f) => (required.has(f.name) && !f.required ? { ...f, required: true } : f))
  return { kind: 'object', fields: out, additional }
}

/**
 * Two declarations of one value, the second refining the first. The more
 * SPECIFIC wins: an enum over a plain scalar, anything over `unknown`, and the
 * tighter bound of two constraints of the same kind.
 */
function refineType(a: IrType, b: IrType): IrType {
  if (a.kind === 'unknown') return b
  if (b.kind === 'unknown') return a
  if (a.kind === 'enum' && (b.kind === 'string' || b.kind === 'number' || b.kind === 'boolean')) return a
  if (b.kind === 'enum') return b
  if (a.kind === 'string' && b.kind === 'string') {
    return {
      kind: 'string',
      format: b.format ?? a.format,
      minLength: maxOf(a.minLength, b.minLength),
      maxLength: minOf(a.maxLength, b.maxLength),
      pattern: b.pattern ?? a.pattern,
    }
  }
  if (a.kind === 'number' && b.kind === 'number') {
    return {
      kind: 'number',
      integer: a.integer || b.integer,
      minimum: maxOf(a.minimum, b.minimum),
      maximum: minOf(a.maximum, b.maximum),
      exclusiveMinimum: maxOf(a.exclusiveMinimum, b.exclusiveMinimum),
      exclusiveMaximum: minOf(a.exclusiveMaximum, b.exclusiveMaximum),
      multipleOf: b.multipleOf ?? a.multipleOf,
    }
  }
  return b
}

function maxOf(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined ? b : b === undefined ? a : Math.max(a, b)
}
function minOf(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined ? b : b === undefined ? a : Math.min(a, b)
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
  return `#/${segments.map((seg) => String(seg).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
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
/** A non-negative integer count (`minLength`, `minItems`, …). */
function count(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
}
