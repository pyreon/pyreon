/**
 * Client emission: the HTTP client, the endpoint declarations, and the
 * per-operation query bindings.
 *
 * The two targets differ in FILE LAYOUT, not just in constructs, and that is
 * the whole trick. PMTC has no module graph — `transform()` takes one file's
 * source and returns one file's output, and its recognizers only ever see the
 * top level of the file in front of them. So a `createHttp` client in
 * `client.ts` and an `api.endpoint(...)` in `endpoints/users.ts` are, to the
 * native compiler, two unrelated files: the endpoint resolves against nothing
 * and the call stays web.
 *
 * A human would never accept one giant file per feature. Generated code has no
 * such objection — nobody reads it, and the compiler that does read it wants
 * exactly that shape. So `web` gets the idiomatic split and `multiplatform`
 * gets one self-contained module per tag, with the client, the schemas, the
 * endpoints and the calls all in a single top level.
 */

import { reachableModels, topoSortModels } from '../core/graph'
import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import {
  CLIENT_PACKAGE,
  runtimeEndpoint,
  runtimeError,
  runtimePreamble,
  runtimeTransport,
  runtimeValidate,
  type ClientName,
} from './client-runtime'
import { schemaExpr, schemaSpecifier, tsType } from './schema'
import { q, relativeSpecifier, SourceFile } from './writer'

export interface ClientOptions {
  native: boolean
  /** Overrides the spec's `servers[0].url`. */
  baseUrl?: string | undefined
  /** Which HTTP runtime the client is built on. Defaults to `pyreon`. */
  client?: ClientName | undefined
}

export const CLIENT_FILE = 'client.ts'

/**
 * `client.ts` — the shared client instance. Web layout only.
 *
 * Dispatches on the configured runtime. Every branch produces the SAME
 * `api.endpoint(spec, config)` seam, which is why no other emitter in this
 * package knows the setting exists.
 */
export function emitClient(doc: IrDocument, opts: ClientOptions): SourceFile {
  const client = opts.client ?? 'pyreon'
  if (client !== 'pyreon') return emitAdapterClient(doc, opts, client)
  const f = new SourceFile(CLIENT_FILE)
  f.import('@pyreon/http', 'createHttp')
  f.importType('@pyreon/http', 'HttpMiddleware')
  f.import('@pyreon/http/schema', 'standardSchema')
  f.line()
  f.doc(
    `HTTP client for ${doc.title} ${doc.version}.`,
    '',
    'The baseUrl is emitted as a STRING LITERAL on purpose. PMTC reads it at',
    'compile time to build the native request URL, and a computed value (an',
    'env read, a concatenation) makes every endpoint on this client web-only.',
    '',
    '`schema` is REQUIRED here, not optional polish: @pyreon/http keeps schema',
    'support opt-in so the core costs nothing when unused, and an endpoint',
    'declared with `{ response }` against a client that has not enabled it',
    'FAILS AT RUNTIME — the request succeeds, the validation step rejects, and',
    'the query settles as an error with a 200 on the wire.',
  )
  f.line('let devTransport: HttpMiddleware | null = null')
  f.line()
  f.doc(
    'Install middleware AFTER the client was built.',
    '',
    'Endpoints bind to the client at declaration time, so middleware passed to',
    '`createHttp` has to be known before any endpoint exists -- which a mock',
    'installed by a workbench wrapper or a test never is. One passthrough entry',
    'reserves the slot; it costs a function call per request and nothing else',
    'when unused. The generated `installMocks()` uses it.',
  )
  f.line('export function setDevTransport(middleware: HttpMiddleware | null): void {')
  f.line('  devTransport = middleware')
  f.line('}')
  f.line()
  f.line(`export const api = createHttp({`)
  f.line(`  baseUrl: ${q(baseUrlOf(doc, opts))},`)
  f.line(`  schema: standardSchema,`)
  f.line(`  use: [(req, next) => (devTransport ? devTransport(req, next) : next(req))],`)
  f.line(`})`)
  return f
}

function baseUrlOf(doc: IrDocument, opts: ClientOptions): string {
  return opts.baseUrl ?? doc.baseUrl
}

/**
 * `client.ts` for a non-`@pyreon/http` runtime.
 *
 * The generated file is self-contained apart from the transport library
 * itself: a project that chose axios did so to not depend on `@pyreon/http`,
 * and importing its URL builder would put the dependency straight back.
 *
 * What keeps that duplication honest is `adapter-url-parity.test.ts`, which
 * runs this emitted `buildUrl` against `@pyreon/http`'s own as the oracle.
 */
