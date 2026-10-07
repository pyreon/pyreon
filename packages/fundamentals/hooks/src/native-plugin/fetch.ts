// How `useFetch<T>(url, init?)` crosses to native: a reactive `PyreonFetch<T>` container the component holds, driven by a
// mount-time harness (SwiftUI `.task`, Compose `LaunchedEffect(Unit)`) that issues the request and resolves or rejects it.
//
//   Swift   → `@State private var user = PyreonFetch<User>()` + `.task { user.begin(); … user.resolve(…) }`
//   Kotlin  → `val user = remember { PyreonFetch<User>() }` + `LaunchedEffect(Unit) { user.begin(); … user.resolve(…) }`
//
// The URL is BAKED into the harness, so it must be knowable at build time: an inline string, a module-scope string `const`, or a
// same-file endpoint call a request source (`@pyreon/http`) resolves. A request with a verb, headers or a body goes through
// `PyreonHttp` (the runtime with full verb support); a bare GET keeps the device-proven `URLSession` / `URL.readText` path.

import {
  hasDynamicKey,
  kotlinStr,
  staticPropKey,
  swiftStr,
  type CallRecognizer,
  type DeclEmitter,
  type ExtDecl,
  type ExtPayload,
  type ReceiverLowering,
  type ReceiverSite,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const FETCH_TYPE = 'fetch'

interface FetchPayload {
  readonly type: TypeIR
  readonly url: string
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

const payloadOf = (d: ExtDecl): FetchPayload => d.payload as unknown as FetchPayload

/** A native `Error` — what the container's `error` field holds on both runtimes (and on the web). */
const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

/** The fields a fetch container exposes as plain reads (the web reads them as signals). `refetch` is a real method. */
const FETCH_FIELDS: ReadonlySet<string> = new Set(['data', 'isPending', 'isFetching', 'error'])

const isStringLiteral = (node: AnyNode): boolean =>
  (node?.type === 'Literal' || node?.type === 'StringLiteral') && typeof node.value === 'string'

/**
 * `const x = useFetch<T>('/url', { method, headers, body })`. The decoded type comes from the generic argument. The init is read
 * LOUDLY: every field used to be discarded in silence, so an author writing `method: 'POST'` got a GET on both targets with no
 * diagnostic — a request that silently uses the wrong verb is a data-corrupting no-op, not a missing feature. Literals are
 * baked; anything non-literal WARNS rather than being quietly ignored.
 */
export const recognizeFetch: CallRecognizer = (_call, ctx) => {
  const type = ctx.typeArg()
  const urlArg = ctx.args[0] as AnyNode | undefined
  // A request source's endpoint DSL — `useFetch<T>(getUser({ params: { id: '1' } }))` (`@pyreon/http`, through
  // `CompilerPlugin.requestSources`). A same-file, compile-time-templated call resolves to a concrete URL literal + HTTP
  // method, then feeds the path below exactly as if the author had written `useFetch<T>('/api/users/1', { method: 'GET' })`.
  // Reactive params / a non-literal client baseUrl bail (the source pushes the warning) and the call stays web.
  let resolvedUrl: string | undefined
  let resolvedEndpoint: { method?: string | undefined; headers?: Record<string, string> | undefined; body?: string | undefined } | undefined
  if (urlArg?.type === 'CallExpression' && urlArg.callee?.type === 'Identifier' && ctx.requests.has(urlArg.callee.name as string)) {
    const resolved = ctx.requests.resolve(urlArg.callee.name as string, urlArg.arguments?.[0] as AnyNode | undefined, {
      allowRuntimeParams: false,
      streaming: false,
    })
    if (!resolved) return null // warning already pushed; stays web
    ctx.recordDecode(type, resolved.response)
    resolvedUrl = resolved.url
    resolvedEndpoint = resolved
  }
  // A module-scope `const` counts: naming an endpoint once and reusing it is ordinary, and the value is as known at build time
  // as an inline string.
  const constUrl = resolvedUrl === undefined ? ctx.staticString(urlArg) : null
  if (resolvedUrl === undefined && constUrl === null) {
    ctx.warn(
      `useFetch needs a statically-known url — an inline string, or a module-scope \`const\` holding one. The url is BAKED into the native request, so a computed one cannot be resolved at build time. Got ${urlArg?.type ?? 'nothing'}.`,
    )
    return null
  }
  const url = resolvedUrl ?? (constUrl as string)
  // No generic → `unknown` → Swift emits `decode(Any.self, …)`, which does NOT compile: `Any` cannot conform to Decodable. Kotlin
  // is unaffected, so this is a Swift-only silent break, and the device-proven examples all use the typed form.
  if (type.kind === 'unknown') {
    ctx.warn(
      `useFetch without a response type lowers to decode(Any.self, ...) on Swift, which does NOT compile - Any cannot conform to Decodable. Give it the shape you expect: useFetch<Response>('${url}') with a type/interface declared alongside the component. Kotlin compiles either way, so this breaks iOS only.`,
    )
  }
  const initArg = ctx.args[1] as AnyNode | undefined
  const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
  // An endpoint's verb / headers / json body are the DEFAULTS; an explicit second argument still wins (the loop below overwrites).
  if (resolvedEndpoint?.method) req.method = resolvedEndpoint.method
  if (resolvedEndpoint?.headers) req.headers = resolvedEndpoint.headers
  if (resolvedEndpoint?.body !== undefined) req.body = resolvedEndpoint.body
  if (initArg) {
    if (initArg.type !== 'ObjectExpression') {
      ctx.warn(`useFetch init must be an object literal to lower to native; got ${initArg.type}. The request will be a plain GET on iOS and Android.`)
    } else {
      for (const prop of (initArg.properties as AnyNode[] | undefined) ?? []) {
        if (prop.type !== 'Property') continue
        if (hasDynamicKey(prop)) {
          ctx.warnDynamicKey(prop, `Declaration ${ctx.declName}: useFetch init`)
          continue
        }
        const key = staticPropKey(prop)
        if (!key) continue
        const value = prop.value as AnyNode
        if (key === 'method') {
          if (!isStringLiteral(value)) {
            ctx.warn(
              `useFetch method must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be a plain GET on iOS and Android.`,
            )
            continue
          }
          req.method = String(value.value).toUpperCase()
        } else if (key === 'body') {
          if (!isStringLiteral(value)) {
            // A `JSON.stringify(obj)` body is the obvious next shape and is NOT supported — say so rather than sending an empty body.
            ctx.warn(
              `useFetch body must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO body on iOS and Android.`,
            )
            continue
          }
          req.body = String(value.value)
        } else if (key === 'headers') {
          if (value?.type !== 'ObjectExpression') {
            ctx.warn(
              `useFetch headers must be an object literal of string literals to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO headers on iOS and Android.`,
            )
            continue
          }
          const headers: Record<string, string> = {}
          for (const h of (value.properties as AnyNode[] | undefined) ?? []) {
            if (h.type !== 'Property') continue
            if (hasDynamicKey(h)) {
              ctx.warnDynamicKey(h, `Declaration ${ctx.declName}: useFetch headers`)
              continue
            }
            const hk = staticPropKey(h)
            const hv = h.value as AnyNode
            if (hk && isStringLiteral(hv)) headers[hk] = hv.value as string
            else if (hk) ctx.warn(`useFetch header "${hk}" must be a string literal to lower to native; it will be OMITTED on iOS and Android.`)
          }
          if (Object.keys(headers).length > 0) req.headers = headers
        } else {
          // `signal`, `credentials`, `mode`, … are web-fetch options with no native analogue. Naming them beats dropping them silently.
          ctx.warn(`useFetch init option "${key}" has no native equivalent and is ignored on iOS and Android.`)
        }
      }
    }
  }
  // The IR inside the payload (`TypeIR`) is JSON, which `ExtPayload` cannot express structurally.
  return { type: FETCH_TYPE, payload: { type, url, ...req } as unknown as ExtPayload }
}

const hasRequestInit = (p: FetchPayload): boolean => Boolean(p.method || p.headers || p.body)

/** `.task { … }` on the stable-identity host: begin → request → resolve | reject. Lines are relative to the modifier's own indentation. */
function swiftHarness(d: ExtDecl, ctx: { ident(name: string): string; typeText(t: TypeIR): string }): readonly string[] {
  const p = payloadOf(d)
  const name = ctx.ident(d.name)
  const lines: string[] = [`.task {`, `  ${name}.begin()`, `  do {`]
  if (hasRequestInit(p)) {
    // A request with a VERB, headers, or a body goes through PyreonHttp — the runtime that has shipped on both targets with full verb
    // support. The bare-GET path below is left alone deliberately: it is device-proven, and re-routing it would put a proven path
    // behind a brand-new Android executor.
    const method = (p.method ?? 'GET').toLowerCase()
    const parts = [`method: .${method}`, `url: ${swiftStr(p.url)}`]
    if (p.headers) {
      const pairs = Object.entries(p.headers).map(([k, v]) => `${swiftStr(k)}: ${swiftStr(v)}`).join(', ')
      parts.push(`headers: [${pairs}]`)
    }
    if (p.body !== undefined) parts.push(`body: Data(${swiftStr(p.body)}.utf8)`)
    lines.push(`    let __response = try await PyreonHttp.send(`)
    lines.push(`      PyreonHttpRequest(${parts.join(', ')})`)
    lines.push(`    )`)
    // A non-2xx must REJECT rather than decode. Handing an error page to JSONDecoder surfaces as a decode failure, which reads as
    // "the server sent bad JSON" and hides the actual status.
    lines.push(`    guard __response.isOK else {`)
    lines.push(`      throw PyreonHttpError.badStatus(__response.status)`)
    lines.push(`    }`)
    lines.push(`    ${name}.resolve(try __response.decode(${ctx.typeText(p.type)}.self))`)
  } else {
    lines.push(`    let (bytes, _) = try await URLSession.shared.data(from: URL(string: ${swiftStr(p.url)})!)`)
    lines.push(`    ${name}.resolve(try JSONDecoder().decode(${ctx.typeText(p.type)}.self, from: bytes))`)
  }
  lines.push(`  } catch { ${name}.reject(error) }`, `}`)
  return lines
}

/** `LaunchedEffect(Unit) { … }`: a SIBLING node keyed on a stable `Unit`, which recomposition does not cancel. */
function kotlinHarness(d: ExtDecl, ctx: { ident(name: string): string; typeText(t: TypeIR): string }): readonly string[] {
  const p = payloadOf(d)
  const name = ctx.ident(d.name)
  const lines: string[] = [`LaunchedEffect(Unit) {`, `  ${name}.begin()`, `  try {`]
  if (hasRequestInit(p)) {
    // Mirrors the Swift branch one-for-one; `readText()` below cannot express a verb, headers or a body.
    const parts = [`method = PyreonHttpMethod.${(p.method ?? 'GET').toUpperCase()}`, `url = ${kotlinStr(p.url)}`]
    if (p.headers) {
      const pairs = Object.entries(p.headers).map(([k, v]) => `${kotlinStr(k)} to ${kotlinStr(v)}`).join(', ')
      parts.push(`headers = mapOf(${pairs})`)
    }
    if (p.body !== undefined) parts.push(`body = ${kotlinStr(p.body)}`)
    lines.push(`    val __response = withContext(Dispatchers.IO) {`)
    lines.push(`      PyreonHttp.send(PyreonHttpRequest(${parts.join(', ')}))`)
    lines.push(`    }`)
    // A non-2xx REJECTS rather than decoding — handing an error page to the JSON decoder reads as "the server sent bad JSON".
    lines.push(`    if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)`)
    lines.push(`    ${name}.resolve(PyreonFetchJson.decodeFromString<${ctx.typeText(p.type)}>(__response.body))`)
  } else {
    lines.push(`    val body = withContext(Dispatchers.IO) { java.net.URL(${kotlinStr(p.url)}).readText() }`)
    lines.push(`    ${name}.resolve(PyreonFetchJson.decodeFromString<${ctx.typeText(p.type)}>(body))`)
  }
  lines.push(`  } catch (e: Throwable) { ${name}.reject(e) }`, `}`)
  return lines
}

export const fetchDecl: DeclEmitter = {
  // The declaration was a closed `fetch` compiler kind before it moved here; the struct names the compiler derives from a
  // declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: 'fetch',
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonFetch<${ctx.typeText(payloadOf(d).type)}>()`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonFetch<${ctx.typeText(payloadOf(d).type)}>() }`,
  lifecycle: {
    // A `.task` on a transparent conditional would restart forever (see `DeclLifecycle.stableHost`).
    stableHost: true,
    // After the compiler's own modifiers, in the order the fetch → query → stream harnesses always had.
    tailOrder: 10,
    swift: swiftHarness,
    kotlin: kotlinHarness,
  },
  // `<Suspense>` shows its fallback while ANY source is pending, `<ErrorBoundary>` while ANY failed.
  asyncState: {
    swift: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending`, error: `${ctx.ident(d.name)}.error != nil` }),
    kotlin: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending.value`, error: `${ctx.ident(d.name)}.error.value != null` }),
  },
  typing: {
    // `quotes.data()` is the web signal read: data → T | undefined, isPending → boolean, error → an optional error object.
    // `data` is OPTIONAL on every layer (the web hook is `signal<T | undefined>(undefined)`, Swift is `var data: T?`, Kotlin is
    // `MutableState<T?>`); inferring a bare `T` made the receiver look provably non-null, so the Swift member emit STRIPPED the `?.`
    // the author wrote and produced `created.data.id` for `created.data()?.id`.
    callRead(d, property) {
      switch (property) {
        case 'data': {
          const t = payloadOf(d).type
          // Already a union carrying null/undefined — leave it alone rather than nesting a second optional layer.
          if (t.kind === 'union' && t.branches.some((b) => b.kind === 'null' || b.kind === 'undefined')) return t
          return { kind: 'union', branches: [t, { kind: 'undefined' }] }
        }
        case 'isPending':
          return { kind: 'boolean' }
        case 'error':
          return { kind: 'union', branches: [ERROR_OBJECT, { kind: 'undefined' }] }
        default:
          return undefined
      }
    },
    // `quotes.data` — the property form, the native shape.
    member(d, property) {
      switch (property) {
        case 'data':
          return payloadOf(d).type
        case 'isPending':
          return { kind: 'boolean' }
        case 'error':
          return { kind: 'union', branches: [ERROR_OBJECT, { kind: 'null' }] }
        default:
          return undefined
      }
    },
  },
}

/**
 * The property of an exact `<binding>.<prop>()` call or `<binding>.<prop>` read on the receiver (the web's signal-read shape), or
 * `undefined` for anything longer or not a plain field.
 */
function fieldOf(site: ReceiverSite): string | undefined {
  if (site.kind === 'call') {
    const callee = site.expr.callee
    if (site.expr.args.length !== 0 || callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
    return FETCH_FIELDS.has(callee.property) ? callee.property : undefined
  }
  const read = site.expr
  if (read.object.kind !== 'identifier') return undefined
  return FETCH_FIELDS.has(read.property) ? read.property : undefined
}

export const fetchReceiver: ReceiverLowering = {
  swift: {
    // `quotes.data()` → a plain @Observable property read. `refetch` is a real method (parens preserved by the generic call emit).
    expr(site, ctx) {
      if (site.kind !== 'call') return undefined
      const field = fieldOf(site)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}`
    },
  },
  kotlin: {
    // Compose `MutableState` fields: both the call form and the property form read `.value`.
    expr(site, ctx) {
      const field = fieldOf(site)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${field}.value`
    },
  },
}
