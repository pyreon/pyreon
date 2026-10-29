// A `createHttp({ use: [...] })` client's middleware, as the native compiler reads it.
//
// The array is read ONCE at scan time (it is file-scope metadata, like the client itself) into an ordered list of
// entries the native runtime applies around each request — `PyreonHttpMiddleware` on both targets, an onion with the
// web's semantics (`packages/native/runtime-{swift,kotlin}` PyreonHttp). What lowers:
//
//   bearer(() => token, { crossOrigin })   the token body is lowered at each CALL site, so it is evaluated per request
//   retry({ limit, methods, statuses, network, respectRetryAfter, maxDelay })   literal options only
//   logger({ production })                 debug builds only, unless `production: true`
//   forwardHeaders(names, …)               a NO-OP, exactly as in a browser: there is no inbound request to forward from
//
// Everything else — `refresh`, `dedupe`, a custom middleware function, a `backoff`/`log` callback, a non-literal option —
// is UNLOWERABLE, and an unlowerable entry keeps every endpoint call on that client on the web, by name. Dropping it would
// send a request the web never sends (no refresh on a 401, no de-duplication), which is a behaviour change, not a gap.

import {
  literalScalar,
  propName,
  readObjectProp,
  topLevelDeclarators,
  unwrapTypeLayers,
  type ExprEmitter,
  type ExprIR,
  type ExtExprIR,
  type ModuleScan,
  type ParseContext,
} from '@pyreon/native-compiler/plugin-api'
import { HTTP_PLUGIN_NAME } from './names'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const MIDDLEWARE_EXPR = 'middleware'

const MIDDLEWARE_MODULE = '@pyreon/http/middleware'

/** The web's defaults (`middleware/retry.ts`), so only a value that DIFFERS is emitted. */
const RETRY_DEFAULTS = {
  limit: 2,
  methods: ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'],
  statuses: [408, 413, 429, 500, 502, 503, 504],
  network: true,
  respectRetryAfter: true,
  maxDelay: 30_000,
}

export interface RetryEntry {
  readonly kind: 'retry'
  readonly limit?: number
  readonly methods?: readonly string[]
  readonly statuses?: readonly number[]
  readonly network?: boolean
  readonly respectRetryAfter?: boolean
  readonly maxDelay?: number
}

/** A lowered entry, minus its runtime parts. A `bearer` token is lowered per CALL, from {@link ScannedEntry.tokenNode}. */
export type MiddlewareEntry =
  | { readonly kind: 'bearer'; readonly crossOrigin: boolean }
  | RetryEntry
  | { readonly kind: 'logger'; readonly production: boolean }

interface ScannedEntry {
  readonly entry: MiddlewareEntry
  /** The token function's returned expression (bearer only). */
  readonly tokenNode?: AnyNode
}

/** What a client's `use` array scanned into. */
export interface ClientMiddleware {
  readonly entries: readonly ScannedEntry[]
  /** One named reason per entry that cannot lower. Non-empty → the client's calls stay web. */
  readonly unlowerable: readonly string[]
}

/** The payload of the {@link MIDDLEWARE_EXPR} expression: the entries in order, a bearer's token as its next `args` slot. */
interface MiddlewarePayload {
  readonly baseUrl: string
  readonly entries: readonly MiddlewareEntry[]
}

const NO_MIDDLEWARE: ClientMiddleware = { entries: [], unlowerable: [] }

/** Top-level `const x = signal(…)` / `computed(…)`: the compiler skips those ("belong inside a component"), so a token reading one would reference nothing. */
function moduleReactiveNames(body: readonly AnyNode[]): Set<string> {
  const out = new Set<string>()
  for (const node of body) {
    for (const decl of topLevelDeclarators(node)) {
      const init = unwrapTypeLayers(decl.init) as AnyNode | undefined
      const callee = init?.type === 'CallExpression' ? init.callee : undefined
      if (
        callee?.type === 'Identifier' &&
        (callee.name === 'signal' || callee.name === 'computed')
      ) {
        if (typeof decl.id?.name === 'string') out.add(decl.id.name)
      }
    }
  }
  return out
}

/** Every identifier REFERENCE in `node` (property keys and non-computed member names excluded). */
function referencedNames(node: AnyNode, out: Set<string> = new Set()): Set<string> {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const n of node) referencedNames(n, out)
    return out
  }
  if (node.type === 'Identifier') {
    out.add(node.name as string)
    return out
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    if (node.type === 'MemberExpression' && key === 'property' && !node.computed) continue
    if (node.type === 'Property' && key === 'key' && !node.computed) continue
    referencedNames(node[key], out)
  }
  return out
}

