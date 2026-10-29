// How `useMutation` crosses to native: a `PyreonMutation<T>` container the component holds, and each
// `m.mutate(vars)` / `await m.mutateAsync(vars)` lowered at its CALL SITE to a request built right there.
//
//   const save = useMutation<Reply>(saveProfile.mutation())
//   save.mutate({ json: { name: name() } })
//
//   Swift   → `@State private var save = PyreonMutation<Reply>()`
//             `save.mutate(PyreonHttpRequest(…), { __request in … PyreonHttp.call(__request) … decode … })`
//   Kotlin  → `val save = remember { PyreonMutation<Reply>() }`
//             `PyreonHttpRequest(…).let { __request -> save.begin().let { __mine -> scope.launch { save.run(__mine, __request, …) } } }`
//
// WHY the request is built at the call site: the variables are runtime values (what the user typed), and the web
// reads them when `mutate` is CALLED — `save.mutate({ json: { name: name() } }); name.set('')` sends the name, not
// ''. The request is therefore an ARGUMENT, evaluated before the handler moves on, and the container receives it
// already built. The container (`@pyreon/query/native`) is transport-agnostic: it owns the state machine and
// TanStack's callback order, nothing else.
//
// Two mutationFn shapes resolve to an endpoint, because those are the ones a request can be read from statically:
//
//   - `useMutation(ep.mutation())` (also spread into an options object): `mutate(args)` takes the endpoint's CALL
//     ARGUMENTS — `{ params, query, json, headers }` — so the call site's object literal is resolved directly.
//   - `useMutation({ mutationFn: (vars) => ep({ json: vars }) })`: the parameter is substituted by the call site's
//     argument expression, and the result resolved the same way.
//
// Every other option is either honoured (`onSuccess` / `onError` / `onSettled`, at both layers) or NAMED.

import {
  isNullishLiteral,
  propName,
  unwrapTypeLayers,
  type CallSite,
  type EmitContext,
  type ExprEmitter,
  type ExprIR,
  type ExtDecl,
  type ExtDeclSpec,
  type ExtExprIR,
  type HttpRequestParts,
  type KotlinEmitContext,
  type MethodCallRecognizer,
  type ModuleScan,
  type ParseContext,
  type StatementIR,
  type TypeIR,
  kotlinHttpRequestArgs,
  swiftHttpRequestArgs,
} from '@pyreon/native-compiler/plugin-api'
import { MUTATION_TYPE } from './names'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** The ext-expr types a call site lowers to: a fire-and-forget `mutate`, and an awaited `mutateAsync`. */
export const MUTATE_TYPE = 'mutation-mutate'
export const MUTATE_ASYNC_TYPE = 'mutation-mutate-async'

/** One callback as the emit needs it: the parameter names the author wrote, and the body. */
interface Callback {
  readonly params: readonly string[]
  readonly body: readonly StatementIR[]
}

/** The three callbacks one layer (the options, or one call) may carry. */
interface Callbacks {
  readonly onSuccess?: Callback
  readonly onError?: Callback
  readonly onSettled?: Callback
}

/** How a call site reaches its endpoint. */
type MutationSource =
  /** `ep.mutation()` — the call site's argument IS the endpoint's call arguments. */
  | { readonly kind: 'endpoint'; readonly endpoint: string }
  /** `(vars) => ep(<argNode>)` — `param` in `argNode` stands for the call site's argument. */
  | { readonly kind: 'fn'; readonly endpoint: string; readonly param: string; readonly argNode: AnyNode }

/** What the declaration recorded for its call sites (file-scoped memory, so a call site in a handler can read it). */
interface MutationBinding {
  readonly type: TypeIR
  readonly source: MutationSource
  readonly options: Callbacks
}

interface MutationFacts {
  readonly bindings: Map<string, MutationBinding>
  /** `m.mutateAsync(…)` calls that are awaited — the scan records them, since a node carries no parent. */
  readonly awaited: WeakSet<object>
}

const FACTS_KEY = '@pyreon/query:mutations'

function mutationFacts(source: { fileState<T>(key: string, init: () => T): T }): MutationFacts {
  return source.fileState<MutationFacts>(FACTS_KEY, () => ({ bindings: new Map(), awaited: new WeakSet() }))
}

