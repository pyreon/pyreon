/**
 * Swagger 2.0 -> OpenAPI 3.0, in process.
 *
 * Every mainstream generator accepts Swagger 2 (Kubernetes still publishes its
 * canonical description in it), and refusing it -- what Lathe did -- meant a
 * second tool and a second artifact in the user's pipeline just to get to the
 * reader. The rewrite is mechanical for almost everything, so it is done here,
 * on the parsed document, before conversion to the IR. It follows the mapping
 * `swagger2openapi` established (the de-facto reference; its output is what
 * the OpenAPI Initiative's own examples were migrated with):
 *
 *   swagger 2.0                      openapi 3.0
 *   ---------------------------      ------------------------------------------
 *   host + basePath + schemes        servers[] (https first)
 *   definitions                      components.schemas
 *   parameters (in: body)            components.requestBodies
 *   parameters (other)               components.parameters
 *   responses                        components.responses
 *   securityDefinitions              components.securitySchemes
 *   in: body parameter               requestBody, one content entry per `consumes`
 *   in: formData parameters          requestBody with an object schema
 *   type/format/items on a param     param.schema
 *   collectionFormat                 style + explode
 *   response.schema + produces       response.content[<produces>].schema
 *   response.examples                response.content[<mime>].example
 *   x-nullable                       nullable
 *   type: file                       type: string, format: binary
 *   discriminator: "kind"            discriminator: { propertyName: "kind" }
 *
 * What cannot be carried across is reported as a note rather than guessed:
 * `collectionFormat: tsv` has no 3.0 style, per-operation `schemes` have no
 * per-operation `servers` equivalent that preserves the host, and a missing
 * `schemes` is resolved against where the spec came from (Swagger 2 §Schemes
 * says so) or, failing that, assumed `https`.
 *
 * The input document is never mutated: conversion builds a new tree.
 */
import type { IrNote } from '../core/ir'

type Json = Record<string, unknown>

/** The result of an up-conversion: the 3.0 document plus what it could not carry. */
export interface Swagger2Upgrade {
  doc: Json
  notes: IrNote[]
}

/**
 * Whether a parsed document is a Swagger 2.0 description this module can
 * convert. A `swagger: "1.2"` document is NOT one -- its layout is unrelated.
 */
