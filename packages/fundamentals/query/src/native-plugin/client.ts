// The query CLIENT on iOS and Android: `useQueryClient()` / `new QueryClient()` bind it, and
// `client.invalidateQueries(…)` lowers onto `PyreonQueryCache`, the native query client every `PyreonQuery` already
// registers with. The useMutation `invalidates: [key, …]` option lowers through the same emitter.
//
// Keys. A web key is an array; a native key is its parts colon-joined (`['todo', 5]` → `todo:5`, the key every lowered
// query is cached and registered under). TanStack's default match is a PREFIX of parts, which on the joined string is
// "the key itself, or a key that starts with `<key>:`" — exactly `PyreonQueryCache.invalidateQueries(root)`; `exact: true`
// is string equality. That mapping is faithful only for parts the join cannot confuse, so every other part is refused
// by NAME instead of lowered to a different set of queries:
//
//   - a string literal holding `:` (`['a:b']` and `['a', 'b']` would be one native key);
//   - an object, array, boolean or `null` part (the web matches an object part PARTIALLY; native parts are text);
//   - a key whose first part is an HTTP method — an `@pyreon/http` endpoint query's web key (`['GET', '/users/:id', …]`),
//     which natively is keyed by its resolved `METHOD:url`, so no web key prefix names it.
//
// A runtime part (`['todo', id]`) is interpolated as the queries interpolate theirs; one whose type is not a string or a
// number is named at emit. Every other filter (`refetchType`, `type`, `predicate`, `stale`, `fetchStatus`) is refused by
// name. What does not cross is the WAIT: the web's `invalidateQueries` resolves when the refetches it started settle,
// so an `await`ed one — or one a `useMutation` option callback returns, which keeps the mutation pending — waits for
// them; natively the call starts the refetches and returns. That is reported by name where it applies.

import type {
  CallRecognizer,
  EmitContext,
  ExprEmitter,
  ExprIR,
  ExtExprIR,
  MethodCallRecognizer,
  ModuleScan,
  StatementIR,
} from '@pyreon/native-compiler/plugin-api'
import { hasDynamicKey, propName, unwrapTypeLayers } from '@pyreon/native-compiler/plugin-api'
import { QUERY_CLIENT_TYPE, QUERY_PLUGIN_NAME } from './names'
import { tryQueryKeyParts } from './recognize'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** The `ext-expr` type `client.invalidateQueries(…)` lowers to. */
export const INVALIDATE_TYPE = 'invalidate-queries'

/** What one invalidation carries; a runtime key is `args[0]`. */
interface InvalidatePayload {
  /** No filter: every query. */
  readonly all?: true
  /** The colon-joined key, when every part is a literal. */
  readonly key?: string
  readonly exact?: true
}

interface ClientFacts {
  /** Bindings of the query client: `const qc = useQueryClient()`, `const client = new QueryClient()`. */
  readonly bindings: Set<string>
  /** `invalidateQueries` calls the web WAITS on: awaited, or returned from a `useMutation` option callback. */
  readonly awaited: WeakSet<object>
}

const FACTS_KEY = `${QUERY_PLUGIN_NAME}:client`

function clientFacts(source: { fileState<T>(key: string, init: () => T): T }): ClientFacts {
  return source.fileState<ClientFacts>(FACTS_KEY, () => ({ bindings: new Set(), awaited: new WeakSet() }))
}

const HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/** Filters `invalidateQueries` takes that have no native counterpart, and why. */
const UNLOWERED_FILTERS: ReadonlyMap<string, string> = new Map([
  ['refetchType', 'natively every LIVE (mounted) query under the key refetches and a cached one refetches on its next mount — the web\'s default `\'active\'`; another value has no native counterpart'],
  ['type', 'native queries carry no active / inactive filter'],
  ['predicate', 'a predicate function over the query cache does not lower'],
  ['stale', 'native queries carry no staleness filter'],
  ['fetchStatus', 'native queries carry no fetch-status filter'],
])

