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

import { deferredTargets, reachableModels, topoSortModels } from '../core/graph'
import { collectRefNames } from '../core/walk'
import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { assignNames, ident, propKey, tagFile, typeIdent } from '../core/naming'
import { byCodeUnit } from '../core/order'
import {
  CLIENT_PACKAGE,
  runtimeEndpoint,
  runtimeError,
  runtimePreamble,
  runtimeTransport,
  runtimeValidate,
  type ClientName,
  type ResponseValidation,
} from './client-runtime'
import { bodyRefType, hasInput, inputType, type ModelTypes, responseTypeOf } from './operation-types'
import { emitInfinite } from './pagination'
import { PURE, schemaExpr, schemaRefs, schemaSpecifierFor, tsType } from './schema'
import { emitStreamFunctions, emitStreamHook, hasStreams, isStreamOnly, streamEventHelper, streamName } from './stream'
import { dialectOf, type ValidatorName } from './validator'
import { q, relativeSpecifier, SourceFile } from './writer'

export interface ClientOptions {
  native: boolean
  /** Overrides the spec's `servers[0].url`. */
  baseUrl?: string | undefined
  /** Which HTTP runtime the client is built on. Defaults to `pyreon`. */
  client?: ClientName | undefined
  /** Which library the schemas are written in. Defaults to `pyreon`. */
  validator?: ValidatorName | undefined
  /**
   * Namespace for every endpoint's cache key (audit E1). Two generated clients
   * sharing one `QueryClient` otherwise share `GET /users`.
   */
  keyScope?: string | undefined
  /** The client's DEFAULT response validation. Defaults to `strict`. */
  responseValidation?: ResponseValidation | undefined
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
  f.import('@pyreon/http', 'compose', 'createHttp')
  f.importType('@pyreon/http', 'HttpMiddleware', 'ValidateMode', ...(hasStreams(doc) ? ['ResponseOf'] : []))
  f.import('@pyreon/http/schema', 'standardSchema')
  f.line()
  f.doc(
    'Runtime configuration of the generated client — see {@link configureApi}.',
    '',
    'Each field is its own SLOT, so setting one never disturbs another: auth',
    'middleware in `use` survives `installMocks()`, which answers through a',
    'separate transport slot, and a `baseUrl` switch keeps the headers.',
  )
  f.line('export interface ApiConfig {')
  f.line("  /** Replaces the spec's server URL for every request (an environment switch). */")
  f.line('  baseUrl?: string | undefined')
  f.line('  /** Headers for every request. An accessor is re-read per request — use one for a token. */')
  f.line('  headers?: HeadersInit | (() => HeadersInit) | undefined')
  f.line('  /** Middleware around every request, outermost first — auth, logging, retry. */')
  f.line('  use?: readonly HttpMiddleware[] | undefined')
  f.line("  /** Response validation: `'strict'` throws, `'warn'` logs and passes the body through, `'off'` skips it. */")
  f.line('  validate?: ValidateMode | undefined')
  f.line('}')
  f.line()
  f.line(`const DEFAULT_BASE_URL = ${q(baseUrlOf(doc, opts))}`)
  f.line(`const DEFAULT_VALIDATE: ValidateMode = ${q(opts.responseValidation ?? 'strict')}`)
  f.line()
  f.line('const settings: {')
  f.line('  baseUrl: string')
  f.line("  headers: ApiConfig['headers']")
  f.line('  use: readonly HttpMiddleware[]')
  f.line('  validate: ValidateMode')
  f.line('} = { baseUrl: DEFAULT_BASE_URL, headers: undefined, use: [], validate: DEFAULT_VALIDATE }')
  f.line()
  f.line('let devTransport: HttpMiddleware | null = null')
  f.line()
  f.doc(
    'Configure the client at runtime — base URL, headers, middleware, validation.',
    '',
    'Endpoints bind to the client when they are declared, so everything that',
    'varies (an environment, a session token, a logger) is read from here on',
    'every request rather than baked in. A key present with `undefined` resets',
    'that slot to its generated default; an absent key leaves it alone.',
    '',
    '```ts',
    'configureApi({',
    '  baseUrl: import.meta.env.VITE_API_URL,',
    '  headers: () => ({ \'x-request-id\': crypto.randomUUID() }),',
    '  use: [logger],',
    "  validate: import.meta.env.PROD ? 'warn' : 'strict',",
    '})',
    '```',
  )
  f.line('export function configureApi(config: ApiConfig): void {')
  f.line("  if ('baseUrl' in config) settings.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL")
  f.line("  if ('headers' in config) settings.headers = config.headers")
  f.line("  if ('use' in config) settings.use = config.use ?? []")
  f.line("  if ('validate' in config) settings.validate = config.validate ?? DEFAULT_VALIDATE")
  f.line('}')
  f.line()
  f.doc(
    'Answer requests from a transport slot of their own — the generated',
    '`installMocks()` uses it. Separate from `configureApi({ use })` on purpose:',
    'installing mocks must not remove auth middleware, and configuring auth must',
    'not uninstall mocks. Pass `null` to go back to the network.',
  )
  f.line('export function setDevTransport(middleware: HttpMiddleware | null): void {')
  f.line('  devTransport = middleware')
  f.line('}')
  f.line()
  f.doc('The base URL requests currently go to — the generated default, or what `configureApi` set.')
  f.line('export function apiBaseUrl(): string {')
  f.line('  return settings.baseUrl')
  f.line('}')
  emitAuthHelpers(f, doc, 'pyreon')
  f.line()
  f.doc(
    `HTTP client for ${doc.title} ${doc.version}.`,
    '',
    '`schema` is REQUIRED here, not optional polish: @pyreon/http keeps schema',
    'support opt-in so the core costs nothing when unused, and an endpoint',
    'declared with `{ response }` against a client that has not enabled it',
    'FAILS AT RUNTIME — the request succeeds, the validation step rejects, and',
    'the query settles as an error with a 200 on the wire.',
    '',
    'The native modules (`*.native.tsx`) declare their own client with a',
    'LITERAL base URL, which is what PMTC reads; this one reads its settings',
    'per request.',
  )
  f.line('export const api = createHttp({')
  f.line('  baseUrl: () => settings.baseUrl,')
  if (opts.keyScope) f.line(`  keyScope: ${q(opts.keyScope)},`)
  f.line('  schema: standardSchema,')
  f.line('  validate: () => settings.validate,')
  f.line('  headers: () => {')
  f.line('    const h = settings.headers')
  f.line("    return typeof h === 'function' ? h() : (h ?? {})")
  f.line('  },')
  f.line('  use: [')
  f.line('    (req, next) => (settings.use.length === 0 ? next(req) : compose(settings.use, next)(req)),')
  f.line('    (req, next) => (devTransport ? devTransport(req, next) : next(req)),')
  f.line('  ],')
  f.line('})')
  if (hasStreams(doc)) {
    f.line()
    f.lines(...streamEventHelper('pyreon'))
  }
  return f
}

