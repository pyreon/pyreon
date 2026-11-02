// The `@pyreon/http` endpoint DSL, as the native compiler reads it.
//
// `createHttp({ baseUrl })` and `client.endpoint('GET /users/:id', …)` declare METADATA: they emit
// nothing, but they decide what `useFetch(getUser({ params }))`, `useQuery(() => getUser.query(…))`
// and `useStream((ctx) => openEventStream((c) => getUser(…)))` lower to. This file scans them
// (`scanModule`), keeps them in `fileState`, and resolves a call of one into a concrete request
// (`requestSources`) that the core's `useFetch` and `@pyreon/query`'s hooks consume.

import {
  hasDynamicKey,
  isNullishLiteral,
  literalScalar,
  propName,
  readEntryNodes,
  readJsonLiteral,
  readLiteralEntries,
  readObjectProp,
  topLevelDeclarators,
  unwrapTypeLayers,
  type ExprIR,
  type ModuleScan,
  type ParseContext,
  type ResolvedRequest,
} from '@pyreon/native-compiler/plugin-api'
import { middlewareExpr, middlewareNames, scanClientMiddleware, type ClientMiddleware } from './middleware'
import { scanCallRoles } from './call'
import { encodeForm } from '../body'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/**
 * Sentinel baseUrl for a `createHttp({ baseUrl: <non-literal> })` client — the client is recorded
 * (so its endpoints still register) but any endpoint call against it must stay web, and the
 * resolver names why. The NUL prefix can never collide with a real baseUrl string.
 */
const HTTP_NONLITERAL_BASEURL = '\0__pyreon_nonliteral_baseurl__'

/** What a file's `createHttp` clients and `.endpoint()` bindings recorded (see {@link httpFacts}). */
export interface EndpointDef {
  method: string
  pathTemplate: string
  clientName: string
  paramNames: string[]
  /** Literal `headers` from the endpoint DECLARATION's options — the DEFAULT a per-call `headers` replaces wholesale. */
  declHeaders: Record<string, string>
  /** Declaration options that cannot be lowered, warned at CALL time so an endpoint used only on web stays silent. */
  declUnlowerable: string[]
  /** `'stream'` is what a streamed endpoint is declared with; honoured by `useStream`, WARNED on `useFetch` / `useQuery`. */
  responseType?: string
  /** The `response` schema when it names a same-module schema binding — evidence for the decode type's number fields. */
  responseSchema?: { binding: string; array: boolean }
}

export interface HttpFacts {
  /** Client binding → literal baseUrl (or {@link HTTP_NONLITERAL_BASEURL}). */
  readonly clients: Map<string, string>
  /** Endpoint binding → its declaration. */
  readonly endpoints: Map<string, EndpointDef>
  /** Client binding → its scanned `use: [...]` middleware (absent = none). */
  readonly middleware: Map<string, ClientMiddleware>
}

const FACTS_KEY = '@pyreon/http:facts'

/** The facts this file's scan recorded. Other plugins read them through the request source, never this. */
export function httpFacts(source: { fileState<T>(key: string, init: () => T): T }): HttpFacts {
  return source.fileState<HttpFacts>(FACTS_KEY, () => ({ clients: new Map(), endpoints: new Map(), middleware: new Map() }))
}

/**
 * An endpoint declaration's `response` value, when it names a schema BINDING
 * of this module: `book_schema` or `<prefix>.array(book_schema)`. Anything
 * else (an inline object, a call chain) yields `undefined` — no evidence.
 */
function readResponseSchemaRef(node: AnyNode | undefined): { binding: string; array: boolean } | undefined {
  const v = unwrapTypeLayers(node) as AnyNode | undefined
  if (v?.type === 'Identifier') return { binding: v.name as string, array: false }
  if (
    v?.type === 'CallExpression' &&
    v.callee?.type === 'MemberExpression' &&
    v.callee.property?.type === 'Identifier' &&
    v.callee.property.name === 'array'
  ) {
    const inner = unwrapTypeLayers((v.arguments as AnyNode[] | undefined)?.[0]) as AnyNode | undefined
    if (inner?.type === 'Identifier') return { binding: inner.name as string, array: true }
  }
  return undefined
}










/**
 * Encode a `:param` value for a URL PATH segment.
 *
 * This is deliberately the SAME platform primitive the web runtime calls
 * (`@pyreon/http`'s `applyPathParams` → `encodeURIComponent`), not an
 * approximation of it. The two sides must agree byte-for-byte, because one
 * source file produces both URLs: a hand-rolled encoder here would make
 * `getUser({ params: { id: 'a b' } })` request `/users/a%20b` on the web and
 * something else on iOS/Android, silently. Encoding at COMPILE time is free —
 * the native path only ever substitutes LITERALS — so the emitted URL is a
 * fully-encoded constant.
 *
 * Un-encoded substitution was not merely cosmetic: a value containing `#`
 * truncated the URL at the fragment, and `?` / `&` injected query structure
 * into a path segment.
 */
const encodePathParam = (value: string): string => encodeURIComponent(value)

/**
 * The `:param` pattern, and it must stay the web's EXACTLY.
 *
 * `@pyreon/http`'s `applyPathParams` uses this literal to decide what counts
 * as a parameter; if the native side recognised a different set, the same path
 * template would carry different parameters on each platform — the one class
 * this whole resolver exists to prevent. Two native sites read it (collecting
 * a declaration's `paramNames`, and substituting at a call site), so it lives
 * once rather than being re-typed at each.
 *
 * `\\:` is the web's escape for a LITERAL colon (`/v1/:name\\:cancel`, a
 * Google-style custom verb). It matches with no capture group, and both sites
 * treat that match as the text `:` — reading it as a second parameter would
 * make the native URL demand a value the web never asks for.
 *
 * A fresh RegExp per use: `g`-flagged instances carry `lastIndex`, so a shared
 * one would resume mid-string on its second caller and silently skip params.
 */
