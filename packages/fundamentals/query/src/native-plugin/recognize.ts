// How `@pyreon/query` crosses to native: `useQuery`, `useStream` and `new QueryClient()`.
//
// Each recognizer reads the call through the `ParseContext` facade and returns the plugin's own
// declaration (a JSON payload); `emit-swift.ts` / `emit-kotlin.ts` never see the library. A request
// that names an `@pyreon/http` endpoint is resolved by THAT plugin's request source through
// `ctx.requests`, so this package needs no import of it.

import {
  hasDynamicKey,
  isNullishLiteral,
  literalScalar,
  propName,
  readJsonLiteral,
  staticPropKey,
  unwrapTypeLayers,
  type CallSite,
  type ExprIR,
  type ExtDeclSpec,
  type ExtPayload,
  type ModuleScan,
  type ParseContext,
  type StatementIR,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { QUERY_CLIENT_TYPE, QUERY_TYPE, STREAM_TYPE } from './names'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** The wire format a stream opener (`openEventStream` / `openNdjsonStream`) opens. */
export interface StreamFacts {
  /** Local name → format. */
  readonly openers: Map<string, 'sse' | 'ndjson'>
  /** Local name → the imported export name. */
  readonly imported: Map<string, string>
}

const STREAM_FACTS_KEY = '@pyreon/query:streams'

/** The stream openers this file's scan recorded. */
export function streamFacts(source: { fileState<T>(key: string, init: () => T): T }): StreamFacts {
  return source.fileState<StreamFacts>(STREAM_FACTS_KEY, () => ({ openers: new Map(), imported: new Map() }))
}

/** Push the shared named warning for a computed non-literal key in a config object read statically. */
function warnDynamicKey(prop: AnyNode, where: string, ctx: ParseContext): void {
  ctx.report(
    `${where}: the computed key \`${ctx.dynamicKeyText(prop)}\` is only known at runtime, so this entry cannot be read at compile time and does not lower to native. Write the key literally (\`{ input: … }\`, not \`{ [kind]: … }\`).`,
  )
}

/** The `scanModule` pass: stream openers imported from `@pyreon/http/stream`. */
export function scanQuery(scan: ModuleScan): void {
  collectStreamOpeners(scan, streamFacts(scan))
}

/**
 * Pre-pass: the local names `openEventStream` / `openNdjsonStream` are bound to
 * (from `@pyreon/http/stream`), and whether every call of one is a `useStream`
 * source — the one position the native stream runtime lowers it from.
 */
function collectStreamOpeners(scan: ModuleScan, facts: StreamFacts): void {
  const program = scan.program as AnyNode
  for (const node of (program.body as AnyNode[] | undefined) ?? []) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== '@pyreon/http/stream') continue
    if ((node as { importKind?: string }).importKind === 'type') continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      if ((spec as { importKind?: string }).importKind === 'type') continue
      const imported = spec.imported?.name ?? spec.imported?.value
      const local = spec.local?.name as string | undefined
      if (!local) continue
      if (imported === 'openEventStream') facts.openers.set(local, 'sse')
      if (imported === 'openNdjsonStream') facts.openers.set(local, 'ndjson')
      if (imported === 'openEventStream' || imported === 'openNdjsonStream') facts.imported.set(local, imported)
    }
  }
  if (facts.openers.size === 0) return
  let total = 0
  const sources = new Set<AnyNode>()
  const visit = (n: unknown): void => {
    if (n === null || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const x of n) visit(x)
      return
    }
    const node = n as AnyNode
    if (node.type === 'CallExpression') {
      const callee = node.callee as AnyNode | undefined
      if (callee?.type === 'Identifier' && callee.name === 'useStream') {
        const src = streamSourceCall(node.arguments?.[0] as AnyNode | undefined)
        if (src) sources.add(src)
      }
      if (callee?.type === 'Identifier' && facts.openers.has(callee.name as string)) total++
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue
      visit((node as Record<string, unknown>)[key])
    }
  }
  visit(program)
  let lowered = 0
  for (const src of sources) {
    const callee = src.callee as AnyNode | undefined
    if (callee?.type === 'Identifier' && facts.openers.has(callee.name as string)) lowered++
  }
  // Every call of an opener is a `useStream` source — the one position the native stream runtime
  // lowers it from — so the blanket "has NO native lowering" import warning would be printed above
  // a stream that does lower. Any other use keeps the warning.
  if (total > 0 && total === lowered) {
    for (const [local] of facts.openers) {
      const imported = facts.imported.get(local)
      if (imported !== undefined) scan.lowered('@pyreon/http/stream', imported)
    }
  }
}

/** The call an arrow returns — concise body, parenthesized, or a lone `return`. */
function arrowReturnedCall(arrow: AnyNode | undefined): AnyNode | undefined {
  if (arrow?.type !== 'ArrowFunctionExpression' && arrow?.type !== 'FunctionExpression') return undefined
  let body = arrow.body as AnyNode | undefined
  if (body?.type === 'ParenthesizedExpression') body = body.expression as AnyNode | undefined
  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[] | undefined) ?? []
    if (stmts.length !== 1 || stmts[0]?.type !== 'ReturnStatement') return undefined
    body = stmts[0].argument as AnyNode | undefined
    if (body?.type === 'ParenthesizedExpression') body = body.expression as AnyNode | undefined
  }
  return body?.type === 'CallExpression' ? body : undefined
}

