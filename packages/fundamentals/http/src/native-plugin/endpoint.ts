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
}

const FACTS_KEY = '@pyreon/http:facts'

/** The facts this file's scan recorded. Other plugins read them through the request source, never this. */
export function httpFacts(source: { fileState<T>(key: string, init: () => T): T }): HttpFacts {
  return source.fileState<HttpFacts>(FACTS_KEY, () => ({ clients: new Map(), endpoints: new Map() }))
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
function readQueryEntries(
  obj: AnyNode | undefined,
  onUnlowerable: (key: string) => void,
): Array<[string, string]> {
  const out: Array<[string, string]> = []
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
    if (scalar === undefined) {
      onUnlowerable(key)
      continue
    }
    out.push([key, String(scalar)])
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


/**
 * Endpoint CALL-SITE options that lower to native. Every other key on the call
 * object is reported — see {@link ENDPOINT_UNLOWERABLE_ARGS}.
 */
const ENDPOINT_LOWERED_ARGS: ReadonlySet<string> = new Set(['params', 'query', 'json', 'headers'])

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
  ['meta', 'per-call metadata is read by client middleware, which does not lower'],
  ['form', 'the emitted fetch harness sends a JSON body only; an encoded form body is not built'],
  ['multipart', 'the emitted fetch harness sends a JSON body only; a multipart body (a file upload) is not built'],
  ['body', 'the emitted fetch harness sends a JSON body only; a raw Blob / ArrayBuffer / string body is not sent'],
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
      `query parameter \`${key}\` is not a string/number/boolean literal (or an array of them), so it cannot be baked into the compile-time URL — it is OMITTED on iOS and Android.`,
    )
  })
  const qs = buildQueryString(queryEntries)
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
  // A per-call `headers` REPLACES the declaration's, mirroring the web's
  // `args?.headers ?? options.headers`.
  const callHeadersNode = readObjectProp(arg, 'headers')
  let headers: Record<string, string> =
    callHeadersNode === undefined
      ? { ...def.declHeaders }
      : readLiteralHeaders(callHeadersNode, (what) => {
          warn(
            `\`${what}\` is not a string literal, so it cannot be baked into the native request — it is OMITTED on iOS and Android.`,
          )
        })

  // --- json body ---------------------------------------------------------
  const jsonNode = readObjectProp(arg, 'json')
  let body: string | undefined
  if (jsonNode !== undefined && !isNullishLiteral(jsonNode)) {
    const literal = readJsonLiteral(jsonNode)
    if (literal === undefined) {
      warn(
        'the `json` body must be a literal (object / array / string / number / boolean / null) to be baked into the native request; the request is sent with NO body on iOS and Android.',
      )
    } else {
      body = JSON.stringify(literal.value)
      // The web sets `content-type: application/json` unless the caller already
      // declared one. `Headers` matches case-insensitively and lowercases the
      // name it stores, so mirror both halves.
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers = { ...headers, 'content-type': 'application/json' }
      }
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

  const extras: { urlExpr?: ExprIR; headers?: Record<string, string>; body?: string } = {}
  if (sawRuntimeParam) extras.urlExpr = { kind: 'template', quasis, exprs }
  if (Object.keys(headers).length > 0) extras.headers = headers
  if (body !== undefined) extras.body = body
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
    options: { allowRuntimeParams: boolean; streaming: boolean },
    ctx: ParseContext,
  ): ResolvedRequest | null =>
    resolveEndpointParts(name, arg, ctx, httpFacts(ctx), options.allowRuntimeParams, options.streaming),
}