/**
 * `auth` — one helper per `components.securitySchemes` entry (dx D8), for
 * EVERY client.
 *
 * Each scheme reduces to a DECORATION — a header, a cookie or a query
 * parameter — computed per request from a credential that may be an accessor.
 * How a decoration is applied is the only per-client part, and it is written
 * in that library's own idiom: `@pyreon/http` middleware, a fetch middleware,
 * an axios request interceptor, a ky `beforeRequest` hook. So
 * `configureApi({ use: [auth.token(() => t())] })` reads the same and sends
 * the same request whichever client was generated.
 */
function emitAuthHelpers(f: SourceFile, doc: IrDocument, client: ClientName): void {
  const schemes = doc.securitySchemes ?? []
  if (schemes.length === 0) return
  f.line()
  f.doc('A credential, or an accessor re-read on every request. Nullish sends nothing.')
  f.line('export type Credential = string | null | undefined | (() => string | null | undefined)')
  f.line()
  f.line("const read = (c: Credential): string | null | undefined => (typeof c === 'function' ? c() : c)")
  f.line()
  f.doc('What one scheme adds to a request. `null` adds nothing.')
  f.line('type Decoration = { header: [string, string] } | { cookie: [string, string] } | { query: [string, string] } | null')
  f.line()
  f.line('function withQuery(url: string, [k, v]: [string, string]): string {')
  f.line("  return `${url}${url.includes('?') ? '&' : '?'}${encodeURIComponent(k)}=${encodeURIComponent(v)}`")
  f.line('}')
  f.line()
  f.line('function withCookie(prev: string | null | undefined, [k, v]: [string, string]): string {')
  f.line('  const pair = `${encodeURIComponent(k)}=${encodeURIComponent(v)}`')
  f.line('  return prev ? `${prev}; ${pair}` : pair')
  f.line('}')
  f.line()
  for (const l of decoratingFn(client)) f.line(l)
  const keys = assignNames(schemes.map((sc) => sc.name), ident)
  f.line()
  f.doc(
    'Auth for each security scheme the spec declares — pass to `configureApi({ use })`.',
    '',
    '```ts',
    `configureApi({ use: [auth.${keys[0] ?? 'x'}(${schemes[0]?.kind === 'basic' ? "'user', () => password()" : '() => session.token()'})] })`,
    '```',
  )
  f.line('export const auth = {')
  for (const [i, sc] of schemes.entries()) {
    const key = propKey(keys[i] as string)
    if (sc.kind === 'bearer') {
      f.doc(sc.doc, `\`${sc.name}\` — sends \`Authorization: Bearer <token>\`.`)
      f.line(`  ${key}: (token: Credential) =>`)
      f.line('    decorating(() => {')
      f.line('      const t = read(token)')
      f.line("      return t ? { header: ['authorization', `Bearer ${t}`] } : null")
      f.line('    }),')
    } else if (sc.kind === 'basic') {
      f.doc(sc.doc, `\`${sc.name}\` — sends \`Authorization: Basic <base64(username:password)>\`.`)
      f.line(`  ${key}: (username: Credential, password: Credential) =>`)
      f.line('    decorating(() => {')
      f.line('      const u = read(username)')
      f.line('      if (u === null || u === undefined) return null')
      f.line('      // UTF-8 first: `btoa` alone throws on any non-Latin-1 character.')
      f.line("      const bytes = new TextEncoder().encode(`${u}:${read(password) ?? ''}`)")
      f.line("      return { header: ['authorization', `Basic ${btoa(String.fromCharCode(...bytes))}`] }")
      f.line('    }),')
    } else {
      const where =
        sc.in === 'header'
          ? `in the \`${sc.param}\` header`
          : sc.in === 'query'
            ? `as the \`${sc.param}\` query parameter`
            : `as the \`${sc.param}\` cookie (server-side — browsers forbid setting Cookie from script)`
      f.doc(sc.doc, `\`${sc.name}\` — sends the key ${where}.`)
      f.line(`  ${key}: (apiKey: Credential) =>`)
      f.line('    decorating(() => {')
      f.line('      const k = read(apiKey)')
      f.line(`      return k ? { ${sc.in}: [${q(sc.param)}, k] } : null`)
      f.line('    }),')
    }
  }
  f.line('}')
}