/** An arrow / function expression node. */
function isFunctionNode(n: AnyNode | undefined): boolean {
  return n?.type === 'ArrowFunctionExpression' || n?.type === 'FunctionExpression'
}

/** The expression a zero-arg accessor returns — concise body or a lone `return`. */
function arrowExprBody(arrow: AnyNode | undefined): AnyNode | undefined {
  if (!isFunctionNode(arrow) || ((arrow!.params as AnyNode[] | undefined)?.length ?? 0) > 0) return undefined
  const body = arrow!.body as AnyNode | undefined
  if (body?.type !== 'BlockStatement') return body
  const stmts = (body.body as AnyNode[] | undefined) ?? []
  return stmts.length === 1 && stmts[0]?.type === 'ReturnStatement' ? (stmts[0].argument as AnyNode | undefined) : undefined
}

/** Does `name` appear as an identifier anywhere under `node`? (Conservative: shadowing counts as a use.) */
function identifierReferenced(node: AnyNode | undefined, name: string): boolean {
  let found = false
  const visit = (n: unknown): void => {
    if (found || n === null || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const x of n) visit(x)
      return
    }
    const a = n as AnyNode
    if (a.type === 'Identifier' && a.name === name) {
      found = true
      return
    }
    for (const key of Object.keys(a)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue
      visit((a as Record<string, unknown>)[key])
    }
  }
  visit(node)
  return found
}

/** `useStream(<arrow>)`'s source call — the opener call its arrow returns. */
function streamSourceCall(arrow: AnyNode | undefined): AnyNode | undefined {
  return arrowReturnedCall(arrow)
}


/** A `useQuery` declaration: `type` is the decoded result type, the rest is the request + cache key. */
function queryDecl(payload: object): ExtDeclSpec {
  // The IR inside the payload (`ExprIR`, `TypeIR`) is JSON, which `ExtPayload` cannot express structurally.
  return { type: QUERY_TYPE, payload: payload as unknown as ExtPayload }
}

/**
 * `const q = useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` from `@pyreon/query` — useFetch
 * plus a keyed cache. v1 (conservative, same literal-only rule as useFetch): queryKey = array of
 * string/number literals (colon-joined into the cache key) or expressions; queryFn = an inline
 * `() => fetch('<url-literal>')`, a direct-value fetcher, or an `@pyreon/http` endpoint `.query()`;
 * staleTime = number literal (ms). Anything else WARNS and declines, so the "no native lowering"
 * diagnostic still fires rather than the emit mis-lowering a shape it can't honour.
 */