/** The query-client methods other than `invalidateQueries` — claimed and named, never emitted as a call nothing declares. */
export const UNLOWERED_CLIENT_METHODS: readonly string[] = [
  'setQueryData',
  'getQueryData',
  'refetchQueries',
  'removeQueries',
  'resetQueries',
  'cancelQueries',
  'prefetchQuery',
  'fetchQuery',
  'ensureQueryData',
  'setQueriesData',
  'getQueriesData',
  'clear',
]

const isCallOf = (node: AnyNode, method: string): boolean =>
  node?.type === 'CallExpression' &&
  node.callee?.type === 'MemberExpression' &&
  node.callee.computed !== true &&
  node.callee.property?.type === 'Identifier' &&
  node.callee.property.name === method

/** The expression a function returns: its expression body, or each `return <expr>` of a block body. */
function returnedExprs(fn: AnyNode): AnyNode[] {
  const body = fn?.body as AnyNode | undefined
  if (body === undefined) return []
  if (body.type !== 'BlockStatement') return [unwrapTypeLayers(body) as AnyNode]
  return ((body.body as AnyNode[] | undefined) ?? [])
    .filter((st) => st.type === 'ReturnStatement' && st.argument)
    .map((st) => unwrapTypeLayers(st.argument as AnyNode) as AnyNode)
}

/**
 * The `scanModule` pass: every `invalidateQueries` call the web waits on. An `await`ed one, anywhere; and one a
 * `useMutation({ onSuccess / onError / onSettled })` callback RETURNS — TanStack awaits an option callback's promise
 * before it settles the mutation. (A call-level `mutate(v, { onSuccess })` callback is not awaited, so it is not here.)
 */