/** The per-client half: apply a decoration in the library's own idiom. */
function decoratingFn(client: ClientName): string[] {
  const head = '/** Apply a decoration the way this client extends a request. */'
  if (client === 'pyreon') {
    return [
      head,
      'function decorating(decorate: () => Decoration): HttpMiddleware {',
      '  return (req, next) => {',
      '    const d = decorate()',
      '    if (d === null) return next(req)',
      "    if ('header' in d) req.headers.set(...d.header)",
      "    else if ('cookie' in d) req.headers.set('cookie', withCookie(req.headers.get('cookie'), d.cookie))",
      '    else return next({ ...req, url: withQuery(req.url, d.query) })',
      '    return next(req)',
      '  }',
      '}',
    ]
  }
  if (client === 'fetch') {
    return [
      head,
      'function decorating(decorate: () => Decoration): Interceptor {',
      '  return (request, next) => {',
      '    const d = decorate()',
      '    if (d === null) return next(request)',
      "    const out = 'query' in d ? new Request(withQuery(request.url, d.query), request) : request",
      "    if ('header' in d) out.headers.set(...d.header)",
      "    else if ('cookie' in d) out.headers.set('cookie', withCookie(out.headers.get('cookie'), d.cookie))",
      '    return next(out)',
      '  }',
      '}',
    ]
  }
  if (client === 'axios') {
    return [
      head,
      'function decorating(decorate: () => Decoration): Interceptor {',
      '  return (config) => {',
      '    const d = decorate()',
      '    if (d === null) return config',
      "    if ('header' in d) config.headers.set(...d.header)",
      "    else if ('cookie' in d) config.headers.set('cookie', withCookie(config.headers.get('cookie') as string | null, d.cookie))",
      "    else config.url = withQuery(config.url ?? '', d.query)",
      '    return config',
      '  }',
      '}',
    ]
  }
  return [
    head,
    'function decorating(decorate: () => Decoration): Interceptor {',
    '  return ({ request }) => {',
    '    const d = decorate()',
    '    if (d === null) return',
    "    const out = 'query' in d ? new Request(withQuery(request.url, d.query), request) : request",
    "    if ('header' in d) out.headers.set(...d.header)",
    "    else if ('cookie' in d) out.headers.set('cookie', withCookie(out.headers.get('cookie'), d.cookie))",
    '    return out',
    '  }',
    '}',
  ]
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
    f.import('axios', 'AxiosError')
    f.importType('axios', 'AxiosInstance', 'AxiosResponse', 'InternalAxiosRequestConfig')
  } else if (client === 'ky') {
    f.importDefault('ky', 'ky')
    f.importType('ky', 'BeforeRequestHook', 'BeforeRequestState', 'KyInstance')
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
    f.line('export const instance: AxiosInstance = axios.create({ adapter: axiosTransport })')
  } else if (client === 'ky') {
    // One permanent hook that runs the `configureApi({ use })` slot, so the
    // slot can change at runtime without re-creating the instance.
    f.line('export const instance: KyInstance = ky.create({ fetch: kyTransport, hooks: { beforeRequest: [runInterceptors] } })')
  }
  if (client !== 'fetch') f.line()
  f.lines(...runtimeError())
  f.line()
  f.lines(...runtimePreamble())
  f.line()
  f.lines(...runtimeValidate())
  f.line()
  f.lines(...runtimeTransport(client))
  f.line()
  f.lines(...runtimeEndpoint(client, baseUrlOf(doc, opts), opts.keyScope, opts.responseValidation))
  emitAuthHelpers(f, doc, client)
  if (hasStreams(doc)) {
    f.line()
    f.lines(...streamEventHelper(client))
  }
  return f
}

/**
 * The `'GET /users/:id'` literal an endpoint is declared with.
 *
 * An operation with its OWN server carries it in the literal
 * (`'POST https://upload.box.com/api/2.0/files'`): every client here treats an
 * absolute path as overriding the base URL, so that one call goes to its own
 * host while the rest keep the shared client.
 */
export function endpointSpec(op: IrOperation): string {
  return `${op.method} ${op.baseUrl ?? ''}${op.path}`
}

/**
 * Group operations by tag, in a stable order.
 *
 * Sorted so regeneration is byte-identical; `default` (untagged) sorts with
 * everything else rather than being special-cased to the front.
 *
 * An UNTAGGED operation is grouped by its path instead (see
 * {@link pathGroup}). A spec with no tags at all -- Stripe's -- used to produce
 * one `endpoints/default.ts` of 612 endpoints, so importing one hook reached
 * an endpoint module of all of them. A path group whose file name matches a
 * real tag's joins that tag rather than colliding with it on disk.
 */