export function recognizeQuery(_call: CallSite, ctx: ParseContext): ExtDeclSpec | null | undefined {
  const name = ctx.declName
  const init = { arguments: ctx.args } as AnyNode
  // `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` from @pyreon/query
  // — useFetch + a keyed cache. v1 (conservative, same literal-only rule as
  // useFetch): queryKey = array of string/number literals (colon-joined into
  // the cache key); queryFn = inline `() => fetch('<url-literal>')`; staleTime
  // = number literal (ms). Anything else WARNS and bails to undeclared, so the
  // hook-arc's "no native lowering" diagnostic still fires rather than the
  // emit mis-lowering a shape it can't honour.

  const type = ctx.typeArg()
  if (type.kind === 'unknown') {
    ctx.report(
      `Declaration ${name}: useQuery without a response type lowers to a decode of Any on Swift, which does NOT compile — Any cannot conform to Decodable. Give it the shape you expect: useQuery<Response>(() => ({ … })). Kotlin compiles either way, so this breaks iOS only.`,
    )
    return null
  }
  const optsFn = init.arguments?.[0] as AnyNode | undefined
  if (!optsFn || optsFn.type !== 'ArrowFunctionExpression') {
    ctx.report(
      `Declaration ${name}: useQuery expects an options function \`() => ({ queryKey, queryFn, staleTime })\`; got ${optsFn?.type ?? 'nothing'}. The @pyreon/query hooks take options as a FUNCTION so queryKey can read signals.`,
    )
    return null
  }
  // The @pyreon/http endpoint `.query()` fetcher form —
  // `useQuery(() => getUser.query({ params: { … } }))` — is NOT lowered in
  // v1 (the useQuery emit expects a literal `queryKey` + inline `fetch`
  // queryFn). Detect it explicitly so the diagnostic names the real shape
  // and the actionable fix, instead of the generic "must return an object
  // literal" below.
  const endpointQuery = endpointQueryCallInArrow(optsFn, ctx)
  if (endpointQuery) {
    // The @pyreon/http endpoint `.query()` fetcher form —
    // `useQuery<T>(() => getUser.query({ params: { … } }))` — resolves the
    // endpoint to a concrete URL + method (same compile-time templating as
    // `useFetch(getUser({ params }))`) and lowers to the SAME `kind: 'query'`
    // PyreonQuery path, no emit change. The queryKey is `method:url` so the
    // native cache keys distinctly per endpoint call. Reactive params / a
    // computed baseUrl still stay web (resolveEndpointParts warns + bails).
    const resolved = ctx.requests.resolve(
      endpointQuery.name,
      endpointQuery.call.arguments?.[0] as AnyNode | undefined,
      // The query harness re-fetches on key change, so a RUNTIME `:param`
      // is honourable here (and only here — see the flag's own doc).
      { allowRuntimeParams: true, streaming: false },
    )
    if (!resolved) return null
    ctx.recordDecode(type, resolved.response)
    const eqReq: {
      urlExpr?: ExprIR
      queryKeyExpr?: ExprIR
      method?: string
      headers?: Record<string, string>
      body?: string
    } = {}
    if (resolved.method && resolved.method !== 'GET') eqReq.method = resolved.method
    if (resolved.headers) eqReq.headers = resolved.headers
    if (resolved.body !== undefined) eqReq.body = resolved.body
    if (resolved.urlExpr !== undefined) {
      eqReq.urlExpr = resolved.urlExpr
      // The cache key MUST carry the runtime parts too. A key built from the
      // literal `url` alone would collapse every id onto ONE cache entry —
      // the first user fetched would be served for every other id, and
      // nothing would re-fetch on change, because the harness re-runs on
      // KEY change. Same template, same exprs, `METHOD:` on the front.
      const kq = [...(resolved.urlExpr as { quasis: string[] }).quasis]
      kq[0] = `${resolved.method}:${kq[0] ?? ''}`
      eqReq.queryKeyExpr = {
        kind: 'template',
        quasis: kq,
        exprs: (resolved.urlExpr as { exprs: ExprIR[] }).exprs,
      }
    }
    return queryDecl({
      type,
      // `url` is omitted when a template took its place — the declaration
      // documents them as mutually exclusive, and the emit picks urlExpr
      // first, so leaving both set would be a silent contradiction.
      ...(resolved.urlExpr === undefined ? { url: resolved.url } : {}),
      queryKey: `${resolved.method}:${resolved.url}`,
      staleMillis: 0,
      ...eqReq,
    })
  }
  const optsObj = arrowReturnedObject(optsFn)
  if (!optsObj) {
    ctx.report(
      `Declaration ${name}: useQuery options function must return an object literal \`({ queryKey, queryFn, staleTime })\` to lower to native.`,
    )
    return null
  }
  let queryKey: string | undefined
  let queryKeyExpr: ExprIR | undefined
  let url: string | undefined
  let urlExpr: ExprIR | undefined
  let valueExpr: ExprIR | undefined
  let queryFnSeen = false
  let staleMillis = 0
  const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
  for (const prop of (optsObj.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type !== 'Property') continue
    if (hasDynamicKey(prop)) {
      warnDynamicKey(prop, `Declaration ${name}: useQuery options`, ctx)
      continue
    }
    const key = staticPropKey(prop)
    if (!key) continue
    if (key === 'queryKey') {
      // A `queryKey` array whose parts are ALL string/number literals bakes
      // a constant cache key (`['todo', 1]` → `"todo:1"`, the v1 path). A
      // part that reads a signal / prop / member (`['user', userId]`,
      // `['k', id()]`) builds a RUNTIME string the emit re-keys at task time
      // (see the DeclIR `queryKeyExpr` note for why this can't sit in the
      // SwiftUI `@State` default). Anything that isn't an array bails.
      const k = tryQueryKeyParts(prop.value, ctx)
      if (k === undefined) {
        ctx.report(
          `Declaration ${name}: useQuery queryKey must be an ARRAY of string/number literals or expressions (\`['todo', id()]\`) to lower to native; got ${(prop.value as AnyNode | undefined)?.type ?? 'nothing'}.`,
        )
        return null
      }
      queryKey = k.literal
      queryKeyExpr = k.expr
    } else if (key === 'queryFn') {
      queryFnSeen = true
      const f = tryQueryFnFetch(prop.value)
      if (f !== undefined) {
        if (f.url !== undefined) url = f.url
        else if (f.urlNode !== undefined) urlExpr = ctx.expr(f.urlNode)
        // An inline `fetch(url, { method, headers, body })` routes through
        // PyreonHttp (mirroring useFetch); a bare `fetch(url)` stays a GET.
        if (f.init) Object.assign(req, parseFetchInitObject(f.init, name, ctx))
      } else {
        // Not a recognized inline fetch — try a DIRECT-VALUE queryFn
        // (`() => <expr>` / `async () => <expr>` with no fetch, no await):
        // the emit computes `<expr>` in the harness and resolves it.
        const v = tryQueryFnValue(prop.value)
        if (v === undefined) {
          ctx.report(
            `Declaration ${name}: useQuery queryFn must be an inline \`() => fetch('<url>')\` (literal OR template URL) or a \`() => <expr>\` returning the decoded value directly; a function reference, a \`fetch(<non-url>)\`, or an \`await\`/multi-statement body is a tracked follow-up.`,
          )
          return null
        }
        valueExpr = ctx.expr(v)
      }
    } else if (key === 'staleTime') {
      const v = prop.value as AnyNode | undefined
      if ((v?.type === 'Literal' || v?.type === 'NumericLiteral') && typeof v.value === 'number') {
        staleMillis = v.value
      } else if (v) {
        ctx.report(
          `Declaration ${name}: useQuery staleTime must be a number literal (ms) to lower to native; got ${v.type}. Defaulting to 0 (always revalidate, serving the stale value instantly).`,
        )
      }
    }
  }
  if (queryKey === undefined) {
    ctx.report(
      `Declaration ${name}: useQuery needs a queryKey to lower to native.`,
    )
    return null
  }
  // Exactly one of the three queryFn forms must have resolved: a literal URL
  // (`url`), a templated/runtime URL (`urlExpr`), or a direct-value fetcher
  // (`valueExpr`). `queryFnSeen` distinguishes "no queryFn at all" from
  // "queryFn present but unlowerable" (which already warned above).
  if (url === undefined && urlExpr === undefined && valueExpr === undefined) {
    if (!queryFnSeen) {
      ctx.report(
        `Declaration ${name}: useQuery needs a queryFn to lower to native.`,
      )
    }
    return null
  }
  return queryDecl({
    type,
    queryKey,
    staleMillis,
    ...(url !== undefined ? { url } : {}),
    ...(urlExpr !== undefined ? { urlExpr } : {}),
    ...(valueExpr !== undefined ? { valueExpr } : {}),
    ...(queryKeyExpr !== undefined ? { queryKeyExpr } : {}),
    ...req,
  })
}