const pathParamPattern = (): RegExp => /\\:|:([A-Za-z_][A-Za-z0-9_]*)/g

/**
 * Serialize literal query entries EXACTLY as the web's `buildQuery` does — by
 * running the SAME `URLSearchParams` it runs.
 *
 * POSITION MATTERS, which is why this cannot share an encoder with
 * {@link encodePathParam}: `URLSearchParams` is
 * application/x-www-form-urlencoded, so a space becomes `+` and `'` becomes
 * `%27`, whereas the same characters in a path segment are `%20` and a literal
 * `'`. One encoder for both positions is wrong in both.
 */
function buildQueryString(entries: readonly (readonly [string, string])[]): string {
  if (entries.length === 0) return ''
  const search = new URLSearchParams()
  for (const [k, v] of entries) search.append(k, v)
  const out = search.toString()
  return out ? `?${out}` : ''
}

/**
 * Read an endpoint call's `query` object into ORDERED key/value pairs.
 *
 * Ordered PAIRS rather than a record because the web repeats a key per array
 * entry (`{ tag: ['a','b'] }` → `?tag=a&tag=b`). `undefined` / `null` entries
 * are dropped, matching `buildQuery`. Anything else that cannot be read as a
 * literal is reported through `onUnlowerable` rather than dropped — a query
 * parameter that silently disappears from the native request is a data bug,
 * not a missing feature.
 */
type QueryEntry = readonly [key: string, value: string | { readonly runtime: AnyNode }]

function readQueryEntries(
  obj: AnyNode | undefined,
  onUnlowerable: (key: string) => void,
): QueryEntry[] {
  const out: QueryEntry[] = []
  if (obj === undefined) return out
  if (obj.type !== 'ObjectExpression') {
    onUnlowerable('query')
    return out
  }
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement') {
      onUnlowerable('query (spread)')
      continue
    }
    if (hasDynamicKey(prop)) {
      onUnlowerable('query (computed key)')
      continue
    }
    const key = propName(prop)
    if (key === undefined) continue
    const v = prop.value as AnyNode | undefined
    // The web DROPS nullish entries rather than serializing "undefined".
    if (isNullishLiteral(v)) continue
    if (v?.type === 'ArrayExpression') {
      for (const el of (v.elements as AnyNode[] | undefined) ?? []) {
        if (isNullishLiteral(el)) continue
        const item = literalScalar(el)
        if (item === undefined) {
          onUnlowerable(key)
          continue
        }
        out.push([key, String(item)])
      }
      continue
    }
    const scalar = literalScalar(v)
    if (scalar !== undefined) {
      out.push([key, String(scalar)])
      continue
    }
    // An object literal (a nested query) has no default serialization this resolver mirrors; anything else is a
    // RUNTIME value the caller may or may not be able to honour (see `resolveEndpointParts`).
    if (v === undefined || v.type === 'ObjectExpression' || v.type === 'ArrayExpression') {
      onUnlowerable(key)
      continue
    }
    out.push([key, { runtime: v }])
  }
  return out
}


/**
 * Read a literal `headers` object into string pairs, naming anything that
 * cannot lower instead of dropping it.
 */
function readLiteralHeaders(
  obj: AnyNode | undefined,
  onUnlowerable: (what: string) => void,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (obj === undefined) return out
  if (obj.type !== 'ObjectExpression') {
    onUnlowerable('headers')
    return out
  }
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement') {
      onUnlowerable('headers (spread)')
      continue
    }
    if (hasDynamicKey(prop)) {
      onUnlowerable('headers (computed key)')
      continue
    }
    const key = propName(prop)
    if (key === undefined) continue
    const value = literalScalar(prop.value as AnyNode | undefined)
    if (typeof value !== 'string') {
      onUnlowerable(`headers.${key}`)
      continue
    }
    out[key] = value
  }
  return out
}


/** One per-call header: a literal value, an explicit omission (`null` / `undefined`), or a runtime expression. */
type HeaderEntry = readonly [name: string, value: string | null | { readonly runtime: AnyNode }]

/**
 * Read a CALL-SITE `headers` object. Mirrors the web's `HeaderValues`: a string is sent as written, a number or
 * boolean as `String(value)` (computed here exactly — the literal is a JS value), a `null` / `undefined` OMITS the
 * header (and removes a declared one), and anything else is a runtime value for the caller to emit or refuse.
 */
function readCallHeaders(obj: AnyNode, onUnlowerable: (what: string) => void): HeaderEntry[] {
  const out: HeaderEntry[] = []
  if (obj.type !== 'ObjectExpression') {
    onUnlowerable('headers')
    return out
  }
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement') {
      onUnlowerable('headers (spread)')
      continue
    }
    if (hasDynamicKey(prop)) {
      onUnlowerable('headers (computed key)')
      continue
    }
    const key = propName(prop)
    if (key === undefined) continue
    const v = prop.value as AnyNode | undefined
    if (isNullishLiteral(v)) {
      out.push([key, null])
      continue
    }
    const scalar = literalScalar(v)
    if (scalar !== undefined) out.push([key, String(scalar)])
    else out.push([key, { runtime: v as AnyNode }])
  }
  return out
}

/** The markers a `form` / `multipart` / raw `body` travels under to the request writers (see `request-headers.ts`). */
const MULTIPART_MARKER = '__pyreonMultipart'
const RAW_BODY_MARKER = '__pyreonRawBody'