export function byTag(doc: IrDocument): Map<string, IrOperation[]> {
  const cached = groupMemo.get(doc)
  if (cached && cached.ops === doc.operations && cached.count === doc.operations.length) return cached.groups
  const untagged = doc.operations.filter((op) => op.tag === UNTAGGED)
  const common = commonStaticPrefix(untagged.map((op) => op.path))
  const byFile = new Map<string, string>()
  for (const op of doc.operations) if (op.tag !== UNTAGGED) byFile.set(tagFile(op.tag), op.tag)
  const keyOf = (op: IrOperation): string => {
    if (op.tag !== UNTAGGED) return op.tag
    const group = pathGroup(op.path, common)
    return byFile.get(tagFile(group)) ?? group
  }
  const out = new Map<string, IrOperation[]>()
  for (const op of [...doc.operations].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const key = keyOf(op)
    const list = out.get(key)
    if (list) list.push(op)
    else out.set(key, [op])
  }
  const groups = new Map([...out.entries()].sort(([a], [b]) => byCodeUnit(a, b)))
  groupMemo.set(doc, { ops: doc.operations, count: doc.operations.length, groups })
  return groups
}

/** The IR's tag for an operation the spec did not tag. */
const UNTAGGED = 'default'

const groupMemo = new WeakMap<IrDocument, { ops: IrDocument['operations']; count: number; groups: Map<string, IrOperation[]> }>()

/** Static path segments: no `{param}` / `:param`, nothing empty. */
function staticSegments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0 && !s.startsWith('{') && !s.startsWith(':'))
}

/**
 * The leading static segments EVERY untagged path shares -- `/v1` on Stripe,
 * `/api/v2` elsewhere. Stripped before grouping, or every operation would land
 * in one `v1` group, which is the problem being solved.
 */
function commonStaticPrefix(paths: readonly string[]): string[] {
  if (paths.length === 0) return []
  let prefix = staticSegments(paths[0] as string)
  for (const p of paths.slice(1)) {
    const segs = staticSegments(p)
    let i = 0
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++
    prefix = prefix.slice(0, i)
  }
  return prefix
}

/**
 * The group of an untagged operation: its first static path segment after the
 * shared prefix -- `/v1/customers/{id}/balance` -> `customers`. A path with no
 * static segment left (`/`, `/{id}`) stays `default`.
 *
 * The prefix is not stripped from a path that IS the prefix (a spec whose only
 * untagged path is `/v1/status`); that path is grouped by its own last segment
 * rather than falling back to `default` for no reason.
 */
export function pathGroup(path: string, common: readonly string[]): string {
  const segs = staticSegments(path)
  const rest = segs.slice(common.length)
  return rest[0] ?? segs[segs.length - 1] ?? UNTAGGED
}

export { bodyArg } from './operation-types'

/**
 * Does this operation get a native DATA COMPONENT?
 *
 * A read with a TYPED response only. PMTC decodes a native query into a
 * declared type, and there is no declared type to decode an untyped body into:
 * `useQuery<unknown>` lowers to a decode of `Any`, which does not compile on
 * Swift, so emitting the component anyway turned a content-less GET into a
 * BROKEN native module (Petstore 3's `user.native.tsx`). The endpoint is still
 * declared -- only the component that would render nothing is left out, and the
 * reach analysis in `core/generate.ts` reports the operation as web-only by
 * asking this same predicate.
 */