/** `@pyreon/http/stream`'s default `ReconnectPolicy`. */
const STREAM_DEFAULT_RECONNECT = { attempts: 5, delay: 1000, maxDelay: 30_000, onEnd: false }

/** `v` is `<obj>.<prop>` — `c.signal`, `ctx.onStatus`. */
function isMemberRead(v: AnyNode | undefined, obj: string | undefined, prop: string): boolean {
  return (
    obj !== undefined &&
    v?.type === 'MemberExpression' &&
    !v.computed &&
    v.object?.type === 'Identifier' &&
    v.object.name === obj &&
    v.property?.type === 'Identifier' &&
    v.property.name === prop
  )
}

/**
 * `const s = useStream<SseEvent<T>>((ctx) => openEventStream((c) => ep({ …,
 * signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus:
 * ctx.onStatus, … }), { maxEvents })` — the documented `useStream` shape, and
 * what a generated client's stream component writes.
 *
 * The endpoint resolves exactly as it does for `useQuery` (a runtime `:param`
 * is honourable: the native harness is KEYED on the URL, so a new value
 * reopens the stream — the web's reactive-source semantic). `signal` /
 * `onStatus` are consumed: cancellation and status are structural natively.
 * Every option that cannot lower is either NAMED (ignored, when the stream
 * still means the same thing) or a bail (when it would not).
 */