/** `scanModule` half: record every `await <x>.mutateAsync(…)` call node. */
export function scanMutations(scan: ModuleScan): void {
  const facts = mutationFacts(scan)
  const visit = (node: AnyNode): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'AwaitExpression') {
      const call = unwrapTypeLayers(node.argument as AnyNode) as AnyNode
      if (
        call?.type === 'CallExpression' &&
        call.callee?.type === 'MemberExpression' &&
        call.callee.property?.type === 'Identifier' &&
        call.callee.property.name === 'mutateAsync'
      ) {
        facts.awaited.add(call)
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
      const value = node[key]
      if (value !== null && typeof value === 'object') visit(value)
    }
  }
  visit((scan.program as AnyNode).body)
}

/** Options with no native counterpart, and why — named rather than dropped. */
const UNLOWERED_OPTIONS: ReadonlyMap<string, string> = new Map([
  [
    'invalidates',
    'native queries are self-contained containers with no shared client to invalidate — a mounted query does not re-fetch. Call its `refetch()` from `onSuccess` instead',
  ],
  ['onMutate', 'an optimistic-update context has no native carrier'],
  ['retry', 'native mutations run once (the web default is no retry, too)'],
  ['retryDelay', 'native mutations run once'],
  ['mutationKey', 'there is no native mutation cache to key'],
  ['scope', 'there is no native mutation cache to serialize through'],
  ['meta', 'per-mutation metadata is read by a QueryClient, which does not lower'],
  ['networkMode', 'native mutations run whenever they are called'],
  ['gcTime', 'there is no native mutation cache to collect'],
  ['throwOnError', 'a native mutation never throws into rendering'],
])

/** The endpoint `node` calls (`ep(…)`), when it is one the request source knows. */
function endpointCall(node: AnyNode, ctx: ParseContext): { name: string; arg: AnyNode | undefined } | undefined {
  const call = unwrapTypeLayers(node) as AnyNode
  if (call?.type !== 'CallExpression' || call.callee?.type !== 'Identifier') return undefined
  const name = call.callee.name as string
  return ctx.requests.has(name) ? { name, arg: (call.arguments as AnyNode[] | undefined)?.[0] } : undefined
}

/** `ep.mutation(opts?)` — the endpoint, and the options it carries. */
function endpointMutation(node: AnyNode, ctx: ParseContext): { name: string; opts: AnyNode | undefined } | undefined {
  const call = unwrapTypeLayers(node) as AnyNode
  if (call?.type !== 'CallExpression') return undefined
  const callee = call.callee as AnyNode
  if (callee?.type !== 'MemberExpression' || callee.computed || callee.property?.name !== 'mutation') return undefined
  if (callee.object?.type !== 'Identifier' || !ctx.requests.has(callee.object.name as string)) return undefined
  return { name: callee.object.name as string, opts: (call.arguments as AnyNode[] | undefined)?.[0] }
}

/** The single expression a function body returns (`(v) => ep(v)`, `async (v) => await ep(v)`, `{ return ep(v) }`). */
function returnedExpr(fn: AnyNode): AnyNode | undefined {
  let body = fn.body as AnyNode
  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[]) ?? []
    if (stmts.length !== 1 || stmts[0]?.type !== 'ReturnStatement') return undefined
    body = stmts[0].argument
  }
  body = unwrapTypeLayers(body) as AnyNode
  if (body?.type === 'AwaitExpression') body = unwrapTypeLayers(body.argument as AnyNode) as AnyNode
  return body
}

/**
 * A parsed callback's parameters and statements. A callback's return value is discarded on the web, so an expression
 * body (`(d) => status.set(d.id)`, which the function builder reads as `return …`) becomes a plain statement.
 */
function callbackOf(decl: {
  params: readonly { name: string }[]
  body: readonly StatementIR[]
}): { params: readonly string[]; body: readonly StatementIR[] } {
  const only = decl.body.length === 1 ? decl.body[0] : undefined
  const body: readonly StatementIR[] =
    only?.kind === 'return' && only.expr !== undefined ? [{ kind: 'expr', expr: only.expr }] : decl.body
  return { params: decl.params.map((p) => p.name), body }
}