/** The single expression a zero-parameter `() => expr` / `() => { return expr }` / `function () { return expr }` returns. */
function returnedExpression(fn: AnyNode | undefined): AnyNode | undefined {
  const f = unwrapTypeLayers(fn) as AnyNode | undefined
  if (f?.type !== 'ArrowFunctionExpression' && f?.type !== 'FunctionExpression') return undefined
  if ((f.params as AnyNode[] | undefined)?.length || f.async || f.generator) return undefined
  if (f.body?.type !== 'BlockStatement') return f.body as AnyNode
  const stmts = f.body.body as AnyNode[]
  if (stmts.length === 1 && stmts[0]?.type === 'ReturnStatement' && stmts[0].argument)
    return stmts[0].argument
  return undefined
}

const literalBool = (v: AnyNode | undefined): boolean | undefined => {
  const x = literalScalar(unwrapTypeLayers(v) as AnyNode | undefined)
  return typeof x === 'boolean' ? x : undefined
}

const literalInt = (v: AnyNode | undefined): number | undefined => {
  const x = literalScalar(unwrapTypeLayers(v) as AnyNode | undefined)
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : undefined
}

/** An array literal of literals of one kind, or undefined. */
function literalArray<T extends string | number>(
  v: AnyNode | undefined,
  kind: 'string' | 'number',
): T[] | undefined {
  const a = unwrapTypeLayers(v) as AnyNode | undefined
  if (a?.type !== 'ArrayExpression') return undefined
  const out: T[] = []
  for (const el of (a.elements as AnyNode[] | undefined) ?? []) {
    const x = literalScalar(el)
    if (typeof x !== kind) return undefined
    out.push(x as T)
  }
  return out
}

/** The option object of a middleware call, as `{ key → value node }`, or a reason it cannot be read. */
function readOptions(arg: AnyNode | undefined, what: string): Map<string, AnyNode> | string {
  const out = new Map<string, AnyNode>()
  const obj = unwrapTypeLayers(arg) as AnyNode | undefined
  if (obj === undefined) return out
  if (obj.type !== 'ObjectExpression')
    return `${what}'s options are not an object literal, so they cannot be read at build time`
  for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
    const key = prop.type === 'Property' ? propName(prop) : undefined
    if (key === undefined)
      return `${what}'s options contain a spread or computed key, which cannot be read at build time`
    out.set(key, prop.value as AnyNode)
  }
  return out
}

function scanRetry(arg: AnyNode | undefined): RetryEntry | string {
  const opts = readOptions(arg, 'retry(…)')
  if (typeof opts === 'string') return opts
  const entry: { -readonly [K in keyof RetryEntry]: RetryEntry[K] } = { kind: 'retry' }
  for (const [key, value] of opts) {
    switch (key) {
      case 'limit':
      case 'maxDelay': {
        const n = literalInt(value)
        if (n === undefined) return `retry({ ${key} }) must be a non-negative integer literal`
        if (n !== RETRY_DEFAULTS[key]) entry[key] = n
        break
      }
      case 'network':
      case 'respectRetryAfter': {
        const b = literalBool(value)
        if (b === undefined) return `retry({ ${key} }) must be a boolean literal`
        if (b !== RETRY_DEFAULTS[key]) entry[key] = b
        break
      }
      case 'methods': {
        const m = literalArray<string>(value, 'string')
        if (m === undefined) return 'retry({ methods }) must be an array of string literals'
        // Verbatim: the web compares `request.method` (upper case) against this list, so a lower-case entry never matches.
        entry.methods = m
        break
      }
      case 'statuses': {
        const s = literalArray<number>(value, 'number')
        if (s === undefined) return 'retry({ statuses }) must be an array of number literals'
        entry.statuses = s
        break
      }
      case 'backoff':
        return 'retry({ backoff }) is a JavaScript function, which cannot be compiled — drop it to use the built-in exponential backoff with jitter, which lowers'
      default:
        return `retry({ ${key} }) is not a retry option the native runtime knows`
    }
  }
  return entry
}

/** Why each known-but-unlowerable middleware stays web. */
const UNLOWERABLE_MIDDLEWARE: Readonly<Record<string, string>> = {
  refresh:
    'refresh(…) runs your async refresh callback and re-issues the request, and a JavaScript callback cannot be compiled',
  dedupe:
    'dedupe(…) shares one in-flight request between concurrent callers, and the native harnesses keep no shared in-flight registry',
}