export function recognizeStream(_call: CallSite, ctx: ParseContext): ExtDeclSpec | null | undefined {
  const name = ctx.declName
  const init = { arguments: ctx.args } as AnyNode
  const bail = (why: string): null => {
    ctx.report(
      `Declaration ${name}: useStream ${why} This stream stays web — on iOS and Android the call is reproduced verbatim and does not compile.`,
    )
    return null
  }
  const ignored = (what: string, why: string): void => {
    ctx.report(`Declaration ${name}: useStream ${what} is IGNORED on iOS and Android (${why}).`)
  }
  const srcArrow = init.arguments?.[0] as AnyNode | undefined
  const ctxParam = (srcArrow?.params as AnyNode[] | undefined)?.[0]?.name as string | undefined
  const open = arrowReturnedCall(srcArrow)
  const openName = open?.callee?.type === 'Identifier' ? (open.callee.name as string) : undefined
  const format = openName !== undefined ? streamFacts(ctx).openers.get(openName) : undefined
  if (!open || format === undefined) {
    return bail(
      'lowers when its source directly returns `openEventStream(…)` / `openNdjsonStream(…)` imported from `@pyreon/http/stream` — `(ctx) => openEventStream((c) => endpoint({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus })`.',
    )
  }
  const connect = open.arguments?.[0] as AnyNode | undefined
  const cParam = (connect?.params as AnyNode[] | undefined)?.[0]?.name as string | undefined
  const epCall = arrowReturnedCall(connect)
  const epName = epCall?.callee?.type === 'Identifier' ? (epCall.callee.name as string) : undefined
  if (!epCall || epName === undefined || !ctx.requests.has(epName)) {
    return bail(
      'connects through a same-file `@pyreon/http` endpoint — `(c) => ep({ signal: c.signal, headers: c.headers })` with `const ep = api.endpoint(…)` and `const api = createHttp({ baseUrl })`. A `fetch(…)` transport or an imported endpoint is a tracked follow-up.',
    )
  }
  const epArg = epCall.arguments?.[0] as AnyNode | undefined
  if (epArg !== undefined && epArg.type !== 'ObjectExpression') {
    return bail('needs the endpoint call argument to be an object literal.')
  }
  // `signal` is how the web cancels; natively the stream is cancelled by the
  // view's lifecycle. `headers: c.headers` is how the web adds `accept` /
  // `last-event-id`; the native runtime adds both itself.
  // `headers: { ...c.headers, accept: 'application/jsonl' }` — the stream's
  // own headers plus literal extras (a generated client names a non-default
  // stream media type this way). The spread is the runtime's job; the literal
  // props lower, and `accept` becomes the stream's Accept.
  let accept: string | undefined
  // A RUNTIME `json` body — the common POST-stream shape (`json: { prompt:
  // prompt() }`). The endpoint resolver only bakes a LITERAL body (and sends
  // none otherwise), so it is taken out here and serialized per run through
  // the `JSON.stringify` lowering instead.
  let requestBodyExpr: ExprIR | undefined
  const kept = ((epArg?.properties as AnyNode[] | undefined) ?? []).flatMap((p): AnyNode[] => {
    const k = propName(p)
    if (k === 'signal') return []
    const v = p.value as AnyNode | undefined
    if (k === 'json' && v !== undefined && !isNullishLiteral(v) && readJsonLiteral(v) === undefined) {
      requestBodyExpr = { kind: 'json-stringify', arg: ctx.expr(v) }
      return []
    }
    if (k === 'headers' && isMemberRead(v, cParam, 'headers')) return []
    if (k === 'headers' && v?.type === 'ObjectExpression') {
      const props = (v.properties as AnyNode[] | undefined) ?? []
      const rest = props.filter(
        (hp) => !(hp.type === 'SpreadElement' && isMemberRead(hp.argument as AnyNode | undefined, cParam, 'headers')),
      )
      if (rest.length === props.length) return [p]
      const literal = rest.filter((hp) => {
        if (propName(hp)?.toLowerCase() !== 'accept') return true
        const a = literalScalar(hp.value as AnyNode | undefined)
        if (typeof a === 'string') accept = a
        return typeof a !== 'string'
      })
      return literal.length > 0 ? [{ ...p, value: { ...v, properties: literal } } as AnyNode] : []
    }
    return [p]
  })
  const filtered = epArg !== undefined ? ({ ...epArg, properties: kept } as AnyNode) : undefined
  const resolved = ctx.requests.resolve(epName, filtered, { allowRuntimeParams: true, streaming: true })
  if (!resolved) return null
  let reqHeaders = resolved.headers
  if (requestBodyExpr !== undefined && !Object.keys(reqHeaders ?? {}).some((k) => k.toLowerCase() === 'content-type')) {
    // The web's `json` sets this unless the caller declared one (see the
    // literal-body branch of the endpoint resolver).
    reqHeaders = { ...reqHeaders, 'content-type': 'application/json' }
  }

  let sseText = false
  let events: string[] | undefined
  let lastEventId: string | undefined
  let reconnect: { attempts: number; delay: number; maxDelay: number; onEnd: boolean } | null =
    format === 'sse' ? { ...STREAM_DEFAULT_RECONNECT } : null
  const opts = open.arguments?.[1] as AnyNode | undefined
  if (opts !== undefined) {
    if (opts.type !== 'ObjectExpression') return bail(`needs \`${openName}\`'s options to be an object literal.`)
    for (const p of (opts.properties as AnyNode[] | undefined) ?? []) {
      if (p.type === 'SpreadElement') {
        ignored('an options spread', 'it cannot be read at compile time — pass the options literally')
        continue
      }
      const k = propName(p)
      const v = p.value as AnyNode | undefined
      if (k === undefined) continue
      if (k === 'signal' || k === 'onStatus') {
        if (!isMemberRead(v, ctxParam, k)) {
          ignored(`option \`${k}\``, `only \`${k}: ctx.${k}\` is understood — cancellation and status are driven by the view natively`)
        }
        continue
      }
      if (format === 'sse' && k === 'data') {
        const lit = literalScalar(v)
        if (lit === 'text') sseText = true
        else if (lit !== 'json') return bail("needs `data` to be the literal 'json' or 'text'.")
        continue
      }
      if (format === 'sse' && k === 'events') {
        const els = v?.type === 'ArrayExpression' ? ((v.elements as AnyNode[] | undefined) ?? []) : undefined
        const names = els?.map((e) => literalScalar(e))
        if (!names || names.some((x) => typeof x !== 'string')) {
          return bail('needs `events` to be an array of string literals — the filter is baked into the native request.')
        }
        events = names as string[]
        continue
      }
      if (format === 'sse' && k === 'lastEventId') {
        const id = ctx.staticString(v)
        if (id === null) return bail('needs `lastEventId` to be a string literal (or a module-scope const).')
        lastEventId = id
        continue
      }
      if (format === 'sse' && k === 'reconnect') {
        const lit = literalScalar(v)
        if (lit === false) {
          reconnect = null
          continue
        }
        if (lit === true) continue
        if (v?.type !== 'ObjectExpression') {
          return bail('needs `reconnect` to be `true`, `false` or an object literal of number/boolean literals.')
        }
        const next = { ...STREAM_DEFAULT_RECONNECT }
        for (const rp of (v.properties as AnyNode[] | undefined) ?? []) {
          const rk = propName(rp)
          const rv = literalScalar(rp.value as AnyNode | undefined)
          if ((rk === 'attempts' || rk === 'delay' || rk === 'maxDelay') && typeof rv === 'number') next[rk] = rv
          else if (rk === 'onEnd' && typeof rv === 'boolean') next.onEnd = rv
          else if (rk === 'shouldRetry') {
            ignored('`reconnect.shouldRetry`', 'a JS predicate — the native runtime applies the default rule: network, 408, 429 and 5xx retry')
          } else {
            return bail(`needs \`reconnect.${rk ?? '?'}\` to be a number/boolean literal.`)
          }
        }
        reconnect = next
        continue
      }
      if (k === 'parse') {
        ignored(
          'option `parse`',
          'schema validation stays web: each payload is decoded into the declared type, so a malformed payload still ends the stream in `error`, but refinements beyond the type do not run',
        )
        continue
      }
      ignored(`option \`${k}\``, 'not part of the lowered stream surface')
    }
  }

  let maxEvents = 1000
  let enabled: ExprIR | undefined
  let onEventNode: AnyNode | undefined
  const hookOpts = init.arguments?.[1] as AnyNode | undefined
  if (hookOpts !== undefined) {
    if (hookOpts.type !== 'ObjectExpression') return bail('needs its options to be an object literal.')
    for (const p of (hookOpts.properties as AnyNode[] | undefined) ?? []) {
      const k = propName(p)
      const node = unwrapTypeLayers(p.value as AnyNode | undefined)
      const v = literalScalar(node)
      if (k === 'maxEvents' && typeof v === 'number') maxEvents = v
      else if (k === 'enabled') {
        // `enabled: true | false | () => expr | expr` — the web reads it
        // TRACKED on every run (`typeof enabled === 'function' ? enabled() :
        // enabled`), so the accessor's BODY is the value, and a literal
        // `true` is the default.
        if (v === true) continue
        if (v === false) {
          enabled = { kind: 'literal', value: false }
          continue
        }
        const expr = arrowExprBody(node) ?? (isFunctionNode(node) ? undefined : node)
        if (expr === undefined) {
          return bail('needs `enabled` to be a boolean, an expression, or an accessor returning one (`() => ready()`).')
        }
        enabled = ctx.expr(expr)
      } else if (k === 'onEvent') {
        if (!isFunctionNode(node)) {
          return bail('needs `onEvent` to be an inline function — `(event) => { … }` — to lower as the per-event callback.')
        }
        const params = (node!.params as AnyNode[] | undefined) ?? []
        const second = params[1]?.type === 'Identifier' ? (params[1].name as string) : undefined
        if (params.length > 2 || (params[1] !== undefined && second === undefined)) {
          return bail('`onEvent` takes `(event, queryClient)` — no other shape lowers.')
        }
        if (second !== undefined && identifierReferenced(node!.body as AnyNode, second)) {
          return bail(
            `\`onEvent\` uses its second argument (\`${second}\`, the QueryClient) — native queries are self-contained PyreonQuery containers with no shared client to write into, so this callback cannot mean the same thing there.`,
          )
        }
        onEventNode = node
      } else {
        ignored(`option \`${k ?? '…'}\``, 'not part of the lowered stream surface')
      }
    }
  }

  let itemType = ctx.typeArg()
  let dataType: TypeIR | undefined
  if (format === 'sse') {
    if (itemType.kind === 'typeRef' && itemType.name === 'SseEvent' && itemType.args.length === 1) {
      dataType = itemType.args[0]
    } else if (itemType.kind === 'unknown') {
      const g = ctx.typeArgOf(open)
      if (g.kind !== 'unknown') dataType = g
      else if (sseText) dataType = { kind: 'string' }
    } else {
      return bail('over SSE yields `SseEvent<T>` items — declare it `useStream<SseEvent<T>>(…)`.')
    }
    if (dataType === undefined) {
      return bail(
        'needs the event payload type — `useStream<SseEvent<T>>(…)` or `openEventStream<T>(…)`. A native stream decodes each event INTO a declared type; there is nothing to decode `unknown` into.',
      )
    }
    if (sseText && dataType.kind !== 'string') return bail("with `data: 'text'` yields string payloads — declare `SseEvent<string>`.")
    itemType = { kind: 'typeRef', name: 'SseEvent', args: [dataType] }
  } else {
    if (itemType.kind === 'unknown') itemType = ctx.typeArgOf(open)
    if (itemType.kind === 'unknown') {
      return bail('needs the item type — `useStream<T>(…)` or `openNdjsonStream<T>(…)`. A native stream decodes each line INTO a declared type.')
    }
    dataType = itemType
  }
  let onEvent: { param: string; body: StatementIR[] } | undefined
  if (onEventNode !== undefined) {
    const p0 = ((onEventNode.params as AnyNode[] | undefined) ?? [])[0]
    const param = p0?.type === 'Identifier' ? (p0.name as string) : '_'
    if (p0 !== undefined && p0.type !== 'Identifier') {
      return bail('needs `onEvent`\'s event parameter to be a plain name — `(event) => …`.')
    }
    const body = onEventNode.body as AnyNode
    const stmts: StatementIR[] =
      body.type === 'BlockStatement' ? ctx.statements(body) : [{ kind: 'expr', expr: ctx.expr(body) }]
    onEvent = { param, body: stmts }
  }
  return {
    type: STREAM_TYPE,
    payload: {
    format,
    itemType,
    dataType,
    sseText,
    url: resolved.url,
    ...(resolved.urlExpr !== undefined ? { urlExpr: resolved.urlExpr } : {}),
    method: resolved.method,
    ...(reqHeaders !== undefined ? { headers: reqHeaders } : {}),
    ...(accept !== undefined ? { accept } : {}),
    ...(resolved.body !== undefined ? { requestBody: resolved.body } : {}),
    ...(requestBodyExpr !== undefined ? { requestBodyExpr } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
    ...(onEvent !== undefined ? { onEvent } : {}),
    ...(events !== undefined ? { events } : {}),
    ...(lastEventId !== undefined ? { lastEventId } : {}),
    reconnect,
    maxEvents,
    } as unknown as ExtPayload,
  }
}

/**
 * If an options arrow directly returns `<endpoint>.query(...)` on a known
 * @pyreon/http endpoint, return the endpoint name; else undefined. Handles the
 * concise (`() => e.query(…)`) and block-return (`() => { return e.query(…) }`)
 * arrow shapes.
 */
function endpointQueryCallInArrow(
  arrow: AnyNode,
  ctx: ParseContext,
): { name: string; call: AnyNode } | undefined {
  const body = arrow?.body as AnyNode | undefined
  let expr: AnyNode | undefined
  if (body?.type === 'CallExpression') expr = body
  else if (body?.type === 'ParenthesizedExpression') expr = body.expression as AnyNode | undefined
  else if (body?.type === 'BlockStatement') {
    for (const st of (body.body as AnyNode[] | undefined) ?? []) {
      if (st.type === 'ReturnStatement') {
        const a = st.argument as AnyNode | undefined
        expr = a?.type === 'ParenthesizedExpression' ? (a.expression as AnyNode | undefined) : a
        break
      }
    }
  }
  if (expr?.type !== 'CallExpression') return undefined
  const callee = expr.callee as AnyNode | undefined
  if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    ctx.requests.has(callee.object.name as string) &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'query'
  ) {
    return { name: callee.object.name as string, call: expr }
  }
  return undefined
}