/** A callback option, parsed: a plain function of at most `max` plain parameters. */
function readCallback(
  node: AnyNode,
  label: string,
  max: number,
  report: (message: string) => void,
  parse: (fn: AnyNode) => { params: readonly string[]; body: readonly StatementIR[] },
): Callback | undefined {
  const fn = unwrapTypeLayers(node) as AnyNode
  if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') {
    report(`\`${label}\` must be an inline function to lower to native — it is IGNORED on iOS and Android.`)
    return undefined
  }
  if (fn.async === true) {
    report(`\`${label}\` is \`async\`; a native mutation callback runs synchronously — it is IGNORED on iOS and Android.`)
    return undefined
  }
  const params = (fn.params as AnyNode[] | undefined) ?? []
  if (params.length > max || params.some((p) => p.type !== 'Identifier')) {
    report(
      `\`${label}\` may take at most ${max === 1 ? 'one plain parameter (the data or the error)' : 'two plain parameters (the data and the error)'} natively — the variables and the context have no native carrier. It is IGNORED on iOS and Android.`,
    )
    return undefined
  }
  return parse(fn)
}

/** The callbacks an options object carries (`onSuccess` / `onError` / `onSettled`); everything else is the caller's. */
function readCallbacks(
  obj: AnyNode | undefined,
  where: string,
  report: (message: string) => void,
  parse: (fn: AnyNode) => { params: readonly string[]; body: readonly StatementIR[] },
): Callbacks {
  const out: { onSuccess?: Callback; onError?: Callback; onSettled?: Callback } = {}
  if (obj?.type !== 'ObjectExpression') return out
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
    if (key === 'onSuccess' || key === 'onError') {
      const cb = readCallback(prop.value, `${where} ${key}`, 1, report, parse)
      if (cb !== undefined) out[key] = cb
    } else if (key === 'onSettled') {
      const cb = readCallback(prop.value, `${where} onSettled`, 2, report, parse)
      if (cb !== undefined) out.onSettled = cb
    }
  }
  return out
}