/** A literal form value the web's `encodeForm` accepts, else undefined. */
function formLiteral(node: AnyNode | undefined): unknown {
  const read = readJsonLiteral(node)
  return read?.value
}

/**
 * A `form` object: all literal → encoded NOW by the web's own `encodeForm`
 * (the oracle, so the bytes cannot differ); with runtime scalars →
 * `PyreonURL.query("", …)`, the same URLSearchParams serialization at
 * request time. A nested object value needs the OpenAPI style machinery and
 * is named; `undefined` when the whole form cannot be read.
 */
function readForm(
  node: AnyNode,
  warn: (message: string) => void,
  ctx: { expr(node: AnyNode): ExprIR },
): { literal: string } | { expr: ExprIR } | undefined {
  if (node.type !== 'ObjectExpression') {
    warn('the `form` body must be an object literal to lower — it is sent with NO body on iOS and Android.')
    return undefined
  }
  const entries: (readonly [string, AnyNode])[] = []
  let allLiteral = true
  for (const prop of (node.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement' || hasDynamicKey(prop)) {
      warn('a spread or computed key in `form` cannot be read at compile time — the request is sent with NO body on iOS and Android.')
      return undefined
    }
    const key = propName(prop)
    if (key === undefined) continue
    const v = prop.value as AnyNode
    if (v?.type === 'ObjectExpression') {
      warn(`form field \`${key}\` is a nested object, whose encoding depends on the OpenAPI style — it is sent with NO body on iOS and Android. Flatten it into scalar fields.`)
      return undefined
    }
    if (formLiteral(v) === undefined && !isNullishLiteral(v)) allLiteral = false
    entries.push([key, v])
  }
  if (allLiteral) {
    const fields: Record<string, unknown> = {}
    for (const [k, v] of entries) fields[k] = isNullishLiteral(v) ? null : formLiteral(v)
    return { literal: encodeForm(fields as never).toString() }
  }
  const args: ExprIR[] = [{ kind: 'literal', value: '' }]
  for (const [k, v] of entries) {
    args.push({ kind: 'literal', value: k })
    args.push(ctx.expr(v))
  }
  return {
    expr: {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'PyreonURL' }, property: 'query' },
      args,
    },
  }
}

/**
 * A `multipart` object → the marker call the request writers turn into a
 * `PyreonMultipartBody`: alternating name / value in SOURCE order (the order
 * `encodeMultipart` appends). A literal value is written as the web writes it
 * — a scalar as `String(v)`, an object or array element object as
 * `JSON.stringify` — and a runtime one is classified at emit.
 */
function readMultipart(
  node: AnyNode,
  warn: (message: string) => void,
  ctx: { expr(node: AnyNode): ExprIR },
): ExprIR | undefined {
  if (node.type !== 'ObjectExpression') {
    warn('the `multipart` body must be an object literal to lower — it is sent with NO body on iOS and Android.')
    return undefined
  }
  const args: ExprIR[] = []
  for (const prop of (node.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement' || hasDynamicKey(prop)) {
      warn('a spread or computed key in `multipart` cannot be read at compile time — that part is OMITTED on iOS and Android.')
      continue
    }
    const key = propName(prop)
    if (key === undefined) continue
    const v = prop.value as AnyNode
    if (isNullishLiteral(v)) continue
    const lit = readJsonLiteral(v)
    args.push({ kind: 'literal', value: key })
    if (lit === undefined) {
      args.push(ctx.expr(v))
    } else if (Array.isArray(lit.value)) {
      // An array repeats the field; each element as `encodeMultipart`'s `put` writes it.
      args.pop()
      for (const item of lit.value as unknown[]) {
        if (item === null || item === undefined) continue
        args.push({ kind: 'literal', value: key })
        args.push({ kind: 'literal', value: typeof item === 'object' ? JSON.stringify(item) : String(item) })
      }
    } else {
      args.push({
        kind: 'literal',
        value: lit.value !== null && typeof lit.value === 'object' ? JSON.stringify(lit.value) : String(lit.value),
      })
    }
  }
  return { kind: 'call', callee: { kind: 'identifier', name: MULTIPART_MARKER }, args }
}

/**
 * Endpoint CALL-SITE options that lower to native. Every other key on the call
 * object is reported — see {@link ENDPOINT_UNLOWERABLE_ARGS}.
 */
const ENDPOINT_LOWERED_ARGS: ReadonlySet<string> = new Set(['params', 'query', 'json', 'headers', 'form', 'multipart', 'body'])

/**
 * Endpoint call-site options with NO native lowering, and why.
 *
 * Enumerating them — rather than warning generically — is what closes the
 * class: `EndpointArgs` has a fixed shape, so every key is either lowered above
 * or named here, and an option added to the DSL later falls through to the
 * generic arm in `resolveEndpointParts` instead of vanishing. `json` and
 * `headers` were in exactly that position: read by nobody, dropped in silence,
 * so `createUser({ json })` issued a POST with no body on both targets.
 */
const ENDPOINT_UNLOWERABLE_ARGS: ReadonlyMap<string, string> = new Map([
  ['signal', 'an AbortSignal has no analogue in the emitted fetch harness, which runs to completion'],
  ['timeout', 'PyreonHttpRequest carries no timeout field'],
  ['meta', 'per-call metadata is read only by custom middleware functions, which do not lower — the built-in bearer/retry/logger read none'],
  ['cookies', 'the platform HTTP stacks own the Cookie header; a per-call cookie record is not sent'],
])