/**
 * The object literal an arrow function returns, for both the concise form
 * `() => ({ … })` and the block form `() => { return { … } }`. Returns
 * undefined for anything else (so the caller warns + bails).
 */
function arrowReturnedObject(arrow: AnyNode): AnyNode | undefined {
  const body = arrow?.body
  if (!body) return undefined
  // Concise: `() => ({...})` — the body IS the ObjectExpression (the parens are
  // grouping the parser drops). Some parsers wrap in ParenthesizedExpression.
  if (body.type === 'ObjectExpression') return body
  if (body.type === 'ParenthesizedExpression' && body.expression?.type === 'ObjectExpression') {
    return body.expression
  }
  // Block: `() => { return {...} }` — find the (single) return of an object.
  if (body.type === 'BlockStatement') {
    for (const st of (body.body as AnyNode[] | undefined) ?? []) {
      if (st.type === 'ReturnStatement') {
        const arg = st.argument
        if (arg?.type === 'ObjectExpression') return arg
        if (arg?.type === 'ParenthesizedExpression' && arg.expression?.type === 'ObjectExpression') {
          return arg.expression
        }
      }
    }
  }
  return undefined
}

/**
 * Resolve a `queryKey` array into the native cache key. Returns:
 *   `{ literal }`       — every element is a string/number literal
 *                         (`['todos', 5]` → `"todos:5"`), the baked-constant path.
 *   `{ literal, expr }` — at least one element is a non-literal expression
 *                         (`['user', userId]`, `['k', id()]`): `expr` is a
 *                         `template` ExprIR that colon-joins the parts as a
 *                         RUNTIME string (literals in the quasis, expressions
 *                         interpolated), and `literal` carries the literal-only
 *                         join as an inert fallback for the IR's required
 *                         `queryKey` field (the emit reads `expr` on this path).
 * Returns undefined when the node is not an array, is empty, or holds a spread.
 */
