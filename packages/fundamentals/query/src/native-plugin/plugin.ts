import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerPlugin,
  type DeclEmitter,
  type ElementLowering,
  type ExtDecl,
  type ReceiverLowering,
  type ReceiverSite,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { queryDeclKotlin, queryLifecycleKotlin, streamDeclKotlin, streamLifecycleKotlin } from './kotlin'
import { QUERY_CLIENT_TYPE, QUERY_PLUGIN_NAME, QUERY_TYPE, STREAM_TYPE } from './names'
import { recognizeQuery, recognizeQueryClient, recognizeStream, scanQuery } from './recognize'
import { queryStubs } from './stubs'
import { queryDeclSwift, queryLifecycleSwift, streamDeclSwift, streamLifecycleSwift } from './swift'
import type { QueryPayload, StreamPayload } from './types'

export { QUERY_PLUGIN_NAME }

/** A native `Error` — what the containers' `error` field holds on both runtimes. */
const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

/** The fields a query container exposes as plain reads (the web reads them as signals). */
const QUERY_FIELDS: ReadonlySet<string> = new Set(['data', 'isPending', 'isFetching', 'error'])
const STREAM_FIELDS: ReadonlySet<string> = new Set(['events', 'latest', 'status', 'error'])

/**
 * The property of an exact `<binding>.<prop>()` call or `<binding>.<prop>` read on the receiver
 * (the web's signal-read shape), or `undefined` for anything longer or not a plain field.
 */
function fieldOf(site: ReceiverSite, fields: ReadonlySet<string>): string | undefined {
  if (site.kind === 'call') {
    const callee = site.expr.callee
    if (site.expr.args.length !== 0 || callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
    return fields.has(callee.property) ? callee.property : undefined
  }
  const read = site.expr
  if (read.object.kind !== 'identifier') return undefined
  return fields.has(read.property) ? read.property : undefined
}

const queryDecl: DeclEmitter = {
  // The declaration was a closed `query` compiler kind before it moved here; the struct names the
  // compiler derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: 'query',
  swift: queryDeclSwift,
  kotlin: queryDeclKotlin,
  lifecycle: {
    // A `.task` on a transparent conditional would restart forever (see `DeclLifecycle.stableHost`).
    stableHost: true,
    // After the compiler's own modifiers, in the order the fetch → query → stream harnesses always had.
    tailOrder: 20,
    swift: queryLifecycleSwift,
    kotlin: queryLifecycleKotlin,
  },
  // `<Suspense>` shows its fallback while ANY source is pending, `<ErrorBoundary>` while ANY failed.
  asyncState: {
    swift: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending`, error: `${ctx.ident(d.name)}.error != nil` }),
    kotlin: (d, ctx) => ({ pending: `${ctx.ident(d.name)}.isPending.value`, error: `${ctx.ident(d.name)}.error.value != null` }),
  },
}

const streamDecl: DeclEmitter = {
  legacyKind: 'stream',
  swift: streamDeclSwift,
  kotlin: streamDeclKotlin,
  lifecycle: { stableHost: true, tailOrder: 30, swift: streamLifecycleSwift, kotlin: streamLifecycleKotlin },
  typing: {
    // `s.events()` is an array of the item, `s.latest()` an optional one, `s.status()` a string;
    // `latest` and `error` are optional on every layer.
    callRead(decl: ExtDecl, property: string): TypeIR | undefined {
      const item = (decl.payload as unknown as StreamPayload).itemType
      switch (property) {
        case 'events':
          return { kind: 'array', element: item }
        case 'latest':
          return { kind: 'union', branches: [item, { kind: 'undefined' }] }
        case 'status':
          return { kind: 'string' }
        case 'error':
          return { kind: 'union', branches: [ERROR_OBJECT, { kind: 'undefined' }] }
        default:
          return undefined
      }
    },
  },
}

/** The query client has no native counterpart: `useQuery` is self-contained, so emitting nothing is the whole lowering. */
const queryClientDecl: DeclEmitter = { legacyKind: 'query-client', swift: () => '', kotlin: () => '' }

const queryReceiver: ReceiverLowering = {
  swift: {
    // `q.data()` / `q.isPending()` → a plain @Observable property read. `refetch` is a real method
    // (parens preserved by the generic call emit), so it is not a field here.
    expr(site, ctx) {
      if (site.kind !== 'call') return undefined
      const field = fieldOf(site, QUERY_FIELDS)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}`
    },
  },
  kotlin: {
    // Compose `MutableState` fields: both the call form and the property form read `.value`.
    expr(site, ctx) {
      const field = fieldOf(site, QUERY_FIELDS)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${field}.value`
    },
  },
}

const streamReceiver: ReceiverLowering = {
  swift: {
    expr(site, ctx) {
      if (site.kind !== 'call') return undefined
      const field = fieldOf(site, STREAM_FIELDS)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${field}`
    },
  },
  kotlin: {
    expr(site, ctx) {
      const field = fieldOf(site, STREAM_FIELDS)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}.value`
    },
  },
}

/** `<QueryClientProvider client={…}>` is TRANSPARENT on native: the web needs it to inject the client `useQuery` reads, the native `useQuery` is self-contained, so its children are the whole emit. */
const queryElements: readonly ElementLowering[] = [
  {
    module: '@pyreon/query',
    tags: ['QueryClientProvider'],
    emit: {
      swift(el, ctx) {
        if (el.children.length === 0) return 'EmptyView()'
        const pad = ctx.pad(ctx.indent + 2)
        const content = el.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
        return `Group {\n${content}\n${ctx.pad(ctx.indent)}}`
      },
      kotlin(el, ctx) {
        if (el.children.length === 0) return ''
        const pad = ctx.pad(ctx.indent + 2)
        const content = el.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
        return `Column {\n${content}\n${ctx.pad(ctx.indent)}}`
      },
    },
  },
]

/**
 * The `@pyreon/query` native plugin: `useQuery` (a keyed cache with stale-while-revalidate),
 * `useStream` (SSE / NDJSON over the native stream runtime), the client binding and its provider.
 * Shipped by `@pyreon/query` itself and discovered from its manifest (`pyreon.native.plugin`) when a
 * source file imports the package. Requests that name an `@pyreon/http` endpoint are resolved by that
 * plugin (`requires`), through `ParseContext.requests`.
 */
export const queryPlugin: CompilerPlugin = {
  name: QUERY_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/query'],
  scanModule: scanQuery,
  calls: {
    useQuery: recognizeQuery,
    useStream: recognizeStream,
    QueryClient: recognizeQueryClient,
  },
  destructureCalls: ['useQuery'],
  decls: {
    [QUERY_TYPE]: queryDecl,
    [STREAM_TYPE]: streamDecl,
    [QUERY_CLIENT_TYPE]: queryClientDecl,
  },
  receivers: { [QUERY_TYPE]: queryReceiver, [STREAM_TYPE]: streamReceiver },
  elements: queryElements,
  stubs: queryStubs,
}

export type { QueryPayload }