/** One `use` element → an entry, or the reason it cannot lower. */
function scanEntry(
  el: AnyNode,
  scan: ModuleScan,
  reactive: ReadonlySet<string>,
): ScannedEntry | 'noop' | string {
  const node = unwrapTypeLayers(el) as AnyNode | undefined
  const callee = node?.type === 'CallExpression' ? (node.callee as AnyNode) : undefined
  const imported = (name: string): boolean =>
    callee?.type === 'Identifier' && scan.isImportedReference(callee, MIDDLEWARE_MODULE, name)
  const args = (node?.arguments as AnyNode[] | undefined) ?? []
  if (imported('bearer')) {
    scan.lowered(MIDDLEWARE_MODULE, 'bearer')
    const token = returnedExpression(args[0])
    if (token === undefined) {
      return 'bearer(…) needs an inline token function with no parameters that returns one expression — `bearer(() => useAuth().store.token())` — so the token can be compiled into the request'
    }
    const stale = [...referencedNames(token)].filter((n) => reactive.has(n))
    if (stale.length > 0) {
      return `bearer(…)'s token reads the module-scope signal \`${stale[0]}\`, which does not exist on iOS or Android (a file-scope \`signal()\` is skipped) — keep the token in a store (\`defineStore\`) and read it with \`useX().store.token()\``
    }
    const opts = readOptions(args[1], 'bearer(…)')
    if (typeof opts === 'string') return opts
    let crossOrigin = false
    for (const [key, value] of opts) {
      if (key !== 'crossOrigin')
        return `bearer({ ${key} }) is not a bearer option the native runtime knows`
      const b = literalBool(value)
      if (b === undefined) return 'bearer({ crossOrigin }) must be a boolean literal'
      crossOrigin = b
    }
    return { entry: { kind: 'bearer', crossOrigin }, tokenNode: token }
  }
  if (imported('retry')) {
    scan.lowered(MIDDLEWARE_MODULE, 'retry')
    const r = scanRetry(args[0])
    return typeof r === 'string' ? r : { entry: r }
  }
  if (imported('logger')) {
    scan.lowered(MIDDLEWARE_MODULE, 'logger')
    const opts = readOptions(args[0], 'logger(…)')
    if (typeof opts === 'string') return opts
    let production = false
    for (const [key, value] of opts) {
      if (key === 'log')
        return 'logger({ log }) is a JavaScript function, which cannot be compiled — drop it to log to the platform console, which lowers'
      if (key !== 'production')
        return `logger({ ${key} }) is not a logger option the native runtime knows`
      const b = literalBool(value)
      if (b === undefined) return 'logger({ production }) must be a boolean literal'
      production = b
    }
    return { entry: { kind: 'logger', production } }
  }
  if (imported('forwardHeaders')) {
    // Forwards headers from the INBOUND server request. On a client there is none — the web middleware is a no-op in the
    // browser for the same reason — so the native lowering is the same no-op, not a drop.
    scan.lowered(MIDDLEWARE_MODULE, 'forwardHeaders')
    return 'noop'
  }
  for (const [name, why] of Object.entries(UNLOWERABLE_MIDDLEWARE)) {
    if (imported(name)) {
      scan.lowered(MIDDLEWARE_MODULE, name)
      return why
    }
  }
  if (callee?.type === 'Identifier')
    return `\`${callee.name}(…)\` is not a middleware the native runtime knows, and a custom middleware function cannot be compiled`
  if (node?.type === 'Identifier')
    return `\`${node.name}\` is a custom middleware function, which cannot be compiled`
  return 'a computed middleware entry cannot be read at build time'
}

/** Read a `createHttp` config's `use` property. */
export function scanClientMiddleware(cfg: AnyNode | undefined, scan: ModuleScan): ClientMiddleware {
  const use = readObjectProp(cfg, 'use') as AnyNode | undefined
  if (use === undefined) return NO_MIDDLEWARE
  const arr = unwrapTypeLayers(use) as AnyNode | undefined
  if (arr?.type !== 'ArrayExpression') {
    return {
      entries: [],
      unlowerable: [
        '`use` is not an array literal, so its middleware cannot be read at build time',
      ],
    }
  }
  const reactive = moduleReactiveNames(scan.body as AnyNode[])
  const entries: ScannedEntry[] = []
  const unlowerable: string[] = []
  for (const el of (arr.elements as AnyNode[] | undefined) ?? []) {
    if (el === null || el === undefined) continue
    if (el.type === 'SpreadElement') {
      unlowerable.push('a spread inside `use` cannot be read at build time')
      continue
    }
    const r = scanEntry(el, scan, reactive)
    if (r === 'noop') continue
    if (typeof r === 'string') unlowerable.push(r)
    else entries.push(r)
  }
  return { entries, unlowerable }
}