export function isSwagger2(doc: unknown): boolean {
  const d = obj(doc)
  if (!d) return false
  const v = typeof d.swagger === 'number' ? String(d.swagger) : d.swagger
  return typeof v === 'string' && /^2(\.0)?$/.test(v)
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const

/** Keywords of a Swagger 2 non-body parameter that belong in its 3.0 `schema`. */
const PARAM_SCHEMA_KEYS = [
  'type',
  'format',
  'items',
  'default',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'enum',
  'multipleOf',
] as const

/**
 * Convert a Swagger 2.0 document to OpenAPI 3.0.3.
 *
 * `sourceUrl`, when the spec was fetched, supplies the scheme and host a
 * Swagger 2 document omits (they default to "the ones used to access the
 * definition itself").
 *
 * @example
 * const { doc, notes } = upgradeSwagger2(JSON.parse(swaggerText))
 * // doc.openapi === '3.0.3', doc.components.schemas holds the old `definitions`
 */
export function upgradeSwagger2(input: Json, sourceUrl?: string): Swagger2Upgrade {
  const notes: IrNote[] = []
  const cx: Cx = {
    notes,
    input,
    globalConsumes: stringList(input.consumes),
    globalProduces: stringList(input.produces),
    bodyParams: new Set(),
    formParams: new Set(),
    firstScheme: 'https',
  }
  notes.push({
    code: 'swagger2-converted',
    at: '#/swagger',
    message:
      'Swagger 2.0 document converted to OpenAPI 3.0 in process. Pointers in other notes refer to the CONVERTED document (`#/components/schemas/X` was `#/definitions/X`).',
  })

  // Classify global parameters FIRST: a `$ref: '#/parameters/x'` means a
  // request body when `x` is `in: body`, a form field when `in: formData`, and
  // a parameter otherwise -- and the refs are rewritten as they are met.
  const globalParams = obj(input.parameters) ?? {}
  for (const [name, raw] of Object.entries(globalParams)) {
    const p = obj(raw)
    if (p?.in === 'body') cx.bodyParams.add(name)
    else if (p?.in === 'formData') cx.formParams.add(name)
  }

  const out: Json = {}
  for (const [k, v] of Object.entries(input)) {
    if (k.startsWith('x-')) out[k] = v
  }
  out.openapi = '3.0.3'
  out.info = input.info ?? { title: 'API', version: '0.0.0' }
  const servers = serversOf(input, sourceUrl, notes)
  if (servers.length > 0) out.servers = servers
  cx.firstScheme = /^([a-z]+):/i.exec(String(servers[0]?.url ?? ''))?.[1]?.toLowerCase() ?? 'https'
  if (input.tags !== undefined) out.tags = input.tags
  if (input.externalDocs !== undefined) out.externalDocs = input.externalDocs
  if (input.security !== undefined) out.security = input.security

  const components: Json = {}
  const definitions = obj(input.definitions)
  if (definitions) {
    const schemas: Json = {}
    for (const [name, s] of Object.entries(definitions)) schemas[name] = schemaOf(s)
    components.schemas = schemas
  }
  const parameters: Json = {}
  const requestBodies: Json = {}
  for (const [name, raw] of Object.entries(globalParams)) {
    const p = obj(raw)
    if (!p) continue
    if (p.in === 'body') {
      requestBodies[name] = bodyFromParam(p, cx.globalConsumes)
    } else if (p.in !== 'formData') {
      // A global formData parameter has no 3.0 component: form fields become
      // properties of the operation's body schema, so they are inlined at
      // every use site below.
      parameters[name] = paramOf(p, `#/parameters/${esc(name)}`, cx)
    }
  }
  if (Object.keys(parameters).length > 0) components.parameters = parameters
  if (Object.keys(requestBodies).length > 0) components.requestBodies = requestBodies
  const responses = obj(input.responses)
  if (responses) {
    const converted: Json = {}
    for (const [name, r] of Object.entries(responses)) converted[name] = responseOf(r, cx.globalProduces)
    components.responses = converted
  }
  const secDefs = obj(input.securityDefinitions)
  if (secDefs) {
    const schemes: Json = {}
    for (const [name, raw] of Object.entries(secDefs)) {
      const s = securitySchemeOf(obj(raw) ?? {}, `#/securityDefinitions/${esc(name)}`, cx)
      if (s) schemes[name] = s
    }
    components.securitySchemes = schemes
  }
  if (Object.keys(components).length > 0) out.components = components

  const paths: Json = {}
  for (const [path, rawItem] of Object.entries(obj(input.paths) ?? {})) {
    const item = obj(rawItem)
    if (!item) continue
    paths[path] = pathItemOf(item, path, cx)
  }
  out.paths = paths
  return { doc: out, notes }
}

interface Cx {
  notes: IrNote[]
  input: Json
  globalConsumes: string[]
  globalProduces: string[]
  /** Global parameter names that are `in: body`. */
  bodyParams: Set<string>
  /** Global parameter names that are `in: formData`. */
  formParams: Set<string>
  /** The scheme of `servers[0]`, once computed. */
  firstScheme: string
}

/**
 * `host` + `basePath` + `schemes` -> `servers`.
 *
 * `https` is listed first when several schemes are declared: the generated
 * client uses `servers[0]`, and Swagger 2 lists schemes in no meaningful
 * order (Petstore declares `[https, http]`, plenty of specs `[http, https]`).
 */
function serversOf(input: Json, sourceUrl: string | undefined, notes: IrNote[]): Json[] {
  const host = str(input.host)
  const basePath = str(input.basePath) ?? ''
  let source: URL | undefined
  try {
    source = sourceUrl ? new URL(sourceUrl) : undefined
  } catch {
    source = undefined
  }
  if (!host) {
    // "If the host is not included, the host serving the documentation is to
    // be used" -- a RELATIVE server, which the OpenAPI reader resolves against
    // the spec's URL (or reports, when there is none).
    return basePath || source ? [{ url: basePath || '/' }] : []
  }
  let schemes = stringList(input.schemes).filter((s) => /^(https?|wss?)$/i.test(s))
  if (schemes.length === 0) {
    const fromSource = source?.protocol.replace(/:$/, '')
    schemes = [fromSource === 'http' || fromSource === 'https' ? fromSource : 'https']
    if (!fromSource) {
      notes.push({
        code: 'swagger2-lossy',
        at: '#/schemes',
        message: `no \`schemes\` declared, and Swagger 2 then means "the scheme the spec was fetched with", which is unknown here — assumed \`https://${host}\`. Declare \`schemes\`, or pass \`baseUrl\` in the config.`,
      })
    }
  }
  const ordered = [...schemes].sort((a, b) => rank(a) - rank(b))
  return ordered.map((scheme) => ({ url: `${scheme.toLowerCase()}://${host}${basePath === '/' ? '' : basePath}` }))
}

function rank(scheme: string): number {
  return ['https', 'http', 'wss', 'ws'].indexOf(scheme.toLowerCase())
}

function pathItemOf(item: Json, path: string, cx: Cx): Json {
  const out: Json = {}
  const at = `#/paths/${esc(path)}`
  if (item.$ref !== undefined) {
    // A path item `$ref` in Swagger 2 points into another document; carried
    // verbatim, and the OpenAPI reader reports it if it cannot resolve.
    out.$ref = item.$ref
  }
  for (const [k, v] of Object.entries(item)) {
    if (k.startsWith('x-')) out[k] = v
  }
  // Path-level parameters that are NOT body/formData stay path-level; body and
  // form parameters are moved into each operation's requestBody, because 3.0
  // has no path-level body.
  const shared = arr(item.parameters)
  const sharedPlain: unknown[] = []
  const sharedBodyish: unknown[] = []
  for (const p of shared) (isBodyish(p, cx) ? sharedBodyish : sharedPlain).push(p)
  if (sharedPlain.length > 0) {
    out.parameters = sharedPlain.map((p, i) => paramOrRef(p, `${at}/parameters/${i}`, cx))
  }
  for (const method of HTTP_METHODS) {
    const op = obj(item[method])
    if (!op) continue
    out[method] = operationOf(op, sharedBodyish, `${at}/${method}`, cx)
  }
  return out
}

function isBodyish(p: unknown, cx: Cx): boolean {
  const o = obj(p)
  if (!o) return false
  const ref = str(o.$ref)
  if (ref) {
    const name = localName(ref, 'parameters')
    return name !== undefined && (cx.bodyParams.has(name) || cx.formParams.has(name))
  }
  return o.in === 'body' || o.in === 'formData'
}

function operationOf(op: Json, sharedBodyish: readonly unknown[], at: string, cx: Cx): Json {
  const out: Json = {}
  for (const [k, v] of Object.entries(op)) {
    if (k === 'parameters' || k === 'responses' || k === 'consumes' || k === 'produces' || k === 'schemes') continue
    out[k] = v
  }
  // Only a LOSS when it would have changed the URL: the document has a host
  // (with no host every server is relative, so the scheme is the page's) and
  // the scheme the client uses (`servers[0]`, https-first) is not one the
  // operation allows. Kubernetes restates `schemes: [https]` on all 1,202
  // operations; reporting each would bury the real losses.
  const opSchemes = stringList(op.schemes).map((s) => s.toLowerCase())
  if (op.schemes !== undefined && str(cx.input.host) && !opSchemes.includes(cx.firstScheme)) {
    cx.notes.push({
      code: 'swagger2-lossy',
      at: `${at}/schemes`,
      message:
        'per-operation `schemes` have no OpenAPI 3 equivalent that keeps the host — the operation uses the document servers.',
    })
  }
  const consumes = op.consumes !== undefined ? stringList(op.consumes) : cx.globalConsumes
  const produces = op.produces !== undefined ? stringList(op.produces) : cx.globalProduces

  // An operation parameter overrides a path-level one with the same
  // (name, in); applied to the body/form set here because those are merged
  // into ONE requestBody and would otherwise both contribute.
  const own = arr(op.parameters)
  const ownKeys = new Set(own.map((p) => keyOf(resolveParam(p, cx))).filter((k): k is string => k !== undefined))
  const bodyish = [
    ...sharedBodyish.filter((p) => !ownKeys.has(keyOf(resolveParam(p, cx)) ?? '')),
    ...own.filter((p) => isBodyish(p, cx)),
  ]
  const plain = own.filter((p) => !isBodyish(p, cx))
  if (plain.length > 0) out.parameters = plain.map((p, i) => paramOrRef(p, `${at}/parameters/${i}`, cx))

  const body = bodyish.find((p) => resolveParam(p, cx)?.in === 'body')
  const form = bodyish.filter((p) => resolveParam(p, cx)?.in === 'formData')
  if (body !== undefined) {
    const ref = str(obj(body)?.$ref)
    const name = ref ? localName(ref, 'parameters') : undefined
    // A body param shared through `#/parameters/x` becomes a requestBody
    // component ref -- unless this operation `consumes` something other than
    // the global default, in which case its content types differ and it is
    // inlined with the right ones.
    out.requestBody =
      name !== undefined && op.consumes === undefined
        ? { $ref: `#/components/requestBodies/${esc(name)}` }
        : bodyFromParam(resolveParam(body, cx) ?? {}, consumes)
    if (form.length > 0) {
      cx.notes.push({
        code: 'swagger2-lossy',
        at: `${at}/parameters`,
        message: 'declares both an `in: body` parameter and `in: formData` parameters, which Swagger 2 forbids — the form fields are dropped.',
      })
    }
  } else if (form.length > 0) {
    out.requestBody = formBody(
      form.map((p) => resolveParam(p, cx) ?? {}),
      consumes,
      at,
      cx,
    )
  }

  const responses: Json = {}
  for (const [status, r] of Object.entries(obj(op.responses) ?? {})) {
    if (status.startsWith('x-')) {
      responses[status] = r
      continue
    }
    responses[status] = responseOf(r, produces)
  }
  out.responses = responses
  return out
}

/** The parameter a node means: a global `$ref` resolved, otherwise the node. */
function resolveParam(p: unknown, cx: Cx): Json | undefined {
  const o = obj(p)
  if (!o) return undefined
  const ref = str(o.$ref)
  if (!ref) return o
  const name = localName(ref, 'parameters')
  return name !== undefined ? obj(obj(cx.input.parameters)?.[name]) : undefined
}

function keyOf(p: Json | undefined): string | undefined {
  const name = str(p?.name)
  return name !== undefined ? `${String(p?.in)}:${name}` : undefined
}

function paramOrRef(p: unknown, at: string, cx: Cx): unknown {
  const o = obj(p)
  if (!o) return p
  const ref = str(o.$ref)
  if (ref) return { $ref: rewriteRef(ref) }
  return paramOf(o, at, cx)
}

/** A non-body Swagger 2 parameter as a 3.0 Parameter Object. */
function paramOf(p: Json, at: string, cx: Cx): Json {
  const out: Json = {}
  const schema: Json = {}
  for (const [k, v] of Object.entries(p)) {
    if ((PARAM_SCHEMA_KEYS as readonly string[]).includes(k)) continue
    if (k === 'collectionFormat' || k === 'x-nullable') continue
    out[k] = v
  }
  for (const k of PARAM_SCHEMA_KEYS) {
    if (p[k] !== undefined) schema[k] = k === 'items' ? itemsOf(p.items) : p[k]
  }
  if (p['x-nullable'] === true) schema.nullable = true
  if (schema.type === 'file') {
    schema.type = 'string'
    schema.format = 'binary'
  }
  out.schema = schema
  const where = str(p.in)
  const fmt = str(p.collectionFormat)
  if (schema.type === 'array' && fmt !== undefined && where !== undefined) {
    Object.assign(out, collectionStyle(fmt, where, `${at}/collectionFormat`, cx))
  } else if (schema.type === 'array' && where === 'query') {
    // Swagger 2's DEFAULT is `csv` -- a comma-joined single value, i.e. 3.0's
    // `form` with `explode: false`. Leaving it unset would mean 3.0's default,
    // `explode: true` (the key repeated), which a Swagger 2 server did not
    // agree to parse.
    Object.assign(out, { style: 'form', explode: false })
  }
  return out
}

/**
 * `collectionFormat` -> `style` + `explode`, per location. `tsv` has no 3.0
 * style at all, and `ssv`/`pipes` exist only for query parameters.
 */
function collectionStyle(fmt: string, where: string, at: string, cx: Cx): Json {
  if (fmt === 'multi') {
    if (where === 'query' || where === 'formData') return { style: 'form', explode: true }
  } else if (fmt === 'csv') {
    if (where === 'query' || where === 'formData') return { style: 'form', explode: false }
    return { style: 'simple', explode: false }
  } else if (fmt === 'ssv' && where === 'query') {
    return { style: 'spaceDelimited', explode: false }
  } else if (fmt === 'pipes' && where === 'query') {
    return { style: 'pipeDelimited', explode: false }
  }
  cx.notes.push({
    code: 'swagger2-lossy',
    at,
    message: `\`collectionFormat: ${fmt}\` on a ${where} parameter has no OpenAPI 3 style — serialized as the location's default instead.`,
  })
  return {}
}

/** A Swagger 2 `items` object (a restricted schema) as a 3.0 schema. */
function itemsOf(items: unknown): unknown {
  const o = obj(items)
  if (!o) return items
  const out = schemaOf(o) as Json
  delete out.collectionFormat
  return out
}

/** An `in: body` parameter as a 3.0 Request Body Object. */
function bodyFromParam(p: Json, consumes: readonly string[]): Json {
  const schema = schemaOf(p.schema ?? {})
  const types = consumes.length > 0 ? consumes : ['application/json']
  const content: Json = {}
  for (const mt of types) content[mt] = { schema }
  const out: Json = { content }
  if (p.description !== undefined) out.description = p.description
  if (p.required === true) out.required = true
  const name = str(p.name)
  if (name !== undefined && name !== 'body') out['x-codegen-request-body-name'] = name
  return out
}

/**
 * `in: formData` parameters as ONE request body with an object schema.
 *
 * The media type is `multipart/form-data` when the operation consumes it or a
 * field is a file (a file cannot travel url-encoded), otherwise
 * `application/x-www-form-urlencoded` -- Swagger 2's own two options.
 */
function formBody(params: readonly Json[], consumes: readonly string[], at: string, cx: Cx): Json {
  const properties: Json = {}
  const required: string[] = []
  const encoding: Json = {}
  let hasFile = false
  for (const p of params) {
    const name = str(p.name)
    if (name === undefined) continue
    const param = paramOf(p, `${at}/parameters`, cx)
    const schema = { ...obj(param.schema) }
    if (p.type === 'file') hasFile = true
    if (p.description !== undefined) schema.description = p.description
    properties[name] = schema
    if (p.required === true) required.push(name)
    if (param.style !== undefined || param.explode !== undefined) {
      encoding[name] = { style: param.style, explode: param.explode }
    }
  }
  const schema: Json = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  const mediaType =
    hasFile || consumes.includes('multipart/form-data') ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
  const media: Json = { schema }
  if (Object.keys(encoding).length > 0) media.encoding = encoding
  const out: Json = { content: { [mediaType]: media } }
  if (required.length > 0) out.required = true
  return out
}

/** A Swagger 2 Response Object (or `$ref`) as a 3.0 one. */
function responseOf(raw: unknown, produces: readonly string[]): unknown {
  const r = obj(raw)
  if (!r) return raw
  const ref = str(r.$ref)
  if (ref) return { $ref: rewriteRef(ref) }
  const out: Json = { description: str(r.description) ?? '' }
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('x-')) out[k] = v
  }
  const examples = obj(r.examples) ?? {}
  if (r.schema !== undefined) {
    const schema = schemaOf(r.schema)
    const types = produces.length > 0 ? produces : ['application/json']
    const content: Json = {}
    for (const mt of types) {
      const media: Json = { schema }
      if (examples[mt] !== undefined) media.example = examples[mt]
      content[mt] = media
    }
    out.content = content
  }
  const headers = obj(r.headers)
  if (headers) {
    const converted: Json = {}
    for (const [name, h] of Object.entries(headers)) {
      const ho = obj(h) ?? {}
      const header: Json = {}
      if (ho.description !== undefined) header.description = ho.description
      const schema: Json = {}
      for (const k of PARAM_SCHEMA_KEYS) if (ho[k] !== undefined) schema[k] = k === 'items' ? itemsOf(ho.items) : ho[k]
      header.schema = schema
      converted[name] = header
    }
    out.headers = converted
  }
  return out
}