function tryQueryKeyParts(
  node: AnyNode,
  ctx: ParseContext,
): { literal: string; expr?: ExprIR } | undefined {
  if (!node || node.type !== 'ArrayExpression') return undefined
  const els = (node.elements as AnyNode[] | undefined) ?? []
  if (els.length === 0) return undefined
  const quasis: string[] = ['']
  const exprs: ExprIR[] = []
  const literalParts: string[] = []
  let hasExpr = false
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el || el.type === 'SpreadElement') return undefined
    const sep = i === 0 ? '' : ':'
    const isLit =
      el.type === 'Literal' || el.type === 'StringLiteral' || el.type === 'NumericLiteral'
    if (isLit && (typeof el.value === 'string' || typeof el.value === 'number')) {
      quasis[quasis.length - 1] += sep + String(el.value)
      literalParts.push(String(el.value))
    } else {
      hasExpr = true
      quasis[quasis.length - 1] += sep
      exprs.push(ctx.expr(el))
      quasis.push('')
    }
  }
  const literal = literalParts.join(':')
  return hasExpr ? { literal, expr: { kind: 'template', quasis, exprs } } : { literal }
}

/**
 * Extract the URL + optional init object from an inline
 * `queryFn: () => fetch('<url>', { method, headers, body })` (also
 * `() => fetch('<url>').then(r => r.json())`, or a block body returning one).
 * Walks the arrow's body for the first `fetch(<url>, init?)` call. Returns:
 *   `{ url, init }`     — a STRING-LITERAL URL (baked verbatim).
 *   `{ urlNode, init }` — a TEMPLATE / identifier / member URL
 *                         (`\`/users/${id}\``, `endpoint`, `props.url`), emitted
 *                         as native string interpolation in the async harness.
 * Returns undefined for a function reference, a `fetch(<call-expression>)` URL
 * that can't be safely baked, or a non-fetch body (the caller then tries the
 * direct-value form).
 */