export function hasNativeDataComponent(op: IrOperation): boolean {
  return !isMutation(op) && typedResponse(op) !== undefined
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
export function emitWebEndpoints(
  doc: IrDocument,
  validator: ValidatorName = 'pyreon',
  client: ClientName = 'pyreon',
): SourceFile[] {
  const dialect = dialectOf(validator)
  const models: ModelTypes = new Map(doc.models.map((m) => [m.name, m.type]))
  const files: SourceFile[] = []
  for (const [tag, ops] of byTag(doc)) {
    const path = `endpoints/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    f.import(relativeSpecifier(path, CLIENT_FILE), 'api')
    // VALUES for response schemas (a composite clause names several models);
    // TYPES for everything an input names — a parameter or a body can be a
    // `$ref` too (GitHub's spec does this heavily).
    const schemaImports = new Set<string>()
    const typeImports = new Set<string>()
    for (const op of ops) {
      if (op.response && op.response.kind !== 'unknown') schemaRefs(op.response, schemaImports)
      // A PARAMETER's schema can be a `$ref` too - GitHub's spec does this
      // heavily (`AlertNumber`, `CodeScanningRef`) - and so can a body.
      for (const p of [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams]) {
        collectRefNames(p.type, typeImports)
      }
      if (op.body) collectRefNames(bodyRefType(op.body, models), typeImports)
    }
    // Each from its OWN module, not the barrel: the barrel re-exports every
    // model, and an edge to it is an edge to all of them for any bundler that
    // does not honour the `sideEffects` marker.
    for (const name of [...schemaImports].sort(byCodeUnit)) f.import(schemaSpecifierFor(path, name, doc), name)
    for (const name of [...typeImports].sort(byCodeUnit)) {
      if (!schemaImports.has(name)) f.importType(schemaSpecifierFor(path, name, doc), name)
    }

    const decls = ops.map((op) => endpointDecl(op, validator, models))
    // An encoded body is typed through the encoder's own value type.
    if (decls.some((d) => d.generics.includes('FormValue'))) {
      f.importType(client === 'pyreon' ? '@pyreon/http' : relativeSpecifier(path, CLIENT_FILE), 'FormValue')
    }
    // A composite clause (`array(Book)`, a union) needs the binding itself.
    if (decls.some((d) => d.usesBinding(dialect.binding))) f.import(dialect.module, dialect.binding)
    // A discriminated union over named models casts through the schema types.
    if (decls.some((d) => d.text.includes(' as unknown as '))) {
      if (dialect.schemaTypeImport) f.importType(dialect.schemaTypeImport.module, dialect.schemaTypeImport.name)
      if (dialect.objectSchemaImport) f.importType(dialect.objectSchemaImport.module, dialect.objectSchemaImport.name)
    }

    for (const [i, op] of ops.entries()) {
      const d = decls[i] as EndpointDecl
      f.line()
      if (d.responseConst) f.line(d.responseConst)
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      // Pure, so an endpoint nothing imports is dropped from the bundle even
      // though its tag module is reached (see `PURE`).
      f.line(`export const ${op.id} = ${PURE}api.endpoint${d.generics}(${q(endpointSpec(op))}${d.config})`)
    }
    emitStreamFunctions(f, ops, {
      path,
      doc,
      validator,
      streamDecl: (op) => ({ spec: endpointSpec(op), ...endpointDecl(op, validator, models, true) }),
    })
    files.push(f)
  }
  return files
}

interface EndpointDecl {
  /** `<Spec, V, Input[, Kind]>`. */
  generics: string
  /** `, { … }`, or `''`. */
  config: string
  /** A named response schema, when the generics must name its type. */
  responseConst: string | undefined
  /** Everything emitted, for import detection. */
  text: string
  usesBinding(binding: string): boolean
}

/**
 * One endpoint declaration.
 *
 * The declaration is where every call-site type is DECIDED (dx D6): its
 * generics carry the input type (`params`, `query`, `json`, each required
 * exactly where the spec says) and the response kind, so a direct call —
 * a loader, a server route, a script — is as strictly typed as a hook, and
 * the hooks derive theirs from it instead of re-rendering the spec (A8).
 *
 * TypeScript has no partial inference, so naming the input means naming the
 * response schema's TYPE too, which is why a composite response gets a named
 * `const` here.
 */
function endpointDecl(op: IrOperation, validator: ValidatorName, models: ModelTypes, asStream = false): EndpointDecl {
  const entries: string[] = []
  // `asStream`: the raw-body twin of a JSON endpoint, which `<op>Stream`
  // parses as SSE / NDJSON. It validates per EVENT, so it has no `response`.
  const kind = asStream ? 'stream' : responseTypeOf(op)
  let responseConst: string | undefined
  let v = 'undefined'
  if (!asStream && op.response && op.response.kind !== 'unknown') {
    const expr = schemaExpr(op.response, { native: false, validator })
    if (op.response.kind === 'ref') {
      entries.push(`response: ${op.response.name}`)
      v = `typeof ${op.response.name}`
    } else {
      // `$` cannot come out of `ident()` or `modelIdent()`, so this name can
      // never collide with an operation, a model or an emitter binding.
      const name = `${op.id}$response`
      responseConst = `const ${name} = ${expr}`
      entries.push(`response: ${name}`)
      v = `typeof ${name}`
    }
  }
  if (kind !== undefined) entries.push(`responseType: ${q(kind)}`)
  const styles = op.queryParams.flatMap((p) => {
    const style = runtimeQueryStyle(p, models)
    return style ? [`${propKey(p.name)}: ${style}`] : []
  })
  if (styles.length > 0) entries.push(`queryStyle: { ${styles.join(', ')} }`)
  // Declared ON the endpoint because they are properties of the API, not of a
  // call: a raw body's media type, and how each form field serializes.
  if (op.body) {
    if (op.body.encoding === 'text' || op.body.encoding === 'binary') {
      entries.push(`headers: { 'content-type': ${q(op.body.mediaType)} }`)
    }
    if (op.body.encoding === 'form' && op.body.fieldEncoding) {
      const fields = Object.entries(op.body.fieldEncoding).map(([k, e]) => {
        const parts: string[] = []
        if (e.style !== undefined) parts.push(`style: ${q(e.style)}`)
        if (e.explode !== undefined) parts.push(`explode: ${String(e.explode)}`)
        return `${propKey(k)}: { ${parts.join(', ')} }`
      })
      entries.push(`formEncoding: { ${fields.join(', ')} }`)
    }
  }
  // ALWAYS explicit, even for an operation that sends nothing: its input is
  // then `{}`, so a direct call cannot pass a query or a body the spec never
  // declared — the loose default would accept both.
  const generics = `<${[q(endpointSpec(op)), v, inputType(op, models), ...(kind ? [q(kind)] : [])].join(', ')}>`
  const config = entries.length > 0 ? `, { ${entries.join(', ')} }` : ''
  return {
    generics,
    config,
    responseConst,
    text: `${config} ${responseConst ?? ''}`,
    usesBinding: (binding) => new RegExp(`\\b${binding}\\.`).test(`${config} ${responseConst ?? ''}`),
  }
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
function responseCfg(
  op: IrOperation,
  native: boolean,
  validator: ValidatorName = 'pyreon',
  models?: ReadonlyMap<string, IrType>,
): string {
  const response = typedResponse(op)
  if (!response) return ''
  const refBinding = native ? nativeSchemaBinding : undefined
  return `, { response: ${schemaExpr(response, { native, validator, models, refBinding })} }`
}

/**
 * The response type an endpoint is DECLARED with, or `undefined` when it has
 * none -- no content at all (a 204, a `200` with only a description), or a
 * body Lathe could not type (`text/csv`, an SSE stream).
 *
 * This is the one place that decision is made. The hook's type argument and
 * the endpoint's `{ response }` clause used to decide it separately, and they
 * disagreed exactly here: a content-less GET emitted `useQuery<void>` over an
 * endpoint whose `.query()` yields `QueryOptionsLike<unknown>`.
 */
export function typedResponse(op: IrOperation): IrType | undefined {
  if (!op.response || op.response.kind === 'unknown') return undefined
  return op.response
}

/**
 * A TypeScript type for the native layout, with every NON-OBJECT model
 * expanded in place (audit G5). PMTC turns an object alias into a struct and
 * an array/scalar alias into nothing, so `PyreonQuery<Pets>` named a type that
 * did not exist on either target.
 */
function nativeTs(type: IrType, models: ReadonlyMap<string, IrType>, depth = 0): string {
  if (type.kind === 'ref') {
    const target = models.get(type.name)
    if (target && target.kind !== 'object' && depth < 8) return nativeTs(target, models, depth + 1)
    return type.name
  }
  if (type.kind === 'array') {
    const inner = nativeTs(type.items, models, depth + 1)
    return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`
  }
  return tsType(type, 0, true)
}

/**
 * A model's schema BINDING in a native module (audit G6).
 *
 * Not the model's name: TypeScript keeps `const Pet` and `type Pet` in
 * separate namespaces, Swift and Kotlin do not — PMTC turned the pair into
 * `let Pet` + `struct Pet` (`invalid redeclaration`) and `val Pet` +
 * `data class Pet` (`conflicting declarations`), so no native module with a
 * model compiled on either target. `pet_schema` cannot collide: `ident()`
 * never emits an inner underscore and model names are PascalCase.
 */
export function nativeSchemaBinding(model: string): string {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}_schema`
}

/**
 * The `queryStyle` entry a query parameter needs, or `undefined` when the
 * runtime's default already serializes it the way the spec says (audit B2).
 *
 * The two defaults differ, which is the whole reason this is not a straight
 * copy: OpenAPI's default for a query OBJECT is `form` + exploded (each
 * property its own parameter), while `@pyreon/http` defaults an object to
 * bracket keys. For an ARRAY they agree (repeat the key). A scalar has no
 * style to speak of.
 */
function runtimeQueryStyle(
  p: IrOperation['queryParams'][number],
  models: ReadonlyMap<string, IrType>,
): string | undefined {
  const kind = resolvedKind(p.type, models)
  const style = p.style ?? 'form'
  // OpenAPI: `explode` defaults to true for `form`, false for everything else.
  const explode = p.explode ?? style === 'form'
  if (kind === 'array') {
    // `deepObject` is undefined for arrays in OpenAPI; the default is the
    // only sensible reading.
    if (style === 'deepObject' || explode) return undefined
    return `{ style: ${q(style)}, explode: false }`
  }
  if (kind === 'object') {
    if (style === 'deepObject') return undefined
    return `{ style: ${q(style)}, explode: ${explode} }`
  }
  return undefined
}

function resolvedKind(type: IrType, models: ReadonlyMap<string, IrType>, depth = 0): IrType['kind'] {
  if (type.kind === 'nullable') return resolvedKind(type.inner, models, depth + 1)
  if (type.kind === 'ref' && depth < 16) {
    const target = models.get(type.name)
    return target ? resolvedKind(target, models, depth + 1) : 'unknown'
  }
  return type.kind
}

/** WEB layout: `queries.ts` — reactive hooks, one per operation. */
export function emitWebQueries(doc: IrDocument): SourceFile[] {
  const files: SourceFile[] = []
  // A stream is never cached, so it is never an invalidation target.
  const queryOps = doc.operations.filter((o) => !isMutation(o) && !isStreamOnly(o))
  // The FILE group each operation lives in — an untagged operation is grouped
  // by its path, so `op.tag` is not the file.
  const groupOf = new Map<string, string>()
  for (const [group, list] of byTag(doc)) for (const o of list) groupOf.set(o.id, group)
  for (const [tag, ops] of byTag(doc)) {
    const path = `queries/${tagFile(tag)}.ts`
    const f = new SourceFile(path)
    const epPath = `endpoints/${tagFile(tag)}.ts`
    f.import(relativeSpecifier(path, epPath), ...ops.filter((o) => !isStreamOnly(o)).map((o) => o.id))
    // A stream-only operation gets `use<Op>Stream` INSTEAD of a query or a
    // mutation: a raw body in a query cache is a one-shot stream re-read on
    // every refetch.
    const usesQuery = ops.some((o) => !isMutation(o) && !isStreamOnly(o))
    const usesMutation = ops.some((o) => isMutation(o) && !isStreamOnly(o))
    const streaming = ops.filter((o) => o.stream !== undefined)
    if (streaming.length > 0) {
      f.import(relativeSpecifier(path, epPath), ...streaming.map(streamName))
      f.import('@pyreon/query', 'useStream')
      f.importType('@pyreon/query', 'UseStreamOptions')
      f.importType('@pyreon/http/stream', 'StreamItem')
    }
    if (usesQuery) {
      f.import('@pyreon/query', 'useQuery')
      f.importType('@pyreon/query', 'UseQueryOptions')
    }
    if (usesMutation) {
      f.import('@pyreon/query', 'useMutation')
      f.importType('@pyreon/query', 'MutationOptions')
    }
    if (ops.some((o) => o.pagination && !isMutation(o))) {
      f.import('@pyreon/query', 'useInfiniteQuery')
      f.importType('@pyreon/query', 'UseInfiniteQueryOptions')
    }
    // Invalidation targets can live in another tag's endpoint module.
    for (const op of ops.filter((o) => isMutation(o) && !isStreamOnly(o))) {
      for (const target of invalidationTargets(op, queryOps)) {
        const group = groupOf.get(target.id) as string
        if (group !== tag) f.import(relativeSpecifier(path, `endpoints/${tagFile(group)}.ts`), target.id)
      }
    }

    for (const op of ops) {
      if (op.stream) emitStreamHook(f, op)
      if (isStreamOnly(op)) continue
      const hook = `use${typeIdent(op.id)}`
      // Every type below is DERIVED from the endpoint declaration, never
      // re-rendered from the spec — the declaration is the one source.
      const data = `Awaited<ReturnType<typeof ${op.id}>>`
      const input = `Parameters<typeof ${op.id}>[0]`
      f.line()
      if (isMutation(op)) {
        const targets = invalidationTargets(op, queryOps)
        const vars = hasInput(op) ? input : 'void'
        f.doc(
          op.summary,
          `\`${endpointSpec(op)}\``,
          '',
          'Mutation options are a plain object — imperative, nothing to track.',
          targets.length > 0
            ? `On success it invalidates the queries this operation can change (${targets.map((t) => `\`${t.id}\``).join(', ')}); pass \`invalidates\` to replace that list, or \`[]\` to turn it off.`
            : undefined,
          '`onMutate` / `onError` / `onSettled` take the usual optimistic-update shape — see `optimisticUpdate` in `./keys`.',
        )
        f.line(`export function ${hook}(`)
        f.line(`  options?: Omit<MutationOptions<${data}, Error, ${vars}>, 'mutationFn'>,`)
        f.line(') {')
        f.line('  return useMutation({')
        f.line(
          hasInput(op)
            ? `    mutationFn: (vars: ${input}) => ${op.id}(vars),`
            : `    mutationFn: () => ${op.id}(),`,
        )
        if (targets.length > 0) {
          f.line(`    invalidates: [${targets.map((t) => `${t.id}.key.prefix`).join(', ')}],`)
        }
        f.line('    ...options,')
        f.line('  })')
        f.line('}')
        continue
      }
      const args = hasInput(op)
      f.doc(
        op.summary,
        `\`${endpointSpec(op)}\``,
        '',
        // The accessor argument is the whole reason this is a function and not
        // an object: `@pyreon/query` re-reads it, so a signal in `args` makes
        // the query key move and the request refetch.
        args ? 'Takes an ACCESSOR so signal reads in the arguments stay reactive.' : undefined,
        // The single most common way to get a detail query wrong is to fire it
        // before its id exists. Returning `undefined` is how you say "not yet".
        args
          ? 'Return `undefined` from `args` while the arguments are not ready — the query is DISABLED rather than fired with a placeholder.'
          : undefined,
        'Second accessor merges typed query options (`enabled`, `staleTime`, `select` — which changes the result type).',
        '',
        'Result fields are SIGNALS: `q.data()`, `q.isPending()` — call them.',
      )
      const extra = `options?: () => Omit<UseQueryOptions<${data}, Error, TData>, 'queryKey' | 'queryFn'>`
      if (args) {
        f.line(`export function ${hook}<TData = ${data}>(`)
        f.line(`  args: () => ${input} | undefined,`)
        f.line(`  ${extra},`)
        f.line(') {')
        f.line(`  return useQuery<${data}, Error, TData>(() => {`)
        f.line('    const a = args()')
        f.line('    const extra = options?.() ?? {}')
        // The disabled branch keys on the endpoint's own PREFIX — the same key
        // `keys` exposes — so an invalidation of the endpoint still matches it.
        // `enabled` sits AFTER the spread: a caller's `enabled: true` must not
        // fire a request whose path parameter is missing.
        f.line('    if (a === undefined) {')
        f.line(
          `      return { queryKey: ${op.id}.key.prefix, queryFn: ${DISABLED_FN}, ...extra, enabled: false }`,
        )
        f.line('    }')
        f.line(`    return { ...${op.id}.query(a), ...extra, enabled: extra.enabled !== false }`)
        f.line('  })')
      } else {
        f.line(`export function ${hook}<TData = ${data}>(${extra}) {`)
        f.line(`  return useQuery<${data}, Error, TData>(() => ({ ...${op.id}.query(), ...options?.() }))`)
      }
      f.line('}')
      emitInfinite(f, op, DISABLED_FN)
    }
    files.push(f)
  }
  return files
}

