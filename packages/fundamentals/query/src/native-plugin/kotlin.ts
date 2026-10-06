// The Kotlin half of the `@pyreon/query` lowering: the `remember`ed containers and the
// `LaunchedEffect` / `DisposableEffect` harnesses that drive them.

import type { EmitContext, ExtDecl } from '@pyreon/native-compiler/plugin-api'
import type { QueryPayload, StreamPayload } from './types'

const query = (d: ExtDecl): QueryPayload => d.payload as unknown as QueryPayload
const stream = (d: ExtDecl): StreamPayload => d.payload as unknown as StreamPayload

/** `const q = useQuery<T>(…)` → a remembered `PyreonQuery<T>` seeded with the cache key + staleMillis. The isStale-guarded `LaunchedEffect` harness is emitted with the component's effects. */
export function queryDeclKotlin(d: ExtDecl, ctx: EmitContext): string {
  const p = query(d)
  // A runtime-key / templated-URL / direct-value query constructs KEYLESS to mirror the Swift @State
  // constraint; the real key is applied in the LaunchedEffect harness via setKey (symmetric emit
  // across both targets).
  const key =
    p.queryKeyExpr !== undefined || p.urlExpr !== undefined || p.valueExpr !== undefined
      ? '""'
      : ctx.stringLiteral(p.queryKey)
  return `val ${ctx.ident(d.name)} = remember { PyreonQuery<${ctx.typeText(p.type)}>(queryKey = ${key}, staleMillis = ${p.staleMillis}L) }`
}

/**
 * `const s = useStream(…)` → a remembered `PyreonStream`; the `DisposableEffect` that starts and
 * stops it is emitted with the harnesses. `main = PyreonStreamMain` puts every state write and
 * `onEvent` call on the main looper, where the web runs the whole hook — the loop itself reads on
 * its own thread, and without this `onEvent` ran there.
 */
export function streamDeclKotlin(d: ExtDecl, ctx: EmitContext): string {
  const p = stream(d)
  return `val ${ctx.ident(d.name)} = remember { PyreonStream<${ctx.typeText(p.itemType)}>(maxEvents = ${p.maxEvents}L, main = PyreonStreamMain) }`
}

/**
 * useQuery: a `LaunchedEffect(Unit)` per decl, guarded on `isStale` so a FRESH cache hit skips the
 * network entirely (serving the hydrated value). The stale/miss path drives the same begin →
 * resolve|reject machine as useFetch — a background refresh of already-cached data flips only
 * isFetching, never isPending, so the UI never blanks.
 */
export function queryLifecycleKotlin(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const d = query(decl)
  const lines: string[] = []
  const name = ctx.ident(decl.name)
  // Runtime queries key the `LaunchedEffect` on the computed key string, so a key change (new
  // prop/signal) re-keys the cache (`setKey`) + re-runs the fetch — matching the web's reactive
  // queryKey. Static queries use `Unit`.
  const runtimeQuery = d.queryKeyExpr !== undefined || d.urlExpr !== undefined || d.valueExpr !== undefined
  if (runtimeQuery) {
    const keyExpr = d.queryKeyExpr !== undefined ? ctx.expr(d.queryKeyExpr, 0) : ctx.stringLiteral(d.queryKey)
    lines.push(`LaunchedEffect(${keyExpr}) {`)
    lines.push(`  ${name}.setKey(${keyExpr})`)
  } else {
    lines.push(`LaunchedEffect(Unit) {`)
  }
  lines.push(`  if (${name}.isStale) {`)
  lines.push(`    ${name}.begin()`)
  if (d.valueExpr !== undefined) {
    // A DIRECT-VALUE queryFn (`() => <expr>`): resolve the computed value. No network, no decode, no
    // throwing call — so no try/catch.
    lines.push(`    ${name}.resolve(${ctx.expr(d.valueExpr, 0)})`)
  } else {
    const kotlinUrl = d.urlExpr !== undefined ? ctx.expr(d.urlExpr, 0) : ctx.stringLiteral(d.url as string)
    lines.push(`    try {`)
    if (d.method || d.headers || d.body) {
      // Mirrors the Swift PyreonHttp branch: a request with a VERB, headers, or a body goes through
      // PyreonHttp (readText() can express none of them).
      const parts = [`method = PyreonHttpMethod.${(d.method ?? 'GET').toUpperCase()}`, `url = ${kotlinUrl}`]
      if (d.headers) {
        const pairs = Object.entries(d.headers)
          .map(([k, v]) => `${ctx.stringLiteral(k)} to ${ctx.stringLiteral(v)}`)
          .join(', ')
        parts.push(`headers = mapOf(${pairs})`)
      }
      if (d.body !== undefined) parts.push(`body = ${ctx.stringLiteral(d.body)}`)
      lines.push(`      val __response = withContext(Dispatchers.IO) {`)
      lines.push(`        PyreonHttp.send(PyreonHttpRequest(${parts.join(', ')}))`)
      lines.push(`      }`)
      lines.push(`      if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)`)
      lines.push(`      ${name}.resolve(PyreonFetchJson.decodeFromString<${ctx.typeText(d.type)}>(__response.body))`)
    } else {
      lines.push(`      val body = withContext(Dispatchers.IO) { java.net.URL(${kotlinUrl}).readText() }`)
      lines.push(`      ${name}.resolve(PyreonFetchJson.decodeFromString<${ctx.typeText(d.type)}>(body))`)
    }
    lines.push(`    } catch (e: Throwable) { ${name}.reject(e) }`)
  }
  lines.push(`  }`)
  lines.push(`}`)
  return lines
}