export function scanQueryClient(scan: ModuleScan): void {
  const facts = clientFacts(scan)
  const visit = (node: AnyNode): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'AwaitExpression') {
      const call = unwrapTypeLayers(node.argument as AnyNode) as AnyNode
      if (isCallOf(call, 'invalidateQueries')) facts.awaited.add(call)
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'useMutation') {
      const opts = unwrapTypeLayers(node.arguments?.[0] as AnyNode) as AnyNode
      for (const prop of opts?.type === 'ObjectExpression' ? ((opts.properties as AnyNode[]) ?? []) : []) {
        const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
        if (key !== 'onSuccess' && key !== 'onError' && key !== 'onSettled') continue
        for (const r of returnedExprs(unwrapTypeLayers(prop.value as AnyNode))) {
          if (isCallOf(r, 'invalidateQueries')) facts.awaited.add(r)
        }
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

/** `const qc = useQueryClient()` — record the binding; it emits nothing (the client is `PyreonQueryCache`). */
export const recognizeUseQueryClient: CallRecognizer = (_call, ctx) => {
  clientFacts(ctx).bindings.add(ctx.declName)
  return { type: QUERY_CLIENT_TYPE }
}

/** `const client = new QueryClient()` — the same client, constructed. */
export const recognizeQueryClient: CallRecognizer = (call, ctx) => {
  if (call.construct !== true) return undefined
  clientFacts(ctx).bindings.add(ctx.declName)
  return { type: QUERY_CLIENT_TYPE }
}

/** The key of a lowered invalidation, or a NAMED refusal. */
type KeyVerdict = { readonly literal: string; readonly expr?: ExprIR } | { readonly refused: string }

/** Read a web query key (an array literal) as the native colon-joined key, refusing every part the join would misread. */
export function nativeInvalidationKey(node: AnyNode, ctx: { expr(node: AnyNode): ExprIR }): KeyVerdict {
  const key = unwrapTypeLayers(node) as AnyNode
  if (key?.type !== 'ArrayExpression') {
    return { refused: 'the key is not an array literal, so its parts cannot be read at compile time — write it inline (`[\'todo\', id]`)' }
  }
  const parts = (key.elements as AnyNode[] | undefined) ?? []
  if (parts.length === 0) return { refused: 'an empty key matches every query — call `invalidateQueries()` with no filter for that' }
  for (const [i, raw] of parts.entries()) {
    const part = unwrapTypeLayers(raw) as AnyNode
    if (part === null || part?.type === 'SpreadElement') return { refused: 'the key holds a spread or a hole, so its parts cannot be read at compile time' }
    const literal = part.type === 'Literal' || part.type === 'StringLiteral' || part.type === 'NumericLiteral' || part.type === 'BooleanLiteral' || part.type === 'NullLiteral'
    const value: unknown = part.value
    if (literal && typeof value === 'string') {
      if (value.includes(':')) {
        return { refused: `the key part \`'${value}'\` holds \`:\`, and a native key is the parts joined by \`:\` — so it would also match the key \`[${value.split(':').map((s) => `'${s}'`).join(', ')}]\` the web keeps apart` }
      }
      if (i === 0 && HTTP_METHODS.has(value)) {
        return { refused: `a key that starts with \`'${value}'\` names \`@pyreon/http\` endpoint queries, which are keyed natively by their resolved \`METHOD:url\` rather than the web's \`[method, path, …]\` — no web key prefix names them` }
      }
      continue
    }
    if (literal && typeof value === 'number' && Number.isFinite(value)) continue
    if (literal || part.type === 'ObjectExpression' || part.type === 'ArrayExpression' || (part.type === 'Identifier' && part.name === 'undefined')) {
      return { refused: 'the key holds an object, array, boolean, `null` or `undefined` part — the web matches those structurally (an object part partially), and a native key part is text' }
    }
  }
  const joined = tryQueryKeyParts(key, ctx as never)
  if (joined === undefined) return { refused: 'the key cannot be read at compile time' }
  return joined
}

/** `<client>.invalidateQueries(filters?)` on a recorded client binding. */
export const recognizeInvalidateQueries: MethodCallRecognizer = (site, ctx) => {
  const receiver = site.receiver as AnyNode
  if (receiver?.type !== 'Identifier' || !clientFacts(ctx).bindings.has(receiver.name as string)) return undefined
  const where = `\`${receiver.name}.invalidateQueries(…)\``
  if (clientFacts(ctx).awaited.has(site.node as object)) {
    ctx.report(
      `${where}: the web waits for the refetches it starts — it is awaited, or a \`useMutation\` option callback returns it, which keeps the mutation pending until they settle. Natively it starts them and returns at once, so that wait (and the longer \`isPending\`) does not cross.`,
    )
  }
  const filters = unwrapTypeLayers(site.args[0] as AnyNode) as AnyNode
  if (site.args.length === 0 || filters === undefined) return { type: INVALIDATE_TYPE, payload: { all: true } as never }
  if (filters.type !== 'ObjectExpression') {
    return ctx.unsupported(site.node, where, 'pass the filters as an object literal (`{ queryKey: [\'todo\'] }`) — they are read at compile time')
  }
  let keyNode: AnyNode | undefined
  let exact = false
  for (const prop of (filters.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type === 'SpreadElement' || hasDynamicKey(prop)) {
      return ctx.unsupported(site.node, where, 'the filters hold a spread or a computed key, which cannot be read at compile time')
    }
    const key = propName(prop)
    const value = unwrapTypeLayers(prop.value as AnyNode) as AnyNode
    if (key === 'queryKey') keyNode = value
    else if (key === 'exact') {
      if (value?.type !== 'Literal' && value?.type !== 'BooleanLiteral') {
        return ctx.unsupported(site.node, where, '`exact` must be a boolean literal — it decides at compile time how the key matches')
      }
      exact = value.value === true
    } else if (key === 'refetchType' && (value?.type === 'Literal' || value?.type === 'StringLiteral') && value.value === 'active') {
      // The default, and the native behaviour.
    } else {
      return ctx.unsupported(site.node, where, `the \`${key}\` filter does not lower: ${UNLOWERED_FILTERS.get(key ?? '') ?? 'it is not part of the lowered invalidation surface'}`)
    }
  }
  if (keyNode === undefined) {
    return exact
      ? ctx.unsupported(site.node, where, '`exact` without a `queryKey` matches nothing on the web — pass the key')
      : { type: INVALIDATE_TYPE, payload: { all: true } as never }
  }
  const verdict = nativeInvalidationKey(keyNode, ctx)
  if ('refused' in verdict) return ctx.unsupported(site.node, where, verdict.refused)
  return invalidation(verdict, exact)
}

/** The `ext-expr` of one lowered invalidation. */
function invalidation(key: { readonly literal: string; readonly expr?: ExprIR }, exact: boolean): { type: string; payload: never; args: ExprIR[] } {
  const payload: InvalidatePayload = {
    ...(key.expr === undefined ? { key: key.literal } : {}),
    ...(exact ? { exact: true } : {}),
  }
  return { type: INVALIDATE_TYPE, payload: payload as never, args: key.expr === undefined ? [] : [key.expr] }
}

/**
 * `useMutation({ invalidates: [key, …] })` — `@pyreon/query`'s shorthand for an `onSuccess` that invalidates each key
 * BEFORE the author's own `onSuccess` runs. Returns the statements to prepend, or the NAMED reason it does not lower.
 */
export function invalidatesStatements(
  node: AnyNode,
  ctx: { expr(node: AnyNode): ExprIR },
): { readonly statements: readonly StatementIR[] } | { readonly refused: string } {
  const list = unwrapTypeLayers(node) as AnyNode
  if (list?.type !== 'ArrayExpression') return { refused: 'it is not an array literal of keys, so the keys cannot be read at compile time' }
  const statements: StatementIR[] = []
  for (const el of (list.elements as AnyNode[] | undefined) ?? []) {
    const verdict = nativeInvalidationKey(el, ctx)
    if ('refused' in verdict) return verdict
    const ext = invalidation(verdict, false)
    statements.push({ kind: 'expr', expr: { kind: 'ext-expr', plugin: QUERY_PLUGIN_NAME, type: ext.type, payload: ext.payload, args: ext.args } as ExprIR })
  }
  return { statements }
}

/** `<client>.<method>(…)` for a client method that does not lower: claimed and named. */
export const recognizeUnloweredClientMethod: MethodCallRecognizer = (site, ctx) => {
  const receiver = site.receiver as AnyNode
  if (receiver?.type !== 'Identifier' || !clientFacts(ctx).bindings.has(receiver.name as string)) return undefined
  return ctx.unsupported(
    site.node,
    `\`${receiver.name}.${site.method}(…)\``,
    `only \`invalidateQueries\` lowers on the native query client (\`PyreonQueryCache\`) — a native query's cached value is a typed record, which \`${site.method}\` cannot address from shared code`,
  )
}

const payloadOf = (e: ExtExprIR): InvalidatePayload => e.payload as unknown as InvalidatePayload

/** The key argument: the literal, or the runtime template — whose parts must be text or numbers, as the queries' are. */
function keyText(e: ExtExprIR, ctx: EmitContext): string {
  const p = payloadOf(e)
  if (p.key !== undefined) return ctx.stringLiteral(p.key)
  const expr = e.args[0] as ExExprTemplate
  for (const part of expr.exprs ?? []) {
    const t = ctx.inferType(part)
    if (t.kind === 'string' || t.kind === 'number') continue
    ctx.warnOnce(
      `\`invalidateQueries\`: a runtime key part is not a string or a number, so it is not the text a query key part is natively — the invalidation may match no query. Pass the id itself (\`['todo', id]\`).`,
    )
  }
  return ctx.expr(e.args[0] as ExprIR, 0)
}

type ExExprTemplate = ExprIR & { readonly exprs?: readonly ExprIR[] }

export const invalidateQueriesExpr: ExprEmitter = {
  swift: (e, ctx) => {
    const p = payloadOf(e)
    if (p.all === true) return 'PyreonQueryCache.shared.invalidateAllQueries()'
    const key = keyText(e, ctx)
    return p.exact === true ? `PyreonQueryCache.shared.invalidateQueries(${key}, exact: true)` : `PyreonQueryCache.shared.invalidateQueries(${key})`
  },
  kotlin: (e, ctx) => {
    const p = payloadOf(e)
    if (p.all === true) return 'PyreonQueryCache.invalidateAllQueries()'
    const key = keyText(e, ctx)
    return p.exact === true ? `PyreonQueryCache.invalidateQueries(${key}, exact = true)` : `PyreonQueryCache.invalidateQueries(${key})`
  },
}
