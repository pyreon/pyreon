// How `useInfiniteQuery` crosses to native: the recognizer, the Swift/Kotlin declaration and harness, the field reads and
// the types of those reads. The runtime it drives is `PyreonInfiniteQuery` (`native/swift`, `native/kotlin`).
//
// First slice, deliberately narrow — each unsupported shape is a NAMED warning that drops the declaration, because a
// silently different pagination is worse than a missing feature:
//   useInfiniteQuery<Page>(() => ({
//     queryKey: ['feed'],                                  // literals only (a runtime key would need re-keying)
//     queryFn: ({ pageParam }) => fetch(`/feed?c=${pageParam}`),   // a GET fetch whose URL mentions the page parameter
//     initialPageParam: 0,                                 // a string or number literal
//     getNextPageParam: (last) => last.nextCursor,         // a field read of the last page (`?? undefined` allowed)
//   }))
// Not lowered: a fetch init (method/headers/body), `getPreviousPageParam`, `maxPages`, `staleTime`, an endpoint
// `.query()` form, and `refetch`. The native runtime keeps no cache shared across screens.

import {
  hasDynamicKey,
  staticPropKey,
  unwrapTypeLayers,
  type CallSite,
  type DeclEmitter,
  type EmitContext,
  type ExtDecl,
  type ExtDeclSpec,
  type ParseContext,
  type ReceiverLowering,
  type ReceiverSite,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { INFINITE_QUERY_TYPE } from './names'
import { arrowReturnedObject, tryQueryFnFetch, tryQueryKeyParts } from './recognize'
import type { InfiniteQueryPayload } from './types'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const payload = (d: ExtDecl): InfiniteQueryPayload => d.payload as unknown as InfiniteQueryPayload

/** The fields the container exposes as plain reads (the web reads them as signals). */
export const INFINITE_FIELDS: ReadonlySet<string> = new Set([
  'data',
  'isPending',
  'isFetching',
  'isFetchingNextPage',
  'hasNextPage',
  'error',
])

const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }
const BOOLEAN: TypeIR = { kind: 'boolean' }

// ── recognizer ──────────────────────────────────────────────────────────────

/** `({ pageParam })` / `({ pageParam: cursor })` → the bound name; `undefined` for any other parameter shape. */
function pageParamBinding(fn: AnyNode): string | undefined {
  const param = fn?.params?.[0] as AnyNode | undefined
  if (param?.type !== 'ObjectPattern') return undefined
  for (const prop of (param.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type !== 'Property' || prop.computed === true) continue
    if (prop.key?.type !== 'Identifier' || prop.key.name !== 'pageParam') continue
    const value = prop.value as AnyNode | undefined
    if (value?.type === 'Identifier') return value.name as string
    // `{ pageParam = 0 }` — a default is bound to the same name.
    if (value?.type === 'AssignmentPattern' && value.left?.type === 'Identifier') return value.left.name as string
  }
  return undefined
}

/** The single returned expression of an arrow, whether it is an expression body or `{ return <expr> }`. */
function returnedExpression(fn: AnyNode): AnyNode | undefined {
  const body = fn?.body as AnyNode | undefined
  if (body?.type !== 'BlockStatement') return body
  const statements = (body.body as AnyNode[] | undefined) ?? []
  const only = statements[0]
  return statements.length === 1 && only?.type === 'ReturnStatement' ? (only.argument as AnyNode | undefined) : undefined
}

/**
 * `(last) => last.nextCursor`, optionally `?? undefined` / `?? null` (both mean "no next page" on the web). Returns the
 * name the last page is bound to and the field read off it.
 */
function nextParamField(fn: AnyNode): { last: string; field: string } | undefined {
  if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return undefined
  const first = fn.params?.[0] as AnyNode | undefined
  if (first?.type !== 'Identifier') return undefined
  let expr = returnedExpression(fn)
  if (expr?.type === 'LogicalExpression' && expr.operator === '??') {
    const right = expr.right as AnyNode
    const nothing =
      (right?.type === 'Identifier' && right.name === 'undefined') || (right?.type === 'Literal' && right.value === null)
    if (!nothing) return undefined
    expr = expr.left as AnyNode
  }
  if (expr?.type !== 'MemberExpression' || expr.computed === true) return undefined
  if (expr.object?.type !== 'Identifier' || expr.object.name !== first.name) return undefined
  if (expr.property?.type !== 'Identifier') return undefined
  return { last: first.name as string, field: expr.property.name as string }
}