/** A Swagger 2 security definition as a 3.0 security scheme. */
function securitySchemeOf(s: Json, at: string, cx: Cx): Json | undefined {
  const base: Json = {}
  if (s.description !== undefined) base.description = s.description
  if (s.type === 'basic') return { ...base, type: 'http', scheme: 'basic' }
  if (s.type === 'apiKey') return { ...base, type: 'apiKey', name: s.name, in: s.in }
  if (s.type === 'oauth2') {
    const flow = str(s.flow)
    const scopes = obj(s.scopes) ?? {}
    const name =
      flow === 'implicit'
        ? 'implicit'
        : flow === 'password'
          ? 'password'
          : flow === 'application'
            ? 'clientCredentials'
            : flow === 'accessCode'
              ? 'authorizationCode'
              : undefined
    if (!name) {
      cx.notes.push({ code: 'swagger2-lossy', at, message: `unknown oauth2 flow \`${String(flow)}\` — the scheme is dropped.` })
      return undefined
    }
    const f: Json = { scopes }
    if (s.authorizationUrl !== undefined) f.authorizationUrl = s.authorizationUrl
    if (s.tokenUrl !== undefined) f.tokenUrl = s.tokenUrl
    return { ...base, type: 'oauth2', flows: { [name]: f } }
  }
  cx.notes.push({ code: 'swagger2-lossy', at, message: `unknown security type \`${String(s.type)}\` — the scheme is dropped.` })
  return undefined
}

