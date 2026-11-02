// An endpoint CALLED from an event handler — `await signIn({ json: { email: email() } })` — as the native compiler
// lowers it.
//
// The declaration forms (`useFetch(ep(…))`, `useQuery(() => ep.query(…))`) read a request at mount or per query run.
// This is the other half of the web contract: a request issued when something HAPPENS, carrying what the user entered.
// On the web the call is a Promise that rejects on a non-2xx or a network failure; awaiting it inside an `async`
// handler ends the handler there and surfaces as an unhandled rejection. Natively:
//
//   Swift   → `try await PyreonHttp.call(PyreonHttpRequest(…))` inside the handler's `Task`, whose body the core
//             wraps in `do { … } catch { <report> }` (`ExprEmitter.throws`)
//   Kotlin  → `withContext(Dispatchers.IO) { PyreonHttp.call(PyreonHttpRequest(…), fallback = PyreonHttpOkHttp) }`
//             inside the handler's coroutine, wrapped in `try { … } catch` so a failure cannot crash the app
//
// Which positions lower is decided by the shape of the SOURCE, recorded once per file by `scanCallRoles` (an ESTree
// node carries no parent pointer, so a call cannot tell from its own node whether it is awaited):
//
//   - `await ep(…)` as a statement (or the expression body of an arrow) → lowers; the response is checked, not decoded.
//   - `ep(…)` as a statement, NOT awaited → fire-and-forget, exactly what the web does with an un-awaited Promise:
//     launched on its own Task / coroutine, a failure reported.
//   - `const user = await ep(…)` — the VALUE is the decoded JSON, and nothing on this path names the type to decode it
//     into, so it is refused by name and pointed at `useMutation<T>(ep.mutation())`, whose `T` does.
//
// A call in any other position (an argument to a hook recognizer, `useFetch(ep(…))`) is not this file's: it declines.

import {
  kotlinHttpRequestArgs,
  kotlinStr,
  swiftHttpRequestArgs,
  swiftStr,
  unwrapTypeLayers,
  type CallExprRecognizer,
  type ExprEmitter,
  type ExprIR,
  type ExtExprIR,
  type HttpRequestParts,
} from '@pyreon/native-compiler/plugin-api'
import { httpFacts } from './endpoint'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** The `ext-expr` type an endpoint call lowers to. */
export const HTTP_CALL_TYPE = 'http-call'

/** Where an endpoint call sits, which decides whether and how it lowers. */
type CallRole = 'awaited' | 'fired' | 'value'

interface CallRoles {
  readonly roles: WeakMap<object, CallRole>
}

const ROLES_KEY = '@pyreon/http:call-roles'

/** The roles `scanCallRoles` recorded for this file. */
function callRoles(source: { fileState<T>(key: string, init: () => T): T }): CallRoles {
  return source.fileState<CallRoles>(ROLES_KEY, () => ({ roles: new WeakMap() }))
}

/** The endpoint binding `node` calls, when it is a call of one this file declared. */
function endpointCallee(node: AnyNode, endpoints: ReadonlyMap<string, unknown>): string | undefined {
  if (node?.type !== 'CallExpression') return undefined
  const callee = node.callee as AnyNode
  if (callee?.type !== 'Identifier') return undefined
  return endpoints.has(callee.name as string) ? (callee.name as string) : undefined
}

/**
 * Record the role of every endpoint call in the file: one walk over the whole program, carrying each node's parent.
 * Cheap to skip — a file that declares no endpoint never walks.
 */
export function scanCallRoles(
  body: readonly AnyNode[],
  endpoints: ReadonlyMap<string, unknown>,
  source: { fileState<T>(key: string, init: () => T): T },
): void {
  if (endpoints.size === 0) return
  const { roles } = callRoles(source)
  const visit = (node: AnyNode, parent: AnyNode | undefined, parentKey: string | undefined): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, parentKey)
      return
    }
    if (typeof node.type !== 'string') return
    // A position whose VALUE is discarded: an expression statement, or an arrow's expression body (a handler's
    // returned Promise is dropped by the event slot it is bound to).
    const discarded =
      parent?.type === 'ExpressionStatement' ||
      (parent?.type === 'ArrowFunctionExpression' && parentKey === 'body')
    if (node.type === 'AwaitExpression') {
      const call = unwrapTypeLayers(node.argument as AnyNode) as AnyNode
      if (endpointCallee(call, endpoints) !== undefined) roles.set(call, discarded ? 'awaited' : 'value')
    } else if (discarded) {
      const call = unwrapTypeLayers(node) as AnyNode
      if (endpointCallee(call, endpoints) !== undefined && !roles.has(call)) roles.set(call, 'fired')
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
      const value = node[key]
      if (value !== null && typeof value === 'object') visit(value, node, key)
    }
  }
  for (const node of body) visit(node, undefined, undefined)
}

/** What the emitter reads back off an `http-call` node. The runtime halves live in `args`, so renames reach them. */
interface CallPayload {
  readonly role: 'awaited' | 'fired'
  readonly method: string
  /** The literal URL; absent when `args[0]` is a runtime template. */
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  /** Names of the runtime headers, in `args` order after the url / body slots. */
  readonly headerExprNames: readonly string[]
  readonly hasUrlExpr: boolean
  readonly hasBodyExpr: boolean
  /** A streamed body (multipart / file) occupies the slot after the body. */
  readonly hasUpload?: boolean
}