export function recognizeInfiniteQuery(_call: CallSite, ctx: ParseContext): ExtDeclSpec | null | undefined {
  const where = `Declaration ${ctx.declName}: useInfiniteQuery`
  const decline = (why: string): null => {
    ctx.report(`${where} ${why} It was NOT lowered, so it will not run on device.`)
    return null
  }
  const pageType = ctx.typeArg()
  if (pageType.kind === 'unknown') {
    return decline(
      'needs the shape of one page: useInfiniteQuery<Page>(() => ({ … })). Without it the page decodes into Any on Swift, which cannot conform to Decodable.',
    )
  }
  const optsFn = ctx.args[0] as AnyNode | undefined
  const optsObj = optsFn?.type === 'ArrowFunctionExpression' ? arrowReturnedObject(optsFn) : undefined
  if (optsObj === undefined) {
    return decline('expects an options function that returns an object literal: () => ({ queryKey, queryFn, initialPageParam, getNextPageParam }).')
  }

  let queryKey: string | undefined
  let pageParamName: string | undefined
  let url: string | undefined
  let urlExpr: InfiniteQueryPayload['urlExpr']
  let initialParam: string | undefined
  let next: { last: string; field: string } | undefined

  for (const prop of (optsObj.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type !== 'Property') return decline('has a spread or method in its options, which cannot be read at compile time.')
    if (hasDynamicKey(prop)) return decline('has a computed option key, which is only known at runtime.')
    const key = staticPropKey(prop)
    if (key === 'queryKey') {
      const parts = tryQueryKeyParts(prop.value, ctx)
      if (parts === undefined) return decline('needs queryKey to be an array of string/number literals.')
      if (parts.expr !== undefined) {
        return decline('does not lower a queryKey that reads a signal or prop: the native runtime would not re-fetch when it changes.')
      }
      queryKey = parts.literal
    } else if (key === 'queryFn') {
      const fn = prop.value as AnyNode
      pageParamName = pageParamBinding(fn)
      if (pageParamName === undefined) return decline('needs queryFn to destructure its argument: ({ pageParam }) => fetch(…).')
      const fetched = tryQueryFnFetch(fn)
      if (fetched === undefined) return decline('needs queryFn to be a fetch of a URL: ({ pageParam }) => fetch(`/path?cursor=${pageParam}`).')
      if (fetched.init !== undefined) {
        return decline('does not lower a fetch with an init object (method, headers or body); only a plain GET fetch is supported for now.')
      }
      if (fetched.url !== undefined) url = fetched.url
      else urlExpr = ctx.expr(fetched.urlNode)
    } else if (key === 'initialPageParam') {
      const literal = unwrapTypeLayers(prop.value) as AnyNode
      const ok = (literal?.type === 'Literal' || literal?.type === 'StringLiteral' || literal?.type === 'NumericLiteral') &&
        (typeof literal.value === 'string' || typeof literal.value === 'number')
      if (!ok) return decline('needs initialPageParam to be a string or number literal.')
      initialParam = String(literal.value)
    } else if (key === 'getNextPageParam') {
      next = nextParamField(prop.value)
      if (next === undefined) {
        return decline('needs getNextPageParam to read a field of the last page: (last) => last.nextCursor (optionally `?? undefined`).')
      }
    } else {
      return decline(`has the option \`${key ?? '?'}\`, which the native runtime does not support (supported: queryKey, queryFn, initialPageParam, getNextPageParam).`)
    }
  }
  if (queryKey === undefined) return decline('needs a queryKey.')
  if (pageParamName === undefined || (url === undefined && urlExpr === undefined)) return decline('needs a queryFn.')
  if (initialParam === undefined) return decline('needs initialPageParam (TanStack v5 requires it).')
  if (next === undefined) return decline('needs getNextPageParam.')

  // Each page decodes into `pageType` from a plain fetch (no response schema): record it so an integer-default number
  // field a fractional payload would fail to decode is named (#3956).
  ctx.recordDecode(pageType, undefined)
  const body: InfiniteQueryPayload = {
    pageType,
    queryKey,
    pageParamName,
    initialParam,
    lastPageName: next.last,
    nextField: next.field,
    ...(url === undefined ? {} : { url }),
    ...(urlExpr === undefined ? {} : { urlExpr }),
  }
  return { type: INFINITE_QUERY_TYPE, payload: body as unknown as NonNullable<ExtDeclSpec['payload']> }
}

// ── Swift ───────────────────────────────────────────────────────────────────

export function infiniteDeclSwift(d: ExtDecl, ctx: EmitContext): string {
  const p = payload(d)
  return `@State private var ${ctx.ident(d.name)} = PyreonInfiniteQuery<${ctx.typeText(p.pageType)}>(queryKey: ${ctx.stringLiteral(p.queryKey)}, initialParam: ${ctx.stringLiteral(p.initialParam)})`
}

/**
 * One `.task`: it wires the two closures the state machine needs (how to read the next parameter, how to fetch one page)
 * and starts the first page. The fetch runs in a `@MainActor` task so every `resolve` / `reject` lands on the main
 * actor, where the container's observable state is read.
 */