function emitAdapterClient(
  doc: IrDocument,
  opts: ClientOptions,
  client: ClientName,
): SourceFile {
  const f = new SourceFile(CLIENT_FILE)
  const pkg = CLIENT_PACKAGE[client]
  if (client === 'axios') {
    f.importDefault('axios', 'axios')
    f.importType('axios', 'AxiosInstance')
  } else if (client === 'ky') {
    f.importDefault('ky', 'ky')
    f.importType('ky', 'KyInstance')
  }
  f.line()
  f.doc(
    `HTTP client for ${doc.title} ${doc.version}, built on ${pkg ?? 'the platform fetch'}.`,
    '',
    'The URL is resolved HERE and handed to the transport fully-formed, so the',
    'instance below carries no `baseURL` / `prefixUrl`. That is deliberate:',
    'axios and ky each resolve a base differently from the other and from',
    '`@pyreon/http`, and letting them do it would make the same spec issue a',
    'different request depending on which client was configured.',
    '',
    'The instance is exported so interceptors, hooks, auth headers and retries',
    'are added the way that library documents — nothing here wraps them.',
  )
  if (client === 'axios') {
    f.line('export const instance: AxiosInstance = axios.create()')
  } else if (client === 'ky') {
    f.line('export const instance: KyInstance = ky.create({})')
  }
  if (client !== 'fetch') f.line()
  f.lines(...runtimeError())
  f.line()
  f.lines(...runtimePreamble())
  f.line()
  f.lines(...runtimeValidate())
  f.line()
  f.lines(...runtimeTransport())
  f.line()
  f.lines(...runtimeEndpoint(client, baseUrlOf(doc, opts)))
  return f
}

/** The `'GET /users/:id'` literal an endpoint is declared with. */
export function endpointSpec(op: IrOperation): string {
  return `${op.method} ${op.path}`
}

/**
 * Group operations by tag, in a stable order.
 *
 * Sorted so regeneration is byte-identical; `default` (untagged) sorts with
 * everything else rather than being special-cased to the front.
 */