/** `const m = useMutation<T>(…)` — read the mutationFn's endpoint and the options-level callbacks. */
export function recognizeMutation(_call: CallSite, ctx: ParseContext): ExtDeclSpec | null {
  const name = ctx.declName
  const where = `Declaration ${name}: useMutation`
  const report = (message: string): void => ctx.report(`${where}: ${message}`)
  const parse = (fn: AnyNode) => callbackOf(ctx.functionDeclaration(`__${name}_cb`, fn))
  const arg = unwrapTypeLayers(ctx.args[0] as AnyNode) as AnyNode
  let source: MutationSource | undefined
  let options: Callbacks = {}
  const endpointOptions = (opts: AnyNode | undefined): void => {
    for (const prop of (opts?.type === 'ObjectExpression' ? (opts.properties as AnyNode[]) : []) ?? []) {
      const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
      if (key !== undefined) report(`\`.mutation({ ${key} })\` is IGNORED on iOS and Android (${UNLOWERED_OPTIONS.get(key) ?? 'it has no native counterpart'}).`)
    }
  }
  const direct = endpointMutation(arg, ctx)
  if (direct !== undefined) {
    source = { kind: 'endpoint', endpoint: direct.name }
    endpointOptions(direct.opts)
  } else if (arg?.type === 'ObjectExpression') {
    for (const prop of (arg.properties as AnyNode[] | undefined) ?? []) {
      if (prop.type === 'SpreadElement') {
        const spread = endpointMutation(prop.argument, ctx)
        if (spread === undefined) {
          report('a spread in the options cannot be read at compile time — only `...endpoint.mutation()` lowers.')
          return null
        }
        source = { kind: 'endpoint', endpoint: spread.name }
        endpointOptions(spread.opts)
        continue
      }
      const key = propName(prop)
      if (key === undefined || key === 'onSuccess' || key === 'onError' || key === 'onSettled') continue
      if (key === 'mutationFn') {
        const fn = unwrapTypeLayers(prop.value as AnyNode) as AnyNode
        if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') {
          report('`mutationFn` must be an inline function calling a same-file `@pyreon/http` endpoint — `(vars) => ep({ json: vars })` — to lower to native.')
          return null
        }
        const params = (fn.params as AnyNode[] | undefined) ?? []
        if (params.length > 1 || (params[0] !== undefined && params[0].type !== 'Identifier')) {
          report('`mutationFn` takes one plain parameter (the variables) natively — `(vars) => …`.')
          return null
        }
        const call = endpointCall(returnedExpr(fn), ctx)
        if (call === undefined) {
          report(
            '`mutationFn` must return a call of a same-file `@pyreon/http` endpoint — `(vars) => ep({ json: vars })`, declared with `const ep = api.endpoint(\'POST /path\')` — because that is where the native request is read from. A `fetch(…)` body, a multi-statement function or an imported endpoint does not lower; declare the endpoint in this file.',
          )
          return null
        }
        const param = params[0]?.name as string | undefined
        const callArg = unwrapTypeLayers(call.arg) as AnyNode
        // `(vars) => ep(vars)` passes the variables through as the endpoint's call arguments: the endpoint form.
        if (param !== undefined && callArg?.type === 'Identifier' && callArg.name === param) {
          source = { kind: 'endpoint', endpoint: call.name }
        } else {
          // A parameter-less mutationFn ignores its variables; the NUL name can never occur in source.
          source = { kind: 'fn', endpoint: call.name, param: param ?? '\0none', argNode: call.arg }
        }
        continue
      }
      report(`option \`${key}\` is IGNORED on iOS and Android (${UNLOWERED_OPTIONS.get(key) ?? 'it has no native counterpart'}).`)
    }
    options = readCallbacks(arg, 'useMutation', report, parse)
  }
  if (source === undefined) {
    report(
      'native lowering needs the mutation to name a same-file `@pyreon/http` endpoint — `useMutation(ep.mutation())`, or `useMutation({ mutationFn: (vars) => ep({ json: vars }) })` — because the request is read from it. This declaration stays web.',
    )
    return null
  }
  const type = ctx.typeArg()
  mutationFacts(ctx).bindings.set(name, { type, source, options })
  return { type: MUTATION_TYPE, payload: { type } as never }
}

/**
 * `node` with every free reference to `param` replaced by `replacement` — the call site's argument standing in for
 * the mutationFn's parameter. A nested function that rebinds the name keeps its own; an object KEY and a
 * non-computed member PROPERTY are names, not references.
 */