export function infiniteLifecycleSwift(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const p = payload(decl)
  const name = ctx.ident(decl.name)
  const url = p.urlExpr !== undefined ? ctx.expr(p.urlExpr, 0) : ctx.stringLiteral(p.url as string)
  const page = ctx.typeText(p.pageType)
  return [
    '.task {',
    `  ${name}.getNextParam = { ${ctx.ident(p.lastPageName)} in pyreonPageParam(${ctx.ident(p.lastPageName)}.${ctx.ident(p.nextField)}) }`,
    `  ${name}.requestPage = { ${ctx.ident(p.pageParamName)} in`,
    '    _Concurrency.Task { @MainActor in',
    '      do {',
    `        let (bytes, _) = try await URLSession.shared.data(from: URL(string: ${url})!)`,
    `        ${name}.resolve(try JSONDecoder().decode(${page}.self, from: bytes), param: ${ctx.ident(p.pageParamName)})`,
    `      } catch { ${name}.reject(error) }`,
    '    }',
    '  }',
    `  ${name}.start()`,
    '}',
  ]
}

// ── Kotlin ──────────────────────────────────────────────────────────────────

export function infiniteDeclKotlin(d: ExtDecl, ctx: EmitContext): string {
  const p = payload(d)
  // The scope is the composable's own (cancelled when it leaves composition): `fetchNextPage()` runs from a press handler,
  // long after the mount effect returned, so the harness cannot borrow the effect's coroutine.
  return `val ${ctx.ident(d.name)}Scope = rememberCoroutineScope()\nval ${ctx.ident(d.name)} = remember { PyreonInfiniteQuery<${ctx.typeText(p.pageType)}>(queryKey = ${ctx.stringLiteral(p.queryKey)}, initialParam = ${ctx.stringLiteral(p.initialParam)}) }`
}

export function infiniteLifecycleKotlin(decl: ExtDecl, ctx: EmitContext): readonly string[] {
  const p = payload(decl)
  const name = ctx.ident(decl.name)
  const url = p.urlExpr !== undefined ? ctx.expr(p.urlExpr, 0) : ctx.stringLiteral(p.url as string)
  const page = ctx.typeText(p.pageType)
  return [
    'LaunchedEffect(Unit) {',
    `  ${name}.getNextParam = { ${ctx.ident(p.lastPageName)} -> pyreonPageParam(${ctx.ident(p.lastPageName)}.${ctx.ident(p.nextField)}) }`,
    `  ${name}.requestPage = { ${ctx.ident(p.pageParamName)} ->`,
    `    ${name}Scope.launch {`,
    '      try {',
    `        val body = withContext(Dispatchers.IO) { java.net.URL(${url}).readText() }`,
    `        ${name}.resolve(PyreonFetchJson.decodeFromString<${page}>(body), ${ctx.ident(p.pageParamName)})`,
    `      } catch (e: Throwable) { ${name}.reject(e) }`,
    '    }',
    '  }',
    `  ${name}.start()`,
    '}',
  ]
}

// ── declaration, field reads, types ─────────────────────────────────────────

/** The type each field read has — what lets `'x' + feed.hasNextPage()` convert and `feed.data()?.pages` resolve. */
function fieldType(d: ExtDecl, property: string): TypeIR | undefined {
  switch (property) {
    case 'data':
      return {
        kind: 'union',
        branches: [{ kind: 'typeRef', name: 'PyreonInfiniteData', args: [payload(d).pageType] }, { kind: 'undefined' }],
      }
    case 'isPending':
    case 'isFetching':
    case 'isFetchingNextPage':
    case 'hasNextPage':
      return BOOLEAN
    case 'error':
      return { kind: 'union', branches: [ERROR_OBJECT, { kind: 'undefined' }] }
    default:
      return undefined
  }
}

export const infiniteDecl: DeclEmitter = {
  legacyKind: 'infinite-query',
  swift: infiniteDeclSwift,
  kotlin: infiniteDeclKotlin,
  lifecycle: { stableHost: true, tailOrder: 25, swift: infiniteLifecycleSwift, kotlin: infiniteLifecycleKotlin },
  // `<Suspense>` shows its fallback while the FIRST page is pending, `<ErrorBoundary>` while the query failed.
  asyncState: {
    swift: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending`, error: `${ctx.ident(d.name)}.error != nil` }),
    kotlin: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending.value`, error: `${ctx.ident(d.name)}.error.value != null` }),
  },
  typing: { callRead: fieldType, member: fieldType },
}

function fieldOf(site: ReceiverSite): string | undefined {
  if (site.kind === 'call') {
    const callee = site.expr.callee
    if (site.expr.args.length !== 0 || callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
    return INFINITE_FIELDS.has(callee.property) ? callee.property : undefined
  }
  const read = site.expr
  if (read.object.kind !== 'identifier') return undefined
  return INFINITE_FIELDS.has(read.property) ? read.property : undefined
}

export const infiniteReceiver: ReceiverLowering = {
  swift: {
    // `feed.data()` / `feed.hasNextPage()` → a plain @Observable property read. `fetchNextPage` is a real method (the
    // generic call emit keeps its parens), so it is not a field here.
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
