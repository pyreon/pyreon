// The Swift half of the `@pyreon/query` lowering: the `@State` containers and the `.task` harnesses
// that drive them. Every harness is a pure function of the declaration's payload.

import type { EmitContext, ExtDecl } from '@pyreon/native-compiler/plugin-api'
import type { QueryPayload, StreamPayload } from './types'

const query = (d: ExtDecl): QueryPayload => d.payload as unknown as QueryPayload
const stream = (d: ExtDecl): StreamPayload => d.payload as unknown as StreamPayload

/**
 * `const q = useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` → a `@State` `PyreonQuery<T>`
 * seeded with the cache key + staleSeconds (staleTime ms → seconds). The isStale-guarded `.task`
 * harness is appended on the body.
 */
export function queryDeclSwift(d: ExtDecl, ctx: EmitContext): string {
  const p = query(d)
  const staleSeconds = p.staleMillis / 1000
  // A runtime-key / templated-URL / direct-value query constructs KEYLESS: SwiftUI's @State default
  // can't reference other properties (props/signals), so the real key is computed + applied in the
  // `.task` harness via setKey.
  const key =
    p.queryKeyExpr !== undefined || p.urlExpr !== undefined || p.valueExpr !== undefined
      ? '""'
      : ctx.stringLiteral(p.queryKey)
  return `@State private var ${ctx.ident(d.name)} = PyreonQuery<${ctx.typeText(p.type)}>(queryKey: ${key}, staleSeconds: ${staleSeconds})`
}

/** `const s = useStream(…)` → an `@State` `PyreonStream`; the `.task(id:)` harness that runs it is appended on the stable-identity body host. */
export function streamDeclSwift(d: ExtDecl, ctx: EmitContext): string {
  const p = stream(d)
  return `@State private var ${ctx.ident(d.name)} = PyreonStream<${ctx.typeText(p.itemType)}>(maxEvents: ${p.maxEvents})`
}

/**
 * useQuery: a `.task` per decl, guarded on `isStale` so a FRESH cache hit skips the network (serving
 * the hydrated value). The stale/miss path drives the same begin → resolve|reject machine as
 * useFetch; a background refresh flips only isFetching, never isPending, so already-shown data never
 * blanks.
 */
export function queryLifecycleSwift(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const d = query(decl)
  const lines: string[] = []
  const name = ctx.ident(decl.name)
  // Runtime queries (a key/URL built from a prop/signal, or a direct-value fetcher) key the harness
  // on the computed key string via `.task(id:)`, so a key change re-keys the cache (`setKey`) + re-runs
  // the fetch — matching the web's reactive queryKey. Static literal queries keep `.task {}`.
  const runtimeQuery = d.queryKeyExpr !== undefined || d.urlExpr !== undefined || d.valueExpr !== undefined
  if (runtimeQuery) {
    const keyExpr = d.queryKeyExpr !== undefined ? ctx.expr(d.queryKeyExpr, 0) : ctx.stringLiteral(d.queryKey)
    lines.push(`.task(id: ${keyExpr}) {`)
    lines.push(`  ${name}.setKey(${keyExpr})`)
  } else {
    lines.push(`.task {`)
  }
  lines.push(`  if ${name}.isStale {`)
  lines.push(`    ${name}.begin()`)
  if (d.valueExpr !== undefined) {
    // A DIRECT-VALUE queryFn (`() => <expr>`): resolve the computed value. No network, no decode,
    // no throwing call — so no `do`/`catch`.
    lines.push(`    ${name}.resolve(${ctx.expr(d.valueExpr, 0)})`)
  } else {
    const swiftUrl = d.urlExpr !== undefined ? ctx.expr(d.urlExpr, 0) : ctx.stringLiteral(d.url as string)
    lines.push(`    do {`)
    if (d.method || d.headers || d.body) {
      // A request with a VERB, headers, or a body routes through PyreonHttp — exactly like useFetch's
      // method/headers path.
      const method = (d.method ?? 'GET').toLowerCase()
      const parts = [`method: .${method}`, `url: ${swiftUrl}`]
      if (d.headers) {
        const pairs = Object.entries(d.headers)
          .map(([k, v]) => `${ctx.stringLiteral(k)}: ${ctx.stringLiteral(v)}`)
          .join(', ')
        parts.push(`headers: [${pairs}]`)
      }
      if (d.body !== undefined) parts.push(`body: Data(${ctx.stringLiteral(d.body)}.utf8)`)
      lines.push(`      let __response = try await PyreonHttp.send(`)
      lines.push(`        PyreonHttpRequest(${parts.join(', ')})`)
      lines.push(`      )`)
      lines.push(`      guard __response.isOK else {`)
      lines.push(`        throw PyreonHttpError.badStatus(__response.status)`)
      lines.push(`      }`)
      lines.push(`      ${name}.resolve(try __response.decode(${ctx.typeText(d.type)}.self))`)
    } else {
      lines.push(`      let (bytes, _) = try await URLSession.shared.data(from: URL(string: ${swiftUrl})!)`)
      lines.push(`      ${name}.resolve(try JSONDecoder().decode(${ctx.typeText(d.type)}.self, from: bytes))`)
    }
    lines.push(`    } catch { ${name}.reject(error) }`)
  }
  lines.push(`  }`)
  lines.push(`}`)
  return lines
}