function tryQueryFnFetch(
  node: AnyNode,
): { url?: string; urlNode?: AnyNode; init?: AnyNode } | undefined {
  if (
    !node ||
    (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression')
  ) {
    return undefined
  }
  let found: { url?: string; urlNode?: AnyNode; init?: AnyNode } | undefined
  const visit = (n: AnyNode): void => {
    if (found || !n || typeof n !== 'object') return
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'Identifier' &&
      n.callee.name === 'fetch'
    ) {
      const arg = n.arguments?.[0]
      const init = n.arguments?.[1]
      if (
        (arg?.type === 'Literal' || arg?.type === 'StringLiteral') &&
        typeof arg.value === 'string'
      ) {
        found = { url: arg.value, init }
        return
      }
      if (
        arg &&
        (arg.type === 'TemplateLiteral' ||
          arg.type === 'Identifier' ||
          arg.type === 'MemberExpression')
      ) {
        found = { urlNode: arg, init }
        return
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') {
        continue
      }
      const child = (n as Record<string, AnyNode>)[key]
      if (Array.isArray(child)) {
        for (const c of child) visit(c)
      } else if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }
  visit(node.body)
  return found
}

/**
 * A DIRECT-VALUE `queryFn` — `() => <expr>` / `async () => <expr>`, or a block
 * body that is a single `return <expr>`, whose returned expression performs NO
 * `fetch` and NO `await`. Returns the returned-expression AST node (the emit
 * computes it in the harness and `resolve`s it directly, no URLSession/decode),
 * or undefined for a fetch body, an await, a multi-statement block, or a
 * function reference.
 */
function tryQueryFnValue(node: AnyNode): AnyNode | undefined {
  if (
    !node ||
    (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression')
  ) {
    return undefined
  }
  let expr: AnyNode | undefined
  const body = node.body as AnyNode | undefined
  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[] | undefined) ?? []
    const only = stmts[0]
    if (stmts.length !== 1 || only?.type !== 'ReturnStatement' || !only.argument) {
      return undefined
    }
    expr = only.argument as AnyNode
  } else {
    expr = body
  }
  if (!expr) return undefined
  let disallowed = false
  const visit = (n: AnyNode): void => {
    if (disallowed || !n || typeof n !== 'object') return
    if (n.type === 'AwaitExpression') {
      disallowed = true
      return
    }
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'Identifier' &&
      n.callee.name === 'fetch'
    ) {
      disallowed = true
      return
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') {
        continue
      }
      const child = (n as Record<string, AnyNode>)[key]
      if (Array.isArray(child)) {
        for (const c of child) visit(c)
      } else if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }
  visit(expr)
  return disallowed ? undefined : expr
}

/**
 * Parse a `fetch(url, { method, headers, body })` init object into the literal
 * request fields. Mirrors the useFetch rule: literals are baked, anything
 * non-literal WARNS (a silently-wrong verb/body is worse than a missing
 * feature). Returns the request fields; a missing/non-object init → GET.
 */
function parseFetchInitObject(
  initNode: AnyNode,
  name: string,
  ctx: ParseContext,
): { method?: string; headers?: Record<string, string>; body?: string } {
  const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
  if (!initNode) return req
  if (initNode.type !== 'ObjectExpression') {
    ctx.report(
      `Declaration ${name}: useQuery queryFn fetch init must be an object literal to lower to native; got ${initNode.type}. The request will be a plain GET.`,
    )
    return req
  }
  for (const prop of (initNode.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type !== 'Property') continue
    if (hasDynamicKey(prop)) {
      warnDynamicKey(prop, `Declaration ${name}: useQuery queryFn fetch init`, ctx)
      continue
    }
    const key = staticPropKey(prop)
    if (!key) continue
    const value = prop.value as AnyNode | undefined
    const isStringLit =
      (value?.type === 'Literal' || value?.type === 'StringLiteral') &&
      typeof value.value === 'string'
    if (key === 'method') {
      if (!isStringLit) {
        ctx.report(
          `Declaration ${name}: useQuery queryFn fetch method must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be a plain GET.`,
        )
        continue
      }
      req.method = String(value!.value).toUpperCase()
    } else if (key === 'body') {
      if (!isStringLit) {
        ctx.report(
          `Declaration ${name}: useQuery queryFn fetch body must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO body.`,
        )
        continue
      }
      req.body = String(value!.value)
    } else if (key === 'headers') {
      if (value?.type !== 'ObjectExpression') {
        ctx.report(
          `Declaration ${name}: useQuery queryFn fetch headers must be an object literal to lower to native; got ${value?.type ?? 'nothing'}. Headers will be omitted.`,
        )
        continue
      }
      const headers: Record<string, string> = {}
      for (const h of (value.properties as AnyNode[] | undefined) ?? []) {
        if (h.type !== 'Property') continue
        if (hasDynamicKey(h)) {
          warnDynamicKey(h, `Declaration ${name}: useQuery queryFn fetch headers`, ctx)
          continue
        }
        const hk = staticPropKey(h)
        const hv = h.value
        if (hk && (hv?.type === 'Literal' || hv?.type === 'StringLiteral') && typeof hv.value === 'string') {
          headers[hk] = hv.value
        }
      }
      if (Object.keys(headers).length > 0) req.headers = headers
    }
  }
  return req
}


/**
 * `const client = new QueryClient()` from `@pyreon/query` → a `query-client` declaration, which
 * emits NOTHING.
 *
 * On the web the client is mandatory: `useQuery` reads it from `<QueryClientProvider>` and throws
 * `No QueryClient found` without one. The native lowering is self-contained — `useQuery` becomes a
 * `PyreonQuery` that holds its own state — so there is no client for the binding to be, and emitting
 * nothing is the whole lowering. Recognizing it is what stops the generic path from emitting
 * `let client = ""` (an unused junk binding) beside the transparent provider.
 */
export function recognizeQueryClient(call: CallSite): ExtDeclSpec | null | undefined {
  return call.construct === true ? { type: QUERY_CLIENT_TYPE } : undefined
}