/**
 * The client's middleware as the expression the emit hands to `PyreonHttp.send(…, middleware:)`, or `undefined` when
 * there is nothing to apply. Each bearer token is lowered HERE, at the call site, so it is the component's own expression.
 */
export function middlewareExpr(
  mw: ClientMiddleware,
  baseUrl: string,
  ctx: ParseContext,
): ExprIR | undefined {
  if (mw.entries.length === 0) return undefined
  const args: ExprIR[] = []
  for (const e of mw.entries) if (e.tokenNode !== undefined) args.push(ctx.expr(e.tokenNode))
  const payload: MiddlewarePayload = { baseUrl, entries: mw.entries.map((e) => e.entry) }
  return {
    kind: 'ext-expr',
    plugin: HTTP_PLUGIN_NAME,
    type: MIDDLEWARE_EXPR,
    payload: payload as never,
    args,
  }
}

/** The names of the lowered entries, for a message. */
export function middlewareNames(mw: ClientMiddleware): string {
  return mw.entries.map((e) => e.entry.kind).join(', ')
}

const payloadOf = (e: ExtExprIR): MiddlewarePayload => e.payload as unknown as MiddlewarePayload

/** Render the non-default retry fields as `name: value` / `name = value` pairs. */
function retryFields(
  r: RetryEntry,
  list: (xs: readonly string[]) => string,
  str: (s: string) => string,
  sep: string,
): string[] {
  const out: string[] = []
  if (r.limit !== undefined) out.push(`limit${sep}${r.limit}`)
  if (r.methods !== undefined) out.push(`methods${sep}${list(r.methods.map(str))}`)
  if (r.statuses !== undefined) out.push(`statuses${sep}${list(r.statuses.map(String))}`)
  if (r.network !== undefined) out.push(`network${sep}${r.network}`)
  if (r.respectRetryAfter !== undefined) out.push(`respectRetryAfter${sep}${r.respectRetryAfter}`)
  if (r.maxDelay !== undefined) out.push(`maxDelay${sep}${r.maxDelay}.0`)
  return out
}

/** Swift `[PyreonHttpMiddleware]` / Kotlin `List<PyreonHttpMiddleware>` — the runtime surface in PyreonHttp.{swift,kt}. */
export const middlewareExprEmitter: ExprEmitter = {
  swift: (e, ctx) => {
    const p = payloadOf(e)
    let token = 0
    const items = p.entries.map((entry) => {
      switch (entry.kind) {
        case 'bearer': {
          const body = ctx.expr(e.args[token++]!)
          return `.bearer(baseUrl: ${ctx.stringLiteral(p.baseUrl)}, crossOrigin: ${entry.crossOrigin}, token: { ${body} })`
        }
        case 'retry': {
          const fields = retryFields(
            entry,
            (xs) => `[${xs.join(', ')}]`,
            (s) => ctx.stringLiteral(s),
            ': ',
          )
          return `.retry(PyreonRetryPolicy(${fields.join(', ')}))`
        }
        case 'logger':
          return `.logger(production: ${entry.production})`
      }
    })
    return `[${items.join(', ')}] as [PyreonHttpMiddleware]`
  },
  kotlin: (e, ctx) => {
    const p = payloadOf(e)
    let token = 0
    const items = p.entries.map((entry) => {
      switch (entry.kind) {
        case 'bearer': {
          const body = ctx.expr(e.args[token++]!)
          return `PyreonHttpMiddleware.Bearer(baseUrl = ${ctx.stringLiteral(p.baseUrl)}, crossOrigin = ${entry.crossOrigin}, token = { ${body} })`
        }
        case 'retry': {
          const fields = retryFields(
            entry,
            (xs) => `listOf(${xs.join(', ')})`,
            (s) => ctx.stringLiteral(s),
            ' = ',
          )
          return `PyreonHttpMiddleware.Retry(PyreonRetryPolicy(${fields.join(', ')}))`
        }
        case 'logger':
          return `PyreonHttpMiddleware.Logger(production = ${entry.production})`
      }
    })
    return `listOf<PyreonHttpMiddleware>(${items.join(', ')})`
  },
}