/** The `DisposableEffect` that runs one `useStream` decl, KEYED on the request URL plus the restart tick; `onDispose` closes the connection. */
export function streamLifecycleKotlin(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const d = stream(decl)
  const name = ctx.ident(decl.name)
  const url = d.urlExpr !== undefined ? ctx.expr(d.urlExpr, 0) : ctx.stringLiteral(d.url)
  const req = [`method = ${ctx.stringLiteral(d.method)}`, `url = ${url}`]
  if (d.headers) {
    req.push(
      `headers = mapOf(${Object.entries(d.headers)
        .map(([k, v]) => `${ctx.stringLiteral(k)} to ${ctx.stringLiteral(v)}`)
        .join(', ')})`,
    )
  }
  // A runtime body is serialized per run; it is ALSO in the key, so a change re-opens the stream —
  // the web's tracked-source semantic.
  const bodyJson = d.requestBodyExpr !== undefined ? ctx.expr(d.requestBodyExpr, 0) : undefined
  if (d.requestBody !== undefined) req.push(`body = ${ctx.stringLiteral(d.requestBody)}`)
  else if (bodyJson !== undefined) req.push(`body = ${bodyJson}`)
  const request = `PyreonStreamRequest(${req.join(', ')})`
  const data = ctx.typeText(d.dataType)
  const enabled = d.enabled !== undefined ? ctx.expr(d.enabled, 0) : undefined
  // Only the parts that exist join the key, so a plain stream's emit is unchanged.
  const key = [`\${${url}}`, `\${${name}.restartTick.value}`]
  if (enabled !== undefined) key.push(`\${${enabled}}`)
  if (bodyJson !== undefined) key.push(`\${${bodyJson}}`)
  const onEvent =
    d.onEvent !== undefined
      ? `, onEvent = { ${d.onEvent.param === '_' ? '_' : ctx.ident(d.onEvent.param)} -> ${ctx.statements(d.onEvent.body, 6).join('; ')} }`
      : ''
  const out = [`DisposableEffect("${key.join('#')}") {`]
  const pad = enabled !== undefined ? '    ' : '  '
  if (enabled !== undefined) out.push(`  if (${enabled}) {`)
  if (d.format === 'sse') {
    const opts: string[] = []
    if (d.events) opts.push(`events = listOf(${d.events.map((e) => ctx.stringLiteral(e)).join(', ')})`)
    if (d.lastEventId !== undefined) opts.push(`lastEventId = ${ctx.stringLiteral(d.lastEventId)}`)
    opts.push(
      d.reconnect === null
        ? 'reconnect = null'
        : `reconnect = PyreonStreamReconnect(attempts = ${d.reconnect.attempts}L, delay = ${d.reconnect.delay}L, maxDelay = ${d.reconnect.maxDelay}L, onEnd = ${d.reconnect.onEnd})`,
    )
    const payload = d.sseText ? 'm.data' : `PyreonFetchJson.decodeFromString<${data}>(m.data)`
    out.push(
      `${pad}${name}.startSse(${request}, PyreonSseOptions(${opts.join(', ')})${d.accept !== undefined ? `, accept = ${ctx.stringLiteral(d.accept)}` : ''}${onEvent}) { m -> PyreonSseEvent(m.type, ${payload}, m.id) }`,
    )
  } else {
    const accept = d.accept !== undefined ? `, accept = ${ctx.stringLiteral(d.accept)}` : ''
    out.push(`${pad}${name}.startNdjson(${request}${accept}${onEvent}) { line -> PyreonFetchJson.decodeFromString<${data}>(line) }`)
  }
  if (enabled !== undefined) {
    // The web's disabled branch: stop, read `idle`, keep what was received.
    out.push(`  } else {`)
    out.push(`    ${name}.idle()`)
    out.push(`  }`)
  }
  out.push(`  onDispose { ${name}.stop() }`)
  out.push(`}`)
  return out
}