/**
 * Endpoint DECLARATION options with no native lowering.
 *
 * `response` is deliberately absent: the native path decodes into the typed
 * struct the generic argument names (Swift `Decodable`, kotlinx), so a response
 * schema IS honoured structurally — a mismatched payload rejects on both sides.
 */
const ENDPOINT_UNLOWERABLE_OPTIONS: ReadonlyMap<string, string> = new Map([
  ['timeout', 'PyreonHttpRequest carries no timeout field'],
])


/**
 * Pre-pass: read every top-level `const <name> = createHttp({ baseUrl })` into
 * `facts.clients`. Missing baseUrl → `''`; a non-literal baseUrl →
 * the HTTP_NONLITERAL_BASEURL sentinel (so the client's endpoints still
 * register but their calls stay web, and `resolveEndpointUrl` names why).
 * Matched by callee name — `createHttp` is a distinctive @pyreon/http export
 * and the metadata declaration emits nothing regardless.
 */
function collectHttpClients(body: AnyNode[], scan: ModuleScan, facts: HttpFacts): void {
  for (const node of body) {
    for (const decl of topLevelDeclarators(node)) {
      const name = decl.id?.name as string | undefined
      const init = decl.init as AnyNode | undefined
      if (!name || init?.type !== 'CallExpression') continue
      if (init.callee?.type !== 'Identifier' || init.callee.name !== 'createHttp') continue
      const cfg = init.arguments?.[0] as AnyNode | undefined
      let baseUrl = ''
      const v = readObjectProp(cfg, 'baseUrl')
      if (v !== undefined) {
        // A module-scope `const API_BASE = '…'` shared across the app is how an
        // http client is normally written, and its value is just as known at
        // build time as an inline string.
        baseUrl = scan.staticString(v) ?? HTTP_NONLITERAL_BASEURL
      }
      // `schema:` is read by nobody on this path — PyreonFetch does not
      // validate — so record the name to keep the symbol warn honest.
      const sch = readObjectProp(cfg, 'schema') as AnyNode | undefined
      if (sch?.type === 'Identifier' && typeof sch.name === 'string') {
        scan.lowered('*', sch.name)
      }
      facts.clients.set(name, baseUrl)
      // Read once here: the array is file-scope metadata, like the client. Its bearer tokens are lowered per call site.
      const mw = scanClientMiddleware(cfg, scan)
      if (mw.entries.length > 0 || mw.unlowerable.length > 0) facts.middleware.set(name, mw)
    }
  }
}


/**
 * Pre-pass: read every top-level `const <name> = <client>.endpoint('<METHOD>
 * /path/:x', <opts>?)` — where `<client>` is a known createHttp client — into
 * `facts.endpoints`. Splits the spec on the FIRST space (method + path),
 * uppercases the method, and extracts `:param` names (`:name.json` → `name`).
 */
function collectEndpointDefs(body: AnyNode[], facts: HttpFacts): void {
  for (const node of body) {
    for (const decl of topLevelDeclarators(node)) {
      const name = decl.id?.name as string | undefined
      const init = decl.init as AnyNode | undefined
      if (!name || init?.type !== 'CallExpression') continue
      const callee = init.callee as AnyNode | undefined
      if (callee?.type !== 'MemberExpression' || callee.computed) continue
      if (callee.object?.type !== 'Identifier' || !facts.clients.has(callee.object.name)) {
        continue
      }
      if (callee.property?.type !== 'Identifier' || callee.property.name !== 'endpoint') continue
      const specArg = init.arguments?.[0] as AnyNode | undefined
      if (
        !specArg ||
        (specArg.type !== 'Literal' && specArg.type !== 'StringLiteral') ||
        typeof specArg.value !== 'string'
      ) {
        continue
      }
      const raw = specArg.value.trim()
      const sp = raw.indexOf(' ')
      if (sp < 0) continue // needs "<METHOD> <path>"
      const method = raw.slice(0, sp).toUpperCase()
      const pathTemplate = raw.slice(sp + 1).trim()
      const paramNames: string[] = []
      const re = pathParamPattern()
      let m: RegExpExecArray | null
      while ((m = re.exec(pathTemplate)) !== null) {
        if (m[1]) paramNames.push(m[1])
      }
      // The DECLARATION's second argument — `{ response, headers, timeout,
      // throwHttpErrors }`. Nothing read it before, so a `headers` declared
      // once on the endpoint was dropped from every native request in silence.
      const declUnlowerable: string[] = []
      let responseType: string | undefined
      let responseSchema: { binding: string; array: boolean } | undefined
      const optsArg = init.arguments?.[1] as AnyNode | undefined
      const declHeaders = readLiteralHeaders(readObjectProp(optsArg, 'headers'), (what) =>
        declUnlowerable.push(what),
      )
      if (optsArg !== undefined && optsArg.type !== 'ObjectExpression') {
        declUnlowerable.push('options (not an object literal)')
      }
      for (const prop of (optsArg?.properties as AnyNode[] | undefined) ?? []) {
        if (prop.type === 'SpreadElement') {
          declUnlowerable.push('options (spread)')
          continue
        }
        const key = propName(prop)
        if (key === 'response') {
          responseSchema = readResponseSchemaRef(prop.value as AnyNode | undefined)
          continue
        }
        if (key === undefined || key === 'headers') continue
        if (key === 'responseType') {
          const v = literalScalar(prop.value as AnyNode | undefined)
          // `'json'` is the default and `'stream'` is consumed by useStream;
          // any other body type has no native lowering.
          if (v === 'json' || v === 'stream') responseType = v
          else declUnlowerable.push(key)
          continue
        }
        if (key === 'throwHttpErrors') {
          // The native harness ALWAYS rejects a non-2xx, so `true` matches it
          // exactly and only an opt-OUT is unhonourable.
          if (literalScalar(prop.value as AnyNode | undefined) !== true) declUnlowerable.push(key)
          continue
        }
        declUnlowerable.push(key)
      }

      facts.endpoints.set(name, {
        method,
        pathTemplate,
        clientName: callee.object.name as string,
        paramNames,
        declHeaders,
        declUnlowerable,
        ...(responseType !== undefined ? { responseType } : {}),
        ...(responseSchema !== undefined ? { responseSchema } : {}),
      })
    }
  }
}