/** Recognize an endpoint call in an expression position the scan classified. */
export const recognizeEndpointCall: CallExprRecognizer = (site, ctx) => {
  const facts = httpFacts(ctx)
  if (facts.endpoints.size === 0) return undefined
  const name = endpointCallee(site.node as AnyNode, facts.endpoints)
  if (name === undefined || site.construct === true) return undefined
  const role = callRoles(ctx).roles.get(site.node)
  if (role === undefined) return undefined
  if (role === 'value') {
    return ctx.unsupported(
      site.node,
      `using the value of \`await ${name}(…)\``,
      `the value is the decoded JSON response, and this call names no type to decode it into natively. Declare the request with a type — \`const m = useMutation<Reply>(${name}.mutation())\` — and read \`await m.mutateAsync(…)\` or \`m.data()\`; awaiting \`${name}(…)\` as a statement (its result unused) lowers as it is`,
    )
  }
  // The request is built when the call RUNS, so every runtime value — path params, query, body, headers — is
  // read at the moment the web reads it.
  const resolved = ctx.requests.resolve(name, site.args[0], {
    allowRuntimeParams: true,
    streaming: false,
    runtimeValues: true,
  })
  if (resolved === null) return null
  const args: ExprIR[] = []
  if (resolved.urlExpr !== undefined) args.push(resolved.urlExpr)
  if (resolved.bodyExpr !== undefined) args.push(resolved.bodyExpr)
  if (resolved.upload !== undefined) args.push(resolved.upload)
  const headerExprNames = Object.keys(resolved.headerExprs ?? {})
  for (const h of headerExprNames) args.push((resolved.headerExprs as Record<string, ExprIR>)[h] as ExprIR)
  const payload: CallPayload = {
    role,
    method: resolved.method,
    ...(resolved.urlExpr === undefined ? { url: resolved.url } : {}),
    ...(resolved.headers !== undefined ? { headers: resolved.headers } : {}),
    ...(resolved.body !== undefined ? { body: resolved.body } : {}),
    headerExprNames,
    hasUrlExpr: resolved.urlExpr !== undefined,
    hasBodyExpr: resolved.bodyExpr !== undefined,
    ...(resolved.upload !== undefined ? { hasUpload: true } : {}),
  }
  return { type: HTTP_CALL_TYPE, payload: payload as never, args }
}

/** The request parts of a call node, the URL rendered by `url`. */
function partsOf(e: ExtExprIR, url: (literal: string | undefined, expr: ExprIR | undefined) => string): HttpRequestParts {
  const p = e.payload as unknown as CallPayload
  let i = 0
  const urlExpr = p.hasUrlExpr ? e.args[i++] : undefined
  const bodyExpr = p.hasBodyExpr ? e.args[i++] : undefined
  const upload = p.hasUpload === true ? e.args[i++] : undefined
  const headerExprs: Record<string, ExprIR> = {}
  for (const h of p.headerExprNames) headerExprs[h] = e.args[i++] as ExprIR
  return {
    method: p.method,
    url: url(p.url, urlExpr),
    headers: p.headers,
    ...(p.headerExprNames.length > 0 ? { headerExprs } : {}),
    body: p.body,
    bodyExpr,
    upload,
  }
}

const WHERE = 'An awaited endpoint call:'

export const endpointCallExpr: ExprEmitter = {
  // The core writes `try await` around it and wraps the enclosing Task / coroutine (see the file header).
  throws: true,
  swift(e, ctx) {
    const parts = partsOf(e, (literal, expr) => (expr !== undefined ? ctx.expr(expr, 0) : swiftStr(literal ?? '')))
    const request = `PyreonHttpRequest(${swiftHttpRequestArgs(parts, ctx, WHERE)})`
    if ((e.payload as unknown as CallPayload).role === 'awaited') return `PyreonHttp.call(${request})`
    // Not awaited on the web: the request is sent and the handler moves on; a rejection is unhandled. The request
    // is built HERE, as an argument — a `Task { … }` body runs after the handler returns and would read later state.
    return `PyreonHttp.fire(${request})`
  },
  kotlin(e, ctx) {
    const parts = partsOf(e, (literal, expr) => (expr !== undefined ? ctx.expr(expr, 0) : kotlinStr(literal ?? '')))
    // The request is BUILT on the calling thread — reading the component's state where the web reads it, at the
    // call — and only the blocking send moves to the IO dispatcher.
    const request = `PyreonHttpRequest(${kotlinHttpRequestArgs(parts, ctx, WHERE)})`
    const send = `withContext(Dispatchers.IO) { PyreonHttp.call(__request, fallback = PyreonHttpOkHttp) }`
    if ((e.payload as unknown as CallPayload).role === 'awaited') return `${request}.let { __request -> ${send} }`
    // Fire-and-forget: built before the launch, sent inside it, a failure reported rather than crashing the app.
    return `${request}.let { __request -> ${ctx.coroutineScope()}.launch { try { ${send} } catch (e: Throwable) { if (e is kotlin.coroutines.cancellation.CancellationException) throw e; System.err.println("[Pyreon] Unhandled error in an endpoint call: $e") } } }`
  },
}