function substitute(node: AnyNode, param: string, replacement: AnyNode): AnyNode {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((n) => substitute(n, param, replacement))
  if (node.type === 'Identifier' && node.name === param) return replacement
  if (
    (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
    ((node.params as AnyNode[]) ?? []).some((p) => p.type === 'Identifier' && p.name === param)
  ) {
    return node
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(node)) {
    const value = node[key]
    if (node.type === 'MemberExpression' && key === 'property' && node.computed !== true) out[key] = value
    else if ((node.type === 'Property' || node.type === 'ObjectProperty') && key === 'key' && node.computed !== true) {
      // `{ vars }` shorthand: the KEY stays the name, the VALUE is substituted.
      out[key] = value
    } else out[key] = substitute(value, param, replacement)
  }
  if ((node.type === 'Property' || node.type === 'ObjectProperty') && node.shorthand === true) out.shorthand = false
  return out
}

/** What a call site's ext-expr carries; the runtime halves of the request live in `args`. */
interface MutateCallPayload {
  readonly binding: string
  readonly type: TypeIR
  readonly method: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly headerExprNames: readonly string[]
  readonly hasUrlExpr: boolean
  readonly hasBodyExpr: boolean
  /** A streamed body (multipart / file) occupies the slot after the body. */
  readonly hasUpload?: boolean
  readonly options: Callbacks
  readonly call: Callbacks
}

/** `m.mutate(vars, callbacks?)` / `m.mutateAsync(vars, callbacks?)` on a recorded binding. */
export const recognizeMutateCall: MethodCallRecognizer = (site, ctx) => {
  if (site.method !== 'mutate' && site.method !== 'mutateAsync') return undefined
  const receiver = site.receiver as AnyNode
  if (receiver?.type !== 'Identifier') return undefined
  const facts = mutationFacts(ctx)
  const binding = facts.bindings.get(receiver.name as string)
  if (binding === undefined) return undefined
  const name = receiver.name as string
  const where = `${name}.${site.method}`
  const vars = site.args[0] as AnyNode | undefined
  let argNode: AnyNode | undefined
  if (binding.source.kind === 'endpoint') {
    if (vars !== undefined && !isNullishLiteral(vars) && (unwrapTypeLayers(vars) as AnyNode)?.type !== 'ObjectExpression') {
      return ctx.unsupported(
        site.node,
        `\`${where}(…)\` with a non-literal argument`,
        `for \`useMutation(endpoint.mutation())\` the argument IS the endpoint's call arguments (\`{ params, query, json, headers }\`), which are read at compile time — pass them as an object literal: \`${where}({ json: draft })\``,
      )
    }
    argNode = vars
  } else {
    const replacement = vars ?? { type: 'Identifier', name: 'undefined' }
    argNode = binding.source.argNode === undefined ? undefined : substitute(binding.source.argNode, binding.source.param, replacement)
  }
  const resolved = ctx.requests.resolve(binding.source.endpoint, argNode, {
    allowRuntimeParams: true,
    streaming: false,
    runtimeValues: true,
  })
  if (resolved === null) return null
  const parse = (fn: AnyNode) => callbackOf(ctx.functionDeclaration(`__${name}_cb`, fn))
  const call = readCallbacks(site.args[1] as AnyNode | undefined, where, (m) => ctx.report(`${where}: ${m}`), parse)
  const args: ExprIR[] = []
  if (resolved.urlExpr !== undefined) args.push(resolved.urlExpr)
  if (resolved.bodyExpr !== undefined) args.push(resolved.bodyExpr)
  if (resolved.upload !== undefined) args.push(resolved.upload)
  const headerExprNames = Object.keys(resolved.headerExprs ?? {})
  for (const h of headerExprNames) args.push((resolved.headerExprs as Record<string, ExprIR>)[h] as ExprIR)
  const payload: MutateCallPayload = {
    binding: name,
    type: binding.type,
    method: resolved.method,
    ...(resolved.urlExpr === undefined ? { url: resolved.url } : {}),
    ...(resolved.headers !== undefined ? { headers: resolved.headers } : {}),
    ...(resolved.body !== undefined ? { body: resolved.body } : {}),
    headerExprNames,
    hasUrlExpr: resolved.urlExpr !== undefined,
    hasBodyExpr: resolved.bodyExpr !== undefined,
    ...(resolved.upload !== undefined ? { hasUpload: true } : {}),
    options: binding.options,
    call,
  }
  // Only an AWAITED `mutateAsync` is the throwing, value-returning form; an un-awaited one is a fire-and-forget
  // `mutate` (the state carries the outcome either way).
  const awaited = site.method === 'mutateAsync' && facts.awaited.has(site.node)
  return { type: awaited ? MUTATE_ASYNC_TYPE : MUTATE_TYPE, payload: payload as never, args }
}

const payloadOf = (e: ExtExprIR): MutateCallPayload => e.payload as unknown as MutateCallPayload

/** Whether the mutation decodes nothing (no `useMutation<T>`): the response is checked, not read. */
const isVoid = (t: TypeIR): boolean => t.kind === 'unknown' || t.kind === 'undefined'

function partsOf(e: ExtExprIR, url: (literal: string | undefined, expr: ExprIR | undefined) => string): HttpRequestParts {
  const p = payloadOf(e)
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

const ERROR_TYPE: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

/** The locals a callback's parameters bind, typed for inference inside its body. */
function callbackLocals(
  cb: Callback,
  kinds: readonly ('data' | 'error')[],
  data: TypeIR,
): Map<string, TypeIR> {
  const out = new Map<string, TypeIR>()
  cb.params.forEach((p, i) => {
    const kind = kinds[i]
    if (kind === 'data') out.set(p, { kind: 'union', branches: [data, { kind: 'undefined' }] })
    else if (kind === 'error') out.set(p, ERROR_TYPE)
  })
  // onSuccess's data is never absent.
  if (kinds.length === 1 && kinds[0] === 'data' && cb.params[0] !== undefined) out.set(cb.params[0], data)
  return out
}

function swiftCallbacks(c: Callbacks, data: TypeIR, ctx: EmitContext): string | undefined {
  const parts: string[] = []
  const closure = (cb: Callback, names: readonly string[], kinds: readonly ('data' | 'error')[]): string => {
    const params = names.map((n, i) => (cb.params[i] !== undefined ? ctx.ident(cb.params[i] as string) : '_'))
    const lines = ctx.statements(cb.body, ctx.indent + 2, callbackLocals(cb, kinds, data))
    if (lines.length === 0) return `{ ${params.join(', ')} in }`
    return `{ ${params.join(', ')} in\n${lines.join('\n')}\n${ctx.pad(ctx.indent)}}`
  }
  if (c.onSuccess) parts.push(`onSuccess: ${closure(c.onSuccess, ['data'], ['data'])}`)
  if (c.onError) parts.push(`onError: ${closure(c.onError, ['error'], ['error'])}`)
  if (c.onSettled) parts.push(`onSettled: ${closure(c.onSettled, ['data', 'error'], ['data', 'error'])}`)
  return parts.length === 0 ? undefined : `PyreonMutationCallbacks(${parts.join(', ')})`
}

function kotlinCallbacks(c: Callbacks, data: TypeIR, ctx: EmitContext): string | undefined {
  const parts: string[] = []
  const lambda = (cb: Callback, arity: number, kinds: readonly ('data' | 'error')[]): string => {
    const params = Array.from({ length: arity }, (_, i) => (cb.params[i] !== undefined ? ctx.ident(cb.params[i] as string) : '_'))
    const lines = ctx.statements(cb.body, ctx.indent + 2, callbackLocals(cb, kinds, data))
    if (lines.length === 0) return `{ ${params.join(', ')} -> }`
    return `{ ${params.join(', ')} ->\n${lines.join('\n')}\n${ctx.pad(ctx.indent)}}`
  }
  if (c.onSuccess) parts.push(`onSuccess = ${lambda(c.onSuccess, 1, ['data'])}`)
  if (c.onError) parts.push(`onError = ${lambda(c.onError, 1, ['error'])}`)
  if (c.onSettled) parts.push(`onSettled = ${lambda(c.onSettled, 2, ['data', 'error'])}`)
  return parts.length === 0 ? undefined : `PyreonMutationCallbacks(${parts.join(', ')})`
}

const WHERE = (e: ExtExprIR): string => `${payloadOf(e).binding}.mutate:`

/** The Swift operation closure: send (rejecting a non-2xx) and decode into `T`. */
function swiftOperation(type: TypeIR, ctx: EmitContext): string {
  if (isVoid(type)) return `{ __request in _ = try await PyreonHttp.call(__request) }`
  return `{ __request in try await PyreonHttp.call(__request).decode(${ctx.typeText(type)}.self) }`
}

/** The Kotlin operation lambda: the blocking send off the main thread, then the decode. */
function kotlinOperation(type: TypeIR, ctx: EmitContext): string {
  const send = `withContext(Dispatchers.IO) { PyreonHttp.call(__r, fallback = PyreonHttpOkHttp) }`
  if (isVoid(type)) return `{ __r -> ${send}; Unit }`
  return `{ __r -> PyreonFetchJson.decodeFromString<${ctx.typeText(type)}>(${send}.body) }`
}

function swiftEmit(e: ExtExprIR, ctx: EmitContext, method: 'mutate' | 'mutateAsync'): string {
  const p = payloadOf(e)
  const request = `PyreonHttpRequest(${swiftHttpRequestArgs(
    partsOf(e, (literal, expr) => (expr !== undefined ? ctx.expr(expr, 0) : ctx.stringLiteral(literal ?? ''))),
    ctx,
    WHERE(e),
  )})`
  const extra: string[] = []
  const options = swiftCallbacks(p.options, p.type, ctx)
  const call = swiftCallbacks(p.call, p.type, ctx)
  if (options !== undefined) extra.push(`options: ${options}`)
  if (call !== undefined) extra.push(`call: ${call}`)
  const tail = extra.length > 0 ? `, ${extra.join(', ')}` : ''
  return `${ctx.ident(p.binding)}.${method}(${request}, ${swiftOperation(p.type, ctx)}${tail})`
}

function kotlinEmit(e: ExtExprIR, ctx: KotlinEmitContext, awaited: boolean): string {
  const p = payloadOf(e)
  const request = `PyreonHttpRequest(${kotlinHttpRequestArgs(
    partsOf(e, (literal, expr) => (expr !== undefined ? ctx.expr(expr, 0) : ctx.stringLiteral(literal ?? ''))),
    ctx,
    WHERE(e),
  )})`
  const extra: string[] = []
  const options = kotlinCallbacks(p.options, p.type, ctx)
  const call = kotlinCallbacks(p.call, p.type, ctx)
  if (options !== undefined) extra.push(`options = ${options}`)
  if (call !== undefined) extra.push(`call = ${call}`)
  const tail = extra.length > 0 ? `, ${extra.join(', ')}` : ''
  const m = ctx.ident(p.binding)
  const op = kotlinOperation(p.type, ctx)
  // Awaited inside an async handler's coroutine: a plain suspend call that returns the data or throws.
  if (awaited) return `${m}.runAsync(${request}, ${op}${tail})`
  // Fire and forget from any callback: build the request and BEGIN on the calling thread (the web flips to pending
  // before its first await), then settle on the composable's scope — cancelled, with nothing written, if it leaves.
  return `${request}.let { __request -> ${m}.begin().let { __mine -> ${ctx.coroutineScope()}.launch { ${m}.run(__mine, __request, ${op}${tail}) } } }`
}

export const mutateExpr: ExprEmitter = {
  swift: (e, ctx) => swiftEmit(e, ctx, 'mutate'),
  kotlin: (e, ctx) => kotlinEmit(e, ctx, false),
}

export const mutateAsyncExpr: ExprEmitter = {
  // The core writes `try await` (Swift) and wraps the enclosing Task / coroutine so a rejection ends the handler.
  throws: true,
  swift: (e, ctx) => swiftEmit(e, ctx, 'mutateAsync'),
  kotlin: (e, ctx) => kotlinEmit(e, ctx, true),
  typing: {
    // `await m.mutateAsync(v)` is the decoded data.
    type: (e) => (isVoid(payloadOf(e).type) ? { kind: 'undefined' } : payloadOf(e).type),
  },
}

/** The `@State` / `remember` container a `useMutation` declaration emits. */
export function mutationDeclSwift(d: ExtDecl, ctx: EmitContext): string {
  const type = (d.payload as unknown as { type: TypeIR }).type
  return `@State private var ${ctx.ident(d.name)} = PyreonMutation<${isVoid(type) ? 'Void' : ctx.typeText(type)}>()`
}

export function mutationDeclKotlin(d: ExtDecl, ctx: EmitContext): string {
  const type = (d.payload as unknown as { type: TypeIR }).type
  return `val ${ctx.ident(d.name)} = remember { PyreonMutation<${isVoid(type) ? 'Unit' : ctx.typeText(type)}>() }`
}

/** The fields a mutation container exposes as plain reads (the web reads them as signals). */
export const MUTATION_FIELDS: ReadonlySet<string> = new Set([
  'data',
  'error',
  'status',
  'isPending',
  'isSuccess',
  'isError',
  'isIdle',
])

/** How `m.<field>()` reads type. */
export function mutationFieldType(d: ExtDecl, property: string, callForm: boolean): TypeIR | undefined {
  const type = (d.payload as unknown as { type: TypeIR }).type
  switch (property) {
    case 'data':
      return { kind: 'union', branches: [type, { kind: callForm ? 'undefined' : 'null' }] }
    case 'error':
      return { kind: 'union', branches: [ERROR_TYPE, { kind: callForm ? 'undefined' : 'null' }] }
    case 'status':
      return { kind: 'string' }
    case 'isPending':
    case 'isSuccess':
    case 'isError':
    case 'isIdle':
      return { kind: 'boolean' }
    default:
      return undefined
  }
}