/**
 * The endpoint-resolution core, shared by the direct call form
 * (`getUser({ params })` → useFetch) and the `.query()` fetcher form
 * (`getUser.query({ params })` → useQuery). Given the endpoint NAME and the
 * args object node, it substitutes ENCODED literal `:params` into the templated
 * URL, appends the serialized query, lowers a literal `json` body + `headers`,
 * and returns {@link ResolvedEndpoint} — or null (having pushed a specific
 * warning) when the baseUrl is non-literal or a param is missing/reactive.
 *
 * Every option it cannot honour is NAMED in a warning rather than dropped.
 */
function resolveEndpointParts(
  endpointName: string,
  arg: AnyNode | undefined,
  ctx: ParseContext,
  facts: HttpFacts,
  /**
   * Whether the CALLER can honour a runtime `:param`.
   *
   * Only true for the `useQuery` fetcher form, whose native harness is KEYED
   * on the runtime query key and therefore re-fetches when the param changes —
   * the same semantic the web has. `useFetch` lowers to a ONE-SHOT task with
   * no re-run trigger, so a runtime URL there would fetch the first value and
   * freeze on it: silently wrong, rather than merely unsupported. That path
   * keeps bailing, and now says which hook to reach for instead.
   */
  allowRuntimeParams = false,
  /** The caller consumes the RAW body as a stream (`useStream`). */
  streaming = false,
  /** The caller emits a runtime `json` body (`bodyExpr`) and runtime header values (`headerExprs`). */
  runtimeValues = false,
  /** The caller emits `ResolvedRequest.middleware` (see `RequestOptions.middleware`). */
  allowMiddleware = false,
): ResolvedRequest | null {
  const def = facts.endpoints.get(endpointName)
  if (!def) return null
  if (def.responseType === 'stream' && !streaming) {
    ctx.report(
      `endpoint ${endpointName} is declared \`responseType: 'stream'\`, so its body is a byte stream — the native useFetch/useQuery harness decodes ONE JSON body and would fail on it. Consume it with \`useStream((ctx) => openEventStream((c) => ${endpointName}({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))\` (or \`openNdjsonStream\`), which lowers to the native stream runtime. This call stays web.`,
    )
    return null
  }
  const baseUrl = facts.clients.get(def.clientName)
  if (baseUrl === undefined || baseUrl === HTTP_NONLITERAL_BASEURL) {
    ctx.report(
      `endpoint ${endpointName}: native lowering needs a LITERAL baseUrl on client ${def.clientName} (\`createHttp({ baseUrl: '/api' })\`) — a computed baseUrl can't be baked into the URL at compile time, so this call stays web. A module-scope \`const\` holding the string works too.`,
    )
    return null
  }
  const warn = (message: string): void => {
    ctx.report(`endpoint ${endpointName}: ${message}`)
  }

  // --- client middleware -------------------------------------------------
  //
  // Decided BEFORE anything else is lowered: a client whose `use` array cannot be honoured keeps the call on the web
  // rather than sending a request the web would not send (no token, no retry). Every unlowerable entry is named.
  const mw = facts.middleware.get(def.clientName)
  if (mw !== undefined && mw.unlowerable.length > 0) {
    for (const why of mw.unlowerable) {
      warn(`client ${def.clientName}'s \`use\` middleware cannot lower to iOS/Android: ${why}. This call stays web.`)
    }
    return null
  }
  if (mw !== undefined && mw.entries.length > 0 && !allowMiddleware) {
    warn(
      `client ${def.clientName} applies middleware (${middlewareNames(mw)}) on the web, and this ${streaming ? '`useStream`' : 'caller'} does not apply client middleware natively — lowering it would send a request without them. Read the endpoint with \`useFetch\` or \`useQuery\`, which do. This call stays web.`,
    )
    return null
  }

  // --- path params -------------------------------------------------------
  //
  // ONE ordered scan of the path template rather than a loop over param names,
  // because a runtime param has to keep its POSITION in the emitted template.
  // A per-name `String.replace` pass cannot express that: it rewrites text,
  // and an interpolation slot is not text. Scanning the template also handles
  // a param used twice (`/a/:id/b/:id`) and preserves left-to-right order for
  // free, which the name loop only did by accident.
  //
  // It also retires a documented foot-gun by construction: the old loop used
  // `String.replace`, which interprets `$&` / `` $` `` / `$'` / `$$` in a
  // STRING replacement — a value containing them spliced the match back into
  // the URL. Building the string by SLICING never interprets anything, so
  // there is no replacement syntax to get wrong. Do not reintroduce a
  // `.replace` here.
  const paramsObj = readObjectProp(arg, 'params')
  const dynamicParam = (
    paramsObj?.type === 'ObjectExpression' ? (paramsObj.properties as AnyNode[]) : []
  ).find(hasDynamicKey)
  if (dynamicParam) {
    warn(
      `the \`params\` key \`${ctx.dynamicKeyText(dynamicParam)}\` is computed, so which path parameter it fills is only known at runtime — write the parameter name literally (\`params: { id }\`). This call stays web.`,
    )
    return null
  }
  const paramNodes = readEntryNodes(paramsObj)
  const literalParams = readLiteralEntries(paramsObj)
  // Quasis/exprs of the templated form, built in parallel with the literal
  // one. `quasis` always has exactly `exprs.length + 1` entries.
  const quasis: string[] = ['']
  const exprs: ExprIR[] = []
  let literalPath = ''
  let sawRuntimeParam = false
  let bailed = false
  const PARAM_RE = pathParamPattern()
  let cursor = 0
  for (let m = PARAM_RE.exec(def.pathTemplate); m; m = PARAM_RE.exec(def.pathTemplate)) {
    const before = def.pathTemplate.slice(cursor, m.index)
    cursor = m.index + m[0].length
    literalPath += before
    quasis[quasis.length - 1] += before
    const name = m[1]
    if (name === undefined) {
      // `\:` — a literal colon, exactly as the web's `applyPathParams` writes it.
      literalPath += ':'
      quasis[quasis.length - 1] += ':'
      continue
    }
    const literal = literalParams[name]
    if (literal !== undefined) {
      const encoded = encodePathParam(literal)
      literalPath += encoded
      quasis[quasis.length - 1] += encoded
      continue
    }
    const node = paramNodes[name]
    if (node === undefined || isNullishLiteral(node)) {
      // MISSING is unfixable at compile time and unfixable at runtime too —
      // the web THROWS here — so it stays a bail on every path.
      warn(
        `native lowering needs the \`${name}\` path parameter; it is missing from \`params\` (the web throws for this shape too) — this call stays web.`,
      )
      bailed = true
      break
    }
    if (!allowRuntimeParams) {
      warn(
        `path parameter \`${name}\` is a runtime value, and \`useFetch\` lowers to a ONE-SHOT native task with nothing to re-run it — the request would fetch once and freeze at that first value. Use \`useQuery(() => ${endpointName}.query({ params: { ${name} } }))\` instead: its native harness is keyed on the runtime value, so it re-fetches when the value changes, exactly as the web does. This call stays web.`,
      )
      bailed = true
      break
    }
    sawRuntimeParam = true
    // The literal twin keeps the `:name` placeholder so `url` stays a readable
    // description of the shape (it is not what gets emitted — `urlExpr` is).
    literalPath += m[0]
    // `PyreonURL.encodePathParam(<value>)` on BOTH targets — same spelling,
    // and it takes the value UNSTRINGIFIED so the helper can apply JS
    // `String()` semantics (a whole Double is `1`, not `1.0`). Pre-interpolating
    // here would hand it an already-wrong string.
    exprs.push({
      kind: 'call',
      callee: {
        kind: 'member',
        object: { kind: 'identifier', name: 'PyreonURL' },
        property: 'encodePathParam',
      },
      args: [ctx.expr(node)],
    })
    quasis.push('')
  }
  if (bailed) return null
  const tail = def.pathTemplate.slice(cursor)
  literalPath += tail
  quasis[quasis.length - 1] += tail
  const path = literalPath
  let url = baseUrl + path
  quasis[0] = baseUrl + (quasis[0] ?? '')

  // --- query -------------------------------------------------------------
  const queryEntries = readQueryEntries(readObjectProp(arg, 'query'), (key) => {
    warn(
      `query parameter \`${key}\` is a nested object or an array holding a non-literal, which has no native serialization — it is OMITTED on iOS and Android. Pass a scalar or an array of scalars.`,
    )
  })
  const runtimeQuery = queryEntries.some(([, v]) => typeof v !== 'string')
  let sawRuntimeQuery = false
  // A runtime query value is honourable wherever the request is built at RUNTIME: by a re-running caller (a keyed
  // query, a stream), or by one that builds it exactly once at the moment the web evaluates the call (`useFetch`,
  // whose promise source the web also evaluates once, at setup).
  if (runtimeQuery && !allowRuntimeParams && !runtimeValues) {
    const name = queryEntries.find(([, v]) => typeof v !== 'string')?.[0] ?? ''
    warn(
      `query parameter \`${name}\` is a runtime value, and \`useFetch\` lowers to a ONE-SHOT native task — the query would be fixed at its first value. Use \`useQuery(() => ${endpointName}.query({ query: { ${name} } }))\` instead: its native harness is keyed on the URL, so it re-fetches when the value changes. This call stays web.`,
    )
    return null
  }
  if (runtimeQuery) {
    // The query is serialized at RUNTIME by \`PyreonURL.query\`, which mirrors the
    // web's \`buildQuery\` (URLSearchParams: form-encoding, an array repeating
    // its key, \`null\` / \`undefined\` dropped, JS \`String()\` for a number). Every
    // pair goes through it — the literal ones too — so source ORDER is kept.
    sawRuntimeQuery = true
    const args: ExprIR[] = [{ kind: 'literal', value: url.includes('?') ? '&' : '?' }]
    for (const [key, value] of queryEntries) {
      args.push({ kind: 'literal', value: key })
      args.push(typeof value === 'string' ? { kind: 'literal', value } : ctx.expr(value.runtime))
    }
    exprs.push({
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'PyreonURL' }, property: 'query' },
      args,
    })
    quasis.push('')
  }
  const qs = runtimeQuery ? '' : buildQueryString(queryEntries as (readonly [string, string])[])
  // Mirrors the web's `buildUrl`: a path template that already carries a `?`
  // takes `&`, and the leading `?` is stripped from the serialized query.
  //
  // The `?`-detection reads the LITERAL url, never the template: a runtime
  // param's VALUE is percent-encoded before it lands in the URL, so it can
  // never contribute a structural `?` — which is exactly what
  // `encodePathParam` is there to guarantee.
  if (qs) {
    const joined = url.includes('?') ? `&${qs.slice(1)}` : qs
    url += joined
    quasis[quasis.length - 1] += joined
  }

  // --- headers -----------------------------------------------------------
  // Mirrors the web's `mergeHeaders(declared, call)`: with no per-call headers
  // the declared set goes out as written; with no declared set the call's do;
  // with both, the call's are laid OVER the declared ones by lower-cased name
  // (a `null` / `undefined` call value removes the declared header). This used
  // to REPLACE the declared set wholesale — the web's behaviour before it was
  // fixed to stop dropping a declared `content-type` the moment a caller
  // passed any header at all — so the two platforms disagreed.
  const callHeadersNode = readObjectProp(arg, 'headers')
  let headers: Record<string, string> = { ...def.declHeaders }
  const headerExprs: Record<string, ExprIR> = {}
  if (callHeadersNode !== undefined && !isNullishLiteral(callHeadersNode)) {
    const entries = readCallHeaders(callHeadersNode, (what) => {
      warn(
        `\`${what}\` cannot be read at compile time, so it is OMITTED on iOS and Android — write the headers as an object literal.`,
      )
    })
    const merging = Object.keys(def.declHeaders).length > 0
    if (merging) {
      headers = {}
      for (const [k, v] of Object.entries(def.declHeaders)) headers[k.toLowerCase()] = v
    }
    for (const [name, value] of entries) {
      const key = merging ? name.toLowerCase() : name
      delete headers[key]
      delete headerExprs[key]
      if (value === null) continue
      if (typeof value === 'string') {
        headers[key] = value
        continue
      }
      if (!runtimeValues) {
        warn(
          `header \`${name}\` is a runtime value, and this hook bakes its request at compile time — it is OMITTED on iOS and Android. Pass a literal, or make the request from \`useQuery\` / \`useMutation\`, which build it when they run.`,
        )
        continue
      }
      headerExprs[key] = ctx.expr(value.runtime)
    }
  }
  const hasHeader = (name: string): boolean =>
    [...Object.keys(headers), ...Object.keys(headerExprs)].some((k) => k.toLowerCase() === name)

  // --- json body ---------------------------------------------------------
  const jsonNode = readObjectProp(arg, 'json')
  let body: string | undefined
  let bodyExpr: ExprIR | undefined
  if (jsonNode !== undefined && !isNullishLiteral(jsonNode)) {
    const literal = readJsonLiteral(jsonNode)
    const arith = unwrapTypeLayers(jsonNode) as AnyNode
    const nanLiteral =
      arith?.type === 'UnaryExpression' && typeof literalScalar(arith.argument as AnyNode) === 'string'
    if (literal !== undefined) {
      body = JSON.stringify(literal.value)
    } else if (nanLiteral) {
      // `-'a'` is NaN on the web — `JSON.stringify` writes `null` — and is not a value the native serializer accepts.
      warn('the `json` body is a unary operator over a string, which is NaN on the web — write the value you mean to send. The request is sent with NO body on iOS and Android.')
    } else if (runtimeValues) {
      // A RUNTIME body — `json: { email: email() }`, `json: draft`. Serialized
      // when the request is built, through the `JSON.stringify` lowering: the
      // runtimes' web-identical serializer (key order = the source literal's,
      // ECMAScript number and string formatting), so the bytes on the wire
      // match the web's `JSON.stringify(json)`.
      bodyExpr = { kind: 'json-stringify', arg: ctx.expr(jsonNode) }
    } else {
      warn(
        'the `json` body is a runtime value, and this hook bakes its request at compile time — the request is sent with NO body on iOS and Android. Pass a literal, or make the request from `useQuery` / `useMutation`, which serialize the body when they run.',
      )
    }
    // The web sets `content-type: application/json` unless the caller already
    // declared one. `Headers` matches case-insensitively and lowercases the
    // name it stores, so mirror both halves.
    if ((body !== undefined || bodyExpr !== undefined) && !hasHeader('content-type')) {
      headers = { ...headers, 'content-type': 'application/json' }
    }
  }

  // --- form / multipart / raw body ---------------------------------------
  // The web's `buildBody` takes exactly ONE of json / form / multipart / body
  // and THROWS for two, so two here are refused rather than one picked.
  const bodyKeys = ['json', 'form', 'multipart', 'body'].filter((k) => {
    const v = readObjectProp(arg, k)
    return v !== undefined && !isNullishLiteral(v)
  })
  if (bodyKeys.length > 1) {
    warn(
      `the call passes ${bodyKeys.map((k) => `\`${k}\``).join(' and ')} — the web throws for more than one (each is a different encoding of the same body). Pass one. This call stays web.`,
    )
    return null
  }
  let upload: ExprIR | undefined
  const formNode = readObjectProp(arg, 'form')
  if (formNode !== undefined && !isNullishLiteral(formNode)) {
    const form = readForm(formNode, warn, ctx)
    if (form !== undefined) {
      if ('literal' in form) body = form.literal
      else if (runtimeValues) bodyExpr = form.expr
      else {
        warn(
          'the `form` body holds a runtime value, and this hook bakes its request at compile time — the request is sent with NO body on iOS and Android. Pass literals, or make the request from `useQuery` / `useMutation`.',
        )
      }
      if ((body !== undefined || bodyExpr !== undefined) && !hasHeader('content-type')) {
        headers = { ...headers, 'content-type': 'application/x-www-form-urlencoded' }
      }
    }
  }
  const multipartNode = readObjectProp(arg, 'multipart')
  if (multipartNode !== undefined && !isNullishLiteral(multipartNode)) {
    // A multipart body (a file upload) is built and streamed when the request
    // is SENT, so it needs a caller that builds the request at runtime.
    if (!runtimeValues) {
      warn(
        'a `multipart` body is built when the request is sent, and this hook bakes its request at compile time — the request is sent with NO body on iOS and Android. Upload from an event handler (`await ep({ multipart })`) or `useMutation`.',
      )
    } else {
      upload = readMultipart(multipartNode, warn, ctx)
    }
  }
  const rawNode = readObjectProp(arg, 'body')
  if (rawNode !== undefined && !isNullishLiteral(rawNode)) {
    const literal = literalScalar(rawNode)
    if (typeof literal === 'string') body = literal
    else if (!runtimeValues) {
      warn(
        'a runtime `body` is read when the request is sent, and this hook bakes its request at compile time — the request is sent with NO body on iOS and Android. Send it from an event handler or `useMutation`.',
      )
    } else {
      // A string is a text body, a `fileFromUri` file is streamed — decided at
      // emit, where the value's type is known.
      upload = { kind: 'call', callee: { kind: 'identifier', name: RAW_BODY_MARKER }, args: [ctx.expr(rawNode)] }
    }
  }

  // --- everything else ---------------------------------------------------
  // Any option the call site carries that is NOT lowered above gets NAMED. This
  // is the arm that makes the class closed rather than a list of instances: a
  // future `EndpointArgs` field lands here instead of disappearing.
  if (arg !== undefined && arg.type !== 'ObjectExpression') {
    warn('the call argument is not an object literal, so no option on it lowers — this call stays web.')
    return null
  }
  for (const prop of (arg?.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement') {
      warn(
        'a spread in the call arguments cannot be read at compile time, so any option it carries is IGNORED on iOS and Android — pass the options literally.',
      )
      continue
    }
    const key = propName(prop)
    if (key === undefined || ENDPOINT_LOWERED_ARGS.has(key)) continue
    warn(
      `option \`${key}\` has no native equivalent and is IGNORED on iOS and Android (${ENDPOINT_UNLOWERABLE_ARGS.get(key) ?? 'not part of the lowered endpoint surface'}).`,
    )
  }
  for (const key of def.declUnlowerable) {
    warn(
      `the endpoint declaration's \`${key}\` has no native equivalent and is IGNORED on iOS and Android (${ENDPOINT_UNLOWERABLE_OPTIONS.get(key) ?? 'not part of the lowered endpoint surface'}).`,
    )
  }

  const extras: {
    urlExpr?: ExprIR
    headers?: Record<string, string>
    headerExprs?: Record<string, ExprIR>
    body?: string
    bodyExpr?: ExprIR
    upload?: ExprIR
    middleware?: ExprIR
  } = {}
  if (upload !== undefined) extras.upload = upload
  if (sawRuntimeParam || sawRuntimeQuery) extras.urlExpr = { kind: 'template', quasis, exprs }
  const middleware = mw !== undefined ? middlewareExpr(mw, baseUrl, ctx) : undefined
  if (middleware !== undefined) extras.middleware = middleware
  if (Object.keys(headers).length > 0) extras.headers = headers
  if (Object.keys(headerExprs).length > 0) extras.headerExprs = headerExprs
  if (body !== undefined) extras.body = body
  if (bodyExpr !== undefined) extras.bodyExpr = bodyExpr
  return { url, method: def.method, ...extras, ...(def.responseSchema !== undefined ? { response: def.responseSchema } : {}) }
}