/**
 * A Swagger 2 Schema Object as a 3.0 one: refs rewritten, `x-nullable` and
 * `type: file` translated, a string `discriminator` wrapped. Recursive over
 * every subschema position.
 */
function schemaOf(raw: unknown): unknown {
  const s = obj(raw)
  if (!s) return raw
  const out: Json = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === '$ref' && typeof v === 'string') out.$ref = rewriteRef(v)
    else if (k === 'x-nullable') {
      if (v === true) out.nullable = true
    } else if (k === 'discriminator' && typeof v === 'string') out.discriminator = { propertyName: v }
    else if (k === 'properties' || k === 'definitions' || k === 'patternProperties') {
      const map: Json = {}
      for (const [pk, pv] of Object.entries(obj(v) ?? {})) map[pk] = schemaOf(pv)
      out[k] = map
    } else if (k === 'items' || k === 'additionalProperties' || k === 'not') {
      out[k] = Array.isArray(v) ? v.map((x) => schemaOf(x)) : schemaOf(v)
    } else if (k === 'allOf' || k === 'anyOf' || k === 'oneOf') {
      out[k] = arr(v).map((x) => schemaOf(x))
    } else out[k] = v
  }
  if (out.type === 'file') {
    out.type = 'string'
    out.format = 'binary'
  }
  return out
}

/** A Swagger 2 local `$ref` rewritten to its 3.0 component location. */
function rewriteRef(ref: string): string {
  const m = /^(.*)#\/(definitions|parameters|responses)\/(.+)$/.exec(ref)
  if (!m) return ref
  const [, doc, section, rest] = m as unknown as [string, string, string, string]
  const target = section === 'definitions' ? 'schemas' : section
  return `${doc}#/components/${target}/${rest}`
}

/** The component name of a local `#/<section>/<name>` ref, unescaped. */
function localName(ref: string, section: string): string | undefined {
  const prefix = `#/${section}/`
  if (!ref.startsWith(prefix)) return undefined
  return ref.slice(prefix.length).replace(/~1/g, '/').replace(/~0/g, '~')
}

function esc(seg: string): string {
  return seg.replace(/~/g, '~0').replace(/\//g, '~1')
}

function obj(v: unknown): Json | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function stringList(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === 'string')
}