export function byTag(doc: IrDocument): Map<string, IrOperation[]> {
  const out = new Map<string, IrOperation[]>()
  for (const op of [...doc.operations].sort((a, b) => a.id.localeCompare(b.id))) {
    const list = out.get(op.tag)
    if (list) list.push(op)
    else out.set(op.tag, [op])
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** The argument type for one operation's call site. */
function argsType(op: IrOperation): string | undefined {
  const parts: string[] = []
  // `propKey` quotes anything that is not a plain identifier. Without it a
  // spec parameter name carrying a `}` closes the type and injects an
  // arbitrary parameter into the generated function signature.
  if (op.pathParams.length > 0) {
    const inner = op.pathParams.map((p) => `${propKey(p.name)}: ${tsType(p.type)}`).join('; ')
    parts.push(`params: { ${inner} }`)
  }
  if (op.queryParams.length > 0) {
    const inner = op.queryParams
      .map((p) => `${propKey(p.name)}${p.required ? '' : '?'}: ${tsType(p.type)}`)
      .join('; ')
    parts.push(`query${op.queryParams.some((p) => p.required) ? '' : '?'}: { ${inner} }`)
  }
  if (op.body) parts.push(`json: ${tsType(op.body)}`)
  return parts.length > 0 ? `{ ${parts.join('; ')} }` : undefined
}

/** Does this operation mutate? Decides query vs mutation binding. */
export function isMutation(op: IrOperation): boolean {
  return op.method !== 'GET' && op.method !== 'HEAD' && op.method !== 'OPTIONS'
}

/**
 * WEB layout: `endpoints.ts` + `queries.ts`, importing the shared client.
 *
 * Idiomatic and tree-shakeable. Deliberately NOT what the native layout does.
 */
export function emitWebEndpoints(doc: IrDocument): SourceFile[] {
  const files: SourceFile[] = []
  for (const [tag, ops] of byTag(doc)) {
    const path = `endpoints/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    f.import(relativeSpecifier(path, CLIENT_FILE), 'api')
    // The response clause can name several models (an array of refs, a union),
    // so collect them structurally rather than taking a top-level name.
    const schemaImports = new Set<string>()
    for (const op of ops) collectRefs(op.response, schemaImports)
    if (schemaImports.size > 0) f.import(schemaSpecifier(path), ...schemaImports)

    // Built once per operation. The previous form called `responseCfg` a second
    // time just to test the string for `s.`, which rebuilt every response
    // schema expression in the tag for a substring check.
    const clauses = ops.map((op) => responseCfg(op, false))
    // A composite clause (`s.array(Book)`, a union) needs `s` itself.
    if (clauses.some((c) => c.includes('s.'))) f.import('@pyreon/validate', 's')

    for (const [i, op] of ops.entries()) {
      f.line()
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      f.line(`export const ${op.id} = api.endpoint(${q(endpointSpec(op))}${clauses[i] ?? ''})`)
    }
    files.push(f)
  }
  return files
}

/**
 * The `{ response: … }` clause for an endpoint declaration.
 *
 * Emitted for EVERY response Lathe can describe, not only a bare `$ref`.
 * `Endpoint<S, TResponse>` takes its response type from this schema — omit it
 * and `TResponse` is `unknown`, so `endpoint.query()` yields
 * `QueryOptionsLike<unknown>` and every generated hook fails to typecheck in
 * the consumer's repo. It also buys real runtime validation for free.
 */
function responseCfg(op: IrOperation, native: boolean): string {
  if (!op.response) return ''
  if (op.response.kind === 'unknown') return ''
  return `, { response: ${schemaExpr(op.response, { native })} }`
}

/** WEB layout: `queries.ts` — reactive hooks, one per operation. */
export function emitWebQueries(doc: IrDocument): SourceFile[] {
  const files: SourceFile[] = []
  for (const [tag, ops] of byTag(doc)) {
    const path = `queries/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    const epPath = `endpoints/${tagFile(tag)}.ts`
    f.import(relativeSpecifier(path, epPath), ...ops.map((o) => o.id))
    const usesQuery = ops.some((o) => !isMutation(o))
    const usesMutation = ops.some((o) => isMutation(o))
    if (usesQuery) f.import('@pyreon/query', 'useQuery')
    if (usesMutation) f.import('@pyreon/query', 'useMutation')

    // Import exactly what the emitted lines reference: response types for
    // queries, ARG types (which carry the body) for mutations. Collecting both
    // for every operation leaves an unused import, which is a lint error in a
    // consumer's repo and a confusing one, since nobody wrote the file.
    const typeImports = new Set<string>()
    for (const op of ops) {
      if (isMutation(op)) collectRefs(op.body, typeImports)
      else collectRefs(op.response, typeImports)
      // A PARAMETER's schema can be a `$ref` too - GitHub's spec does this
      // heavily (`AlertNumber`, `CodeScanningRef`). Collecting only the
      // response and body left those names used in the args type and never
      // imported, so the generated module did not compile.
      for (const p of op.pathParams) collectRefs(p.type, typeImports)
      for (const p of op.queryParams) collectRefs(p.type, typeImports)
    }
    if (typeImports.size > 0) f.importType(schemaSpecifier(path), ...typeImports)

    for (const op of ops) {
      const args = argsType(op)
      const hook = `use${typeIdent(op.id)}`
      const ret = op.response ? tsType(op.response) : 'void'
      f.line()
      if (isMutation(op)) {
        // The variables type is the endpoint's own call args, so a caller
        // that forgets `json` (or misspells a path param) is a compile error
        // rather than a request the server rejects at runtime.
        const vars = args ?? 'Record<string, never>'
        f.doc(
          op.summary,
          `\`${endpointSpec(op)}\``,
          '',
          'Mutation options are a plain object — imperative, nothing to track.',
        )
        f.line(`export function ${hook}() {`)
        f.line(`  return useMutation({ mutationFn: (vars: ${vars}) => ${op.id}(vars) })`)
        f.line('}')
        continue
      }
      f.doc(
        op.summary,
        `\`${endpointSpec(op)}\``,
        '',
        // The accessor argument is the whole reason this is a function and not
        // an object: `@pyreon/query` re-reads it, so a signal in `args` makes
        // the query key move and the request refetch.
        args ? 'Takes an ACCESSOR so signal reads in the arguments stay reactive.' : undefined,
        // The single most common way to get a detail query wrong is to fire it
        // before its id exists. Returning `undefined` is how you say "not yet";
        // deriving `enabled` from that means the condition is written ONCE
        // instead of duplicated between a placeholder argument and an
        // `enabled` option that has to agree with it.
        args
          ? 'Return `undefined` from `args` while the arguments are not ready — the query is DISABLED rather than fired with a placeholder.'
          : undefined,
        'Second accessor merges extra query options (`enabled`, `staleTime`, `select`).',
        '',
        // Worth stating on every generated hook: the result fields are signals,
        // and reading one WITHOUT calling it yields the signal function, which
        // is truthy. `data ?? []` then skips the fallback and `.length` reads
        // the function's arity — a silent zero rather than an error.
        'Result fields are SIGNALS: `q.data()`, `q.isPending()` — call them.',
      )
      const extra = 'options?: () => Record<string, unknown>'
      if (args) {
        // `| undefined` WIDENS the accepted type, so every existing call site
        // still compiles; what changes is that returning it now means
        // "disabled" rather than a crash on a missing path parameter.
        f.line(`export function ${hook}(args: () => ${args} | undefined, ${extra}) {`)
        f.line(`  return useQuery<${ret}>(() => {`)
        f.line('    const a = args()')
        f.line('    const extra = options?.() ?? {}')
        // The disabled branch keys on the endpoint's own PREFIX — the same key
        // `keys` exposes, and exactly what `.query()` would produce for absent
        // arguments — so an invalidation of the endpoint still matches it.
        //
        // `enabled` sits AFTER the spread deliberately: a caller's
        // `enabled: true` must not be able to fire a request whose path
        // parameter is missing. `enabled: false` still disables, via the
        // branch below.
        f.line('    if (a === undefined) {')
        f.line(
          `      return { queryKey: ${op.id}.key.prefix, queryFn: ${DISABLED_FN}, ...extra, enabled: false }`,
        )
        f.line('    }')
        f.line(`    return { ...${op.id}.query(a), ...extra, enabled: extra.enabled !== false }`)
        f.line('  })')
      } else {
        f.line(`export function ${hook}(${extra}) {`)
        f.line(`  return useQuery<${ret}>(() => ({ ...${op.id}.query(), ...options?.() }))`)
      }
      f.line('}')
    }
    files.push(f)
  }
  return files
}

/**
 * NATIVE layout: one self-contained module per tag.
 *
 * Client, schemas, endpoints and calls share a top level, because PMTC's
 * recognizers cannot see across files. The schemas are duplicated into each
 * tag module rather than imported for the same reason — an imported `const
 * User = s.object(...)` is invisible to the native compiler, so a shared
 * `schemas.ts` would silently un-lower every response type.
 */
export function emitNativeModules(doc: IrDocument, opts: ClientOptions): SourceFile[] {
  const files: SourceFile[] = []
  // One expression per model, computed once. This used to render the WHOLE
  // schema file and string-search it for each model in each tag — quadratic in
  // (tags x models), and brittle besides: an emit-format change would have
  // silently broken the extraction. `schemaExpr` is the same single
  // implementation `emitSchemas` walks, so nothing is duplicated by calling it.
  const { order: modelOrder, backEdges } = topoSortModels(doc)
  const nativeSchema = new Map<string, string>()
  for (const model of doc.models) {
    // The SAME deferral the web schemas get. A native module is ordinary app
    // source too, so a cyclic `$ref` emitted as a direct forward reference is a
    // TDZ ReferenceError there exactly as it is on the web. `s.lazy` does not
    // lower, so this costs the model its native path -- which the verifier
    // reports. Correct-and-web-only beats lowering-and-broken.
    const defer = new Set(
      [...backEdges]
        .filter((e) => e.startsWith(`${model.name}|`))
        .map((e) => e.slice(model.name.length + 1)),
    )
    nativeSchema.set(model.name, schemaExpr(model.type, { native: true, defer }))
  }

  for (const [tag, ops] of byTag(doc)) {
    const path = `${tagFile(tag)}.native.tsx`
    const f = new SourceFile(path)
    f.import('@pyreon/http', 'createHttp')
    f.import('@pyreon/http/schema', 'standardSchema')
    f.import('@pyreon/validate', 's')
    if (ops.some((o) => !isMutation(o))) f.import('@pyreon/query', 'useQuery')

    f.line()
    f.doc(
      `${doc.title} — \`${tag}\`, self-contained for the native compiler.`,
      '',
      'Everything PMTC must recognise lives at THIS file\'s top level: the',
      'client, the schemas and the endpoint declarations. Splitting any of it',
      'into a shared module would compile fine and silently stop lowering,',
      'because PMTC resolves nothing across file boundaries.',
    )
    f.line(`const api = createHttp({ baseUrl: ${q(baseUrlOf(doc, opts))}, schema: standardSchema })`)

    // Schemas, inlined. The TRANSITIVE closure, not just the models an
    // operation names: a native module imports nothing, so inlining `Order`
    // while leaving out the `Customer` it references emits a module that does
    // not even typecheck. In DEPENDENCY ORDER for the same reason the web
    // schemas are — `const` is not hoisted.
    const direct = new Set<string>()
    for (const op of ops) {
      collectRefs(op.response, direct)
      collectRefs(op.body, direct)
    }
    const needed = reachableModels(doc, direct)
    const byName = new Map(doc.models.map((m) => [m.name, m]))
    for (const name of modelOrder) {
      const model = byName.get(name)
      if (!model || !needed.has(name)) continue
      f.line()
      f.doc(model.doc)
      f.line(`export const ${model.name} = ${nativeSchema.get(model.name) ?? 's.object({})'}`)
      // A STRUCTURAL type, not `Infer<typeof X>`. `Infer` would be an
      // `import type` — erased by TypeScript, but PMTC's warn pass reads the
      // import statement itself and reports the module as un-lowerable. The
      // rendered type is identical; only the derivation differs.
      f.line(`export type ${model.name} = ${tsType(model.type, 0, true)}`)
    }

    for (const op of ops) {
      f.line()
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      f.line(`export const ${op.id} = api.endpoint(${q(endpointSpec(op))}${responseCfg(op, true)})`)
    }

    // Data components. A component body is the ONLY place `useQuery` lowers —
    // a standalone hook function is read as a View and emitted verbatim, which
    // produces Swift that does not compile, with no warning at all.
    for (const op of ops) {
      if (isMutation(op)) continue
      const ret = op.response ? tsType(op.response) : 'unknown'
      const name = `${typeIdent(op.id)}Data`
      // A path param becomes a PROP, and the `params` object is built from
      // those props. PMTC lowers this to native string interpolation and keys
      // the query harness on the resulting URL, so passing a different id
      // re-fetches — the same thing the web does.
      //
      // Every path param is REQUIRED by construction (a URL cannot omit a
      // segment), so they are non-optional props regardless of what the spec
      // marked them.
      const params = op.pathParams
      // A path param's name is `ident()`-normalized at CONVERSION (see
      // `input/openapi.ts`), so it is a valid identifier here by construction
      // — which is what lets it be a bare `props.x` member access rather than
      // the quoted-key form the other emitters need. If that normalization
      // ever moves, this breaks loudly at typecheck rather than silently.
      const propsType = [
        ...params.map((p) => `${p.name}: ${tsType(p.type)}`),
        `children: (data: ${ret} | undefined) => unknown`,
      ].join('; ')
      // `props.x`, never a destructure: destructuring reads the getter once
      // and freezes the value, which is the single most common way to lose
      // reactivity in Pyreon — and here it would also stop the query
      // re-fetching when the parent passes a new id.
      const args = params.length
        ? `({ params: { ${params.map((p) => `${p.name}: props.${p.name}`).join(', ')} } })`
        : '()'
      f.line()
      f.doc(
        `Fetches \`${endpointSpec(op)}\` and renders it through \`children\`.`,
        ...(params.length
          ? [
              '',
              `Takes ${params.map((p) => `\`${p.name}\``).join(', ')} as ${params.length === 1 ? 'a prop' : 'props'} and re-fetches when ${params.length === 1 ? 'it changes' : 'they change'}.`,
            ]
          : []),
        '',
        'The `useQuery` call sits directly in the component body, in the same',
        'file as its client and endpoint — the one arrangement PMTC lowers to',
        'PyreonQuery. Moving it into a hook silently breaks the native build.',
      )
      f.line(`export function ${name}(props: { ${propsType} }) {`)
      f.line(`  const q = useQuery<${ret}>(() => ${op.id}.query${args})`)
      // `q.data` is a SIGNAL; passing it uncalled hands the child a function.
      f.line('  return props.children(q.data())')
      f.line('}')
    }
    files.push(f)
  }
  return files
}

/**
 * The `queryFn` of a DISABLED query.
 *
 * Never invoked — `enabled: false` is set after the caller's options precisely
 * so it cannot be overridden — but the option type requires one, and a thunk
 * that rejects with a real sentence beats `undefined!` if some future code
 * path ever reaches it.
 */
const DISABLED_FN =
  "() => Promise.reject(new Error('[Pyreon] lathe: query is disabled — its arguments are not ready'))"

function collectRefs(type: IrType | undefined, into: Set<string>): void {
  if (!type) return
  switch (type.kind) {
    case 'ref':
      into.add(type.name)
      return
    case 'array':
      collectRefs(type.items, into)
      return
    case 'union':
      for (const o of type.options) collectRefs(o, into)
      return
    case 'object':
      for (const f of type.fields) collectRefs(f.type, into)
      if (type.additional) collectRefs(type.additional, into)
      return
    default:
  }
}

/** Filename-safe tag. */
export function tagFile(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'
}