/**
 * True when EVERY declarator of a top-level node is an @pyreon/http client or
 * endpoint binding (recorded by the pre-pass collectors). Those are metadata
 * only — they emit nothing — so the main loop skips them before the
 * module-decl catch-all mis-emits them as bindings.
 */
function isHttpMetadataNode(node: AnyNode, facts: HttpFacts): boolean {
  const decls = topLevelDeclarators(node)
  if (decls.length === 0) return false
  return decls.every((d) => {
    const n = d.id?.name as string | undefined
    return typeof n === 'string' && (facts.clients.has(n) || facts.endpoints.has(n))
  })
}
/** The `scanModule` pass: record clients first (endpoints gate on a known client), then endpoints, and make the core skip both declarations. */
export function scanHttp(scan: ModuleScan): void {
  const facts = httpFacts(scan)
  const body = scan.body as AnyNode[]
  collectHttpClients(body, scan, facts)
  collectEndpointDefs(body, facts)
  // Where each endpoint CALL sits (awaited in a handler, fired, value-used) — see `call.ts`.
  scanCallRoles(body, facts.endpoints, scan)
  if (facts.clients.size > 0 || facts.endpoints.size > 0) {
    scan.skipTopLevel((node) => isHttpMetadataNode(node as AnyNode, facts))
  }
}

/** The request source over this file's endpoints. */
export const httpRequestSource = {
  has: (name: string, ctx: ParseContext): boolean => httpFacts(ctx).endpoints.has(name),
  resolve: (
    name: string,
    arg: AnyNode | undefined,
    options: { allowRuntimeParams: boolean; streaming: boolean; runtimeValues?: boolean | undefined; middleware?: boolean | undefined },
    ctx: ParseContext,
  ): ResolvedRequest | null =>
    resolveEndpointParts(
      name,
      arg,
      ctx,
      httpFacts(ctx),
      options.allowRuntimeParams,
      options.streaming,
      options.runtimeValues === true,
      options.middleware === true,
    ),
}