/**
 * The queries a mutation can change, derived from paths (audit E2).
 *
 * A mutation on `/pets/:id` changes that pet AND the `/pets` collection it
 * lives in, so the scope is the path with one trailing parameter segment
 * removed: every GET at or below it is invalidated. `POST /pets` scopes to
 * `/pets` itself. Conservative in the direction that matters — an extra
 * refetch is cheap, a stale list after a create is a bug report.
 */
export function invalidationTargets(op: IrOperation, queryOps: readonly IrOperation[]): IrOperation[] {
  const segs = op.path.split('/')
  const last = segs[segs.length - 1] ?? ''
  const scope = last.startsWith(':') ? segs.slice(0, -1).join('/') : op.path
  const within = (p: string): boolean => scope === '' || p === scope || p.startsWith(`${scope}/`)
  return queryOps.filter((candidate) => within(candidate.path)).sort((a, b) => byCodeUnit(a.id, b.id))
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
  const dialect = dialectOf(opts.validator ?? 'pyreon')
  // Model types by name, so a `$ref` FIELD can be inlined on the native path.
  // PMTC drops a field that NAMES another schema; an inlined ref is a nested
  // object, which its zod recogniser lowers. The `s.*` recogniser drops nested
  // objects too, so the dialect says whether inlining is worth anything and
  // `schemaExpr` only consults this map when it is.
  const modelTypes = new Map(doc.models.map((m) => [m.name, m.type]))
  const { order: modelOrder, backEdges } = topoSortModels(doc)
  const nativeSchema = new Map<string, string>()
  for (const model of doc.models) {
    // The SAME deferral the web schemas get. A native module is ordinary app
    // source too, so a cyclic `$ref` emitted as a direct forward reference is a
    // TDZ ReferenceError there exactly as it is on the web. `s.lazy` does not
    // lower, so this costs the model its native path -- which the verifier
    // reports. Correct-and-web-only beats lowering-and-broken.
    const defer = deferredTargets(backEdges, model.name)
    const expr = schemaExpr(model.type, {
      native: true,
      defer,
      validator: dialect.name,
      models: modelTypes,
      refBinding: nativeSchemaBinding,
    })
    // zod is recognised ONLY inside `@pyreon/validation`'s `zodSchema(...)` —
    // the recognizer keys on that distinctive wrapper call rather than on the
    // bare `z` name, so an unwrapped `z.object({ … })` lowers to nothing.
    nativeSchema.set(model.name, dialect.nativeWrap ? `${dialect.nativeWrap.fn}(${expr})` : expr)
  }

  for (const [tag, ops] of byTag(doc)) {
    const path = `${tagFile(tag)}.native.tsx`
    const f = new SourceFile(path)
    f.import('@pyreon/http', 'createHttp')
    f.import('@pyreon/http/schema', 'standardSchema')
    f.import(dialect.module, dialect.binding)
    if (dialect.nativeWrap) f.import(dialect.nativeWrap.module, dialect.nativeWrap.fn)
    if (ops.some(hasNativeDataComponent)) f.import('@pyreon/query', 'useQuery')

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
    // PMTC bakes `baseUrl + path` at compile time, so an operation with its
    // own server cannot carry the host in the path the way the web layout
    // does -- it gets its own literal-base client instead, which lowers.
    const hosts = [...new Set(ops.map((o) => o.baseUrl).filter((b): b is string => b !== undefined))].sort()
    const clientOf = new Map<string, string>()
    hosts.forEach((h, i) => {
      const name = `api${i + 2}`
      clientOf.set(h, name)
      f.line(`const ${name} = createHttp({ baseUrl: ${q(h)}, schema: standardSchema })`)
    })

    // Schemas, inlined. The TRANSITIVE closure, not just the models an
    // operation names: a native module imports nothing, so inlining `Order`
    // while leaving out the `Customer` it references emits a module that does
    // not even typecheck. In DEPENDENCY ORDER for the same reason the web
    // schemas are — `const` is not hoisted.
    const direct = new Set<string>()
    for (const op of ops) {
      collectRefs(op.response, direct)
      collectRefs(op.body?.type, direct)
    }
    const needed = reachableModels(doc, direct)
    const byName = new Map(doc.models.map((m) => [m.name, m]))
    for (const name of modelOrder) {
      const model = byName.get(name)
      if (!model || !needed.has(name)) continue
      f.line()
      f.doc(model.doc)
      // Only OBJECT models get a schema binding; every other kind is inlined
      // where it is used (audit G5 — see `schemaExpr`). The TYPE is declared
      // for every model: the data components name it.
      if (model.type.kind === 'object') {
        f.line(
          `export const ${nativeSchemaBinding(model.name)} = ${nativeSchema.get(model.name) ?? `${dialect.binding}.object({})`}`,
        )
      }
      // A STRUCTURAL type, not `Infer<typeof X>`. `Infer` would be an
      // `import type` — erased by TypeScript, but PMTC's warn pass reads the
      // import statement itself and reports the module as un-lowerable. The
      // rendered type is identical; only the derivation differs.
      f.line(`export type ${model.name} = ${tsType(model.type, 0, true, true)}`)
    }

    for (const op of ops) {
      f.line()
      f.doc(op.summary, `\`${endpointSpec(op)}\``)
      const client = op.baseUrl ? (clientOf.get(op.baseUrl) as string) : 'api'
      f.line(
        `export const ${op.id} = ${client}.endpoint(${q(`${op.method} ${op.path}`)}${responseCfg(op, true, dialect.name, modelTypes)})`,
      )
    }

    // Data components. A component body is the ONLY place `useQuery` lowers —
    // a standalone hook function is read as a View and emitted verbatim, which
    // produces Swift that does not compile, with no warning at all.
    for (const op of ops) {
      if (!hasNativeDataComponent(op)) continue
      const response = typedResponse(op)
      const ret = response ? nativeTs(response, modelTypes) : 'unknown'
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
      // Returned as an ACCESSOR. A Pyreon component body runs ONCE, so
      // `return props.children(q.data())` read the data at mount — `undefined`
      // — and the rendered output never moved again: on the web the component
      // stayed at its loading state forever. The accessor re-reads `q.data()`
      // in a tracked scope, and PMTC lowers it to the same render-prop view.
      // (`q.data` is a SIGNAL; it is still CALLED inside the accessor.)
      f.line('  return () => props.children(q.data())')
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
  collectRefNames(type, into)
}

export { tagFile }