/** The `.task(id:)` modifier that runs one `useStream` decl: KEYED on the request URL plus the restart tick, so a runtime `:param` or `restart()` re-keys it. */
export function streamLifecycleSwift(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const d = stream(decl)
  const name = ctx.ident(decl.name)
  const url = d.urlExpr !== undefined ? ctx.expr(d.urlExpr, 0) : ctx.stringLiteral(d.url)
  const req = [`method: ${ctx.stringLiteral(d.method)}`, `url: ${url}`]
  if (d.headers) {
    req.push(
      `headers: [${Object.entries(d.headers)
        .map(([k, v]) => `${ctx.stringLiteral(k)}: ${ctx.stringLiteral(v)}`)
        .join(', ')}]`,
    )
  }
  // A runtime body is serialized per run; it is ALSO in the key, so a change re-opens the stream —
  // the web's tracked-source semantic.
  const bodyJson = d.requestBodyExpr !== undefined ? ctx.expr(d.requestBodyExpr, 0) : undefined
  if (d.requestBody !== undefined) req.push(`body: Data(${ctx.stringLiteral(d.requestBody)}.utf8)`)
  else if (bodyJson !== undefined) req.push(`body: Data(${bodyJson}.utf8)`)
  const request = `PyreonStreamRequest(${req.join(', ')})`
  const data = ctx.typeText(d.dataType)
  const enabled = d.enabled !== undefined ? ctx.expr(d.enabled, 0) : undefined
  // Only the parts that exist join the key, so a plain stream's emit is unchanged.
  const key = [`\\(${url})`, `\\(${name}.restartTick)`]
  if (enabled !== undefined) key.push(`\\(${enabled})`)
  if (bodyJson !== undefined) key.push(`\\(${bodyJson})`)
  let onEvent = ''
  if (d.onEvent !== undefined) {
    // The event parameter is typed for inference exactly as the stream's item, so `ev.data.field`
    // reads resolve like `s.latest()?.data.field`.
    const body = ctx.statements(d.onEvent.body, 10, new Map([[d.onEvent.param, d.itemType]])).join('; ')
    onEvent = `, onEvent: { ${d.onEvent.param === '_' ? '_' : ctx.ident(d.onEvent.param)} in ${body} }`
  }
  const out = [`.task(id: "${key.join('#')}") {`]
  const pad = enabled !== undefined ? '    ' : '  '
  if (enabled !== undefined) out.push(`  if ${enabled} {`)
  if (d.format === 'sse') {
    const opts: string[] = []
    if (d.events) opts.push(`events: [${d.events.map((e) => ctx.stringLiteral(e)).join(', ')}]`)
    if (d.lastEventId !== undefined) opts.push(`lastEventId: ${ctx.stringLiteral(d.lastEventId)}`)
    opts.push(
      d.reconnect === null
        ? 'reconnect: nil'
        : `reconnect: PyreonStreamReconnect(attempts: ${d.reconnect.attempts}, delay: ${d.reconnect.delay}, maxDelay: ${d.reconnect.maxDelay}, onEnd: ${d.reconnect.onEnd})`,
    )
    const decode = d.sseText ? 'PyreonStreamDecode.sseText()' : `PyreonStreamDecode.sseJSON(${data}.self)`
    const accept = d.accept !== undefined ? `, accept: ${ctx.stringLiteral(d.accept)}` : ''
    out.push(`${pad}await ${name}.runSse(${request}, options: PyreonSseOptions(${opts.join(', ')})${accept}${onEvent}, decode: ${decode})`)
  } else {
    const accept = d.accept !== undefined ? `, accept: ${ctx.stringLiteral(d.accept)}` : ''
    out.push(`${pad}await ${name}.runNdjson(${request}${accept}${onEvent}, decode: PyreonStreamDecode.ndjson(${data}.self))`)
  }
  if (enabled !== undefined) {
    // The web's disabled branch: stop, read `idle`, keep what was received.
    out.push(`  } else {`)
    out.push(`    ${name}.idle()`)
    out.push(`  }`)
  }
  out.push(`}`)
  return out
}
