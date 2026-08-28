/**
 * The generated endpoint runtime, for clients that are not `@pyreon/http`.
 *
 * `@pyreon/http` already gives an endpoint the shape every downstream emitter
 * reads — callable, `.key` with a `.prefix`, `.query(args)`, `.mutation()`.
 * That shape is the SEAM: `endpoints/*.ts`, `queries/*.ts`, `keys.ts`,
 * `components.tsx` and the Atlas files are byte-identical whichever transport
 * is underneath, because they only ever touch it.
 *
 * So an axios / ky / fetch client is not a second code path through the
 * generator. It is a different `client.ts` that satisfies the same seam, and
 * the ~120 lines below are what satisfies it.
 *
 * ## Why the URL logic is duplicated here rather than imported
 *
 * A project that chose axios did so to NOT depend on `@pyreon/http`; importing
 * `buildUrl` from it would put the dependency back for the sake of forty
 * lines. The cost of duplicating it is drift, and drift here is not cosmetic —
 * a different base-join or a different query encoding means the SAME generated
 * call issues a DIFFERENT request depending on a config flag, which is the
 * worst kind of silent divergence.
 *
 * That cost is paid down by a differential test rather than by care:
 * `adapter-url-parity.test.ts` runs every adapter's emitted `buildUrl` against
 * `@pyreon/http`'s own as the ORACLE, over a shared matrix that includes the
 * shapes each of these three libraries gets wrong on its own (a leading-slash
 * path under a based URL, a `null` query value, an array query value, a path
 * parameter containing `/`).
 *
 * The semantics being matched are `@pyreon/http`'s, deliberately, including
 * where they differ from the underlying library's defaults:
 *
 *   - `baseUrl` is a pure PREFIX, not a WHATWG `new URL(path, base)`
 *     resolution. Both axios and ky resolve, so `'https://api.test/v1'` plus
 *     `'/books'` gives `…/books` there and `…/v1/books` here. Matching the
 *     library would make the same spec produce a different URL per adapter.
 *   - `undefined` / `null` query entries are DROPPED, never serialized as the
 *     text `"undefined"`.
 *   - path parameters are `encodeURIComponent`-encoded, so an id containing
 *     `/` cannot break out of its segment.
 */

/** Which HTTP runtime the generated client is built on. */
export type ClientName = 'pyreon' | 'fetch' | 'axios' | 'ky'

export const ALL_CLIENTS: readonly ClientName[] = ['pyreon', 'fetch', 'axios', 'ky']

/** The npm package a generated client imports, or `undefined` for none. */
export const CLIENT_PACKAGE: Readonly<Record<ClientName, string | undefined>> = {
  pyreon: '@pyreon/http',
  fetch: undefined,
  axios: 'axios',
  ky: 'ky',
}

/**
 * Only `pyreon` reaches native.
 *
 * PMTC recognises `createHttp` + `api.endpoint(...)` by NAME and lowers the
 * pair to a real `URLSession` / `OkHttp` call. An axios instance is an ordinary
 * import it has never heard of, so a `multiplatform` target over one would emit
 * native modules that lower to nothing — which is precisely the silent
 * regression the target exists to catch.
 */
export function reachesNative(client: ClientName): boolean {
  return client === 'pyreon'
}

/** Shared preamble: types and helpers every generated adapter needs. */
export function runtimePreamble(): string[] {
  return [
    'export type EndpointKey = readonly unknown[]',
    '',
    '/**',
    ' * A value accepted for a query-string entry.',
    ' *',
    ' * Mirrors `@pyreon/http`\'s `QueryValue` exactly. Nullish entries are',
    ' * DROPPED rather than serialized as the strings `"undefined"` / `"null"`,',
    ' * and arrays repeat the key.',
    ' */',
    'export type QueryValue =',
    '  | string',
    '  | number',
    '  | boolean',
    '  | null',
    '  | undefined',
    '  | readonly (string | number | boolean)[]',
    '',
    '/** Arguments an endpoint call accepts. */',
    'export interface EndpointArgs {',
    '  /**',
    '   * `string | number` MATCHES `@pyreon/http` exactly.',
    '   *',
    '   * A boolean path parameter is unsupported on every client here, not just',
    '   * this one — widening it would make the same spec typecheck under one',
    '   * `client` setting and fail under another, which is the divergence this',
    '   * whole seam exists to prevent.',
    '   */',
    '  params?: Record<string, string | number>',
    '  query?: Record<string, QueryValue>',
    '  json?: unknown',
    '  headers?: Record<string, string>',
    '  signal?: AbortSignal',
    '}',
    '',
    '/**',
    ' * Response type inferred from a Standard Schema.',
    ' *',
    ' * Matches zod, valibot, arktype and `@pyreon/validate` alike — the schema',
    ' * emitter is free to change library without this file knowing.',
    ' *',
    ' * The `NonNullable` step is load-bearing. `types` is an OPTIONAL phantom',
    ' * property, so matching `{ types?: { output: infer O } }` directly fails',
    ' * against a library that spells it `types?: Types | undefined` — and it',
    ' * fails SILENTLY, resolving to `unknown`. Every generated hook then reads',
    ' * `Promise<unknown>` and the module does not compile.',
    ' */',
    'type Infer<V> = V extends { readonly "~standard": { readonly types?: infer T } }',
    '  ? NonNullable<T> extends { readonly output: infer O }',
    '    ? O',
    '    : unknown',
    '  : unknown',
    '',
    '/** Structural mirror of TanStack query options — no dependency needed. */',
    'export interface QueryOptionsLike<T> {',
    '  queryKey: EndpointKey',
    '  queryFn: (context: { signal: AbortSignal }) => Promise<T>',
    '}',
    '',
    'export interface MutationOptionsLike<T, TVars> {',
    '  mutationFn: (variables: TVars) => Promise<T>',
    '  invalidates?: EndpointKey[] | undefined',
    '}',
    '',
    '/** An endpoint: callable, plus the key/query/mutation helpers. */',
    'export interface Endpoint<T> {',
    '  (args?: EndpointArgs): Promise<T>',
    '  readonly method: string',
    '  readonly path: string',
    '  readonly key: ((args?: EndpointArgs) => EndpointKey) & { readonly prefix: EndpointKey }',
    '  query(args?: EndpointArgs): QueryOptionsLike<T>',
    '  mutation<TVars extends EndpointArgs = EndpointArgs>(options?: {',
    '    invalidates?: readonly { readonly key: { readonly prefix: EndpointKey } }[]',
    '  }): MutationOptionsLike<T, TVars>',
    '}',
    '',
    'const ABSOLUTE_RE = /^[a-z][a-z\\d+\\-.]*:\\/\\//i',
    '',
    '/**',
    ' * Join base and path with exactly one slash.',
    ' *',
    ' * A pure PREFIX join, NOT `new URL(path, base)`. Both axios and ky resolve,',
    ' * so a leading-slash path would discard the base\'s own path segment there',
    ' * and not here; matching them would make the same spec issue a different',
    ' * request depending on which client was configured.',
    ' */',
    'export function joinUrl(base: string | undefined, path: string): string {',
    '  if (!base || ABSOLUTE_RE.test(path)) return path',
    '  const b = base.endsWith("/") ? base.slice(0, -1) : base',
    '  const p = path.startsWith("/") ? path : `/${path}`',
    '  return `${b}${p}`',
    '}',
    '',
    '/** Substitute `:name` placeholders, URI-encoded. Throws on a missing one. */',
    'export function applyPathParams(path: string, params: EndpointArgs["params"]): string {',
    '  if (!path.includes(":")) return path',
    '  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {',
    '    const value = params?.[name]',
    '    if (value === undefined || value === null) {',
    '      throw new Error(',
    '        `[lathe] path "${path}" needs the parameter "${name}" but it was not supplied. ` +',
    '          `Pass it as \\`{ params: { ${name}: … } }\\`.`,',
    '      )',
    '    }',
    '    return encodeURIComponent(String(value))',
    '  })',
    '}',
    '',
    '/** Serialize query parameters. Nullish entries are DROPPED; arrays repeat. */',
    'export function buildQuery(query: EndpointArgs["query"]): string {',
    '  if (!query) return ""',
    '  const search = new URLSearchParams()',
    '  for (const key of Object.keys(query)) {',
    '    const value = query[key]',
    '    if (value === undefined || value === null) continue',
    '    if (Array.isArray(value)) {',
    '      for (const item of value) {',
    '        if (item === undefined || item === null) continue',
    '        search.append(key, String(item))',
    '      }',
    '      continue',
    '    }',
    '    search.append(key, String(value))',
    '  }',
    '  const out = search.toString()',
    '  return out ? `?${out}` : ""',
    '}',
    '',
    '/** Full resolution: base + path + params + query. */',
    'export function buildUrl(',
    '  baseUrl: string | undefined,',
    '  path: string,',
    '  params: EndpointArgs["params"],',
    '  query: EndpointArgs["query"],',
    '): string {',
    '  const joined = joinUrl(baseUrl, applyPathParams(path, params))',
    '  const qs = buildQuery(query)',
    '  if (!qs) return joined',
    '  return joined.includes("?") ? `${joined}&${qs.slice(1)}` : `${joined}${qs}`',
    '}',
  ]
}

/**
 * Response validation through the Standard Schema contract.
 *
 * Three details here are each a documented bug class, and all three are
 * invisible until the exact library that trips them is used:
 *
 *   1. The guard accepts a CALLABLE as well as an object. An ArkType schema is
 *      a function carrying `~standard`, so a `typeof x === 'object'` test
 *      silently reports "not a schema" and skips validation entirely.
 *   2. Failure is discriminated on `issues`, never on the presence of `value`.
 *      Valibot's FAILURE result carries `{ typed: false, value, issues }` — a
 *      `'value' in result` test reads that as success and returns the RAW
 *      invalid input.
 *   3. `validate` may return a Promise. Awaiting a non-Promise is free, so it
 *      is awaited unconditionally rather than branched on.
 */
export function runtimeValidate(): string[] {
  return [
    'type StandardResult = { issues?: readonly { message: string }[]; value?: unknown }',
    'type StandardSchema = { "~standard": { validate: (v: unknown) => StandardResult | Promise<StandardResult> } }',
    '',
    'function isStandardSchema(v: unknown): v is StandardSchema {',
    '  // A schema may be a FUNCTION (ArkType) as well as an object.',
    '  if (v === null || (typeof v !== "object" && typeof v !== "function")) return false',
    '  const std = (v as { "~standard"?: { validate?: unknown } })["~standard"]',
    '  return typeof std?.validate === "function"',
    '}',
    '',
    'async function validateResponse(schema: unknown, body: unknown): Promise<unknown> {',
    '  if (!isStandardSchema(schema)) return body',
    '  const result = await schema["~standard"].validate(body)',
    '  // Failure is `issues` being present and non-empty — NOT the absence of',
    '  // `value`, which some libraries return alongside the issues.',
    '  if (result.issues && result.issues.length > 0) {',
    '    const detail = result.issues.map((i) => i.message).join(", ")',
    '    throw new Error(`[lathe] response did not match its schema: ${detail}`)',
    '  }',
    '  return result.value',
    '}',
  ]
}

/**
 * The transport seam.
 *
 * `@pyreon/http` reserves this slot with a passthrough middleware because
 * endpoints bind to the client at declaration time. The generated adapters
 * have the same problem for the same reason, so they expose the same function
 * — which is what lets ONE `mocks.ts` install fixtures against any of them.
 *
 * The request shape is deliberately the platform's own `Request`/`Response`
 * rather than an adapter-specific one: a mock written against it works
 * unchanged when the client is swapped, which is the entire point of having
 * the seam in the first place.
 */
export function runtimeTransport(): string[] {
  return [
    'export interface DevRequest {',
    '  method: string',
    '  /** Fully-resolved request URL, params substituted and query appended. */',
    '  url: string',
    '  /** The DECLARED path, placeholders intact — `/books/:id`. */',
    '  path: string',
    '  headers: Record<string, string>',
    '  json?: unknown',
    '}',
    '',
    '/**',
    ' * An answer, ENVELOPED.',
    ' *',
    ' * The envelope is what distinguishes "handled, and the body is null" from',
    ' * "not handled, go to the network". A bare `unknown | null` return cannot:',
    ' * a 204 route and an unmatched route both say `null`, so a fixture for a',
    ' * no-content response would silently issue a real request.',
    ' */',
    'export type DevAnswer = { json: unknown } | null',
    '',
    'export type DevTransport = (req: DevRequest) => DevAnswer | Promise<DevAnswer>',
    '',
    'let devTransport: DevTransport | null = null',
    '',
    '/**',
    ' * Install a transport that answers requests instead of the network.',
    ' *',
    ' * Returning `null` from it falls through to the real client, so a mock can',
    ' * cover some routes and let the rest go out. Pass `null` to uninstall.',
    ' */',
    'export function setDevTransport(transport: DevTransport | null): void {',
    '  devTransport = transport',
    '}',
  ]
}

/**
 * A uniform error type across adapters.
 *
 * The three libraries disagree about failure by default: `fetch` resolves a
 * 500 as a normal response, axios rejects with an `AxiosError`, ky rejects
 * with an `HTTPError`. Left alone, switching `client` would change what a
 * generated query's `error` signal CONTAINS — so every adapter normalises to
 * this one shape, which also mirrors `@pyreon/http`'s `HttpError` closely
 * enough that a `status` check written against one keeps working against the
 * others.
 */
export function runtimeError(): string[] {
  return [
    'export class LatheHttpError extends Error {',
    '  constructor(',
    '    readonly status: number,',
    '    readonly url: string,',
    '    /** Parsed body when it was JSON, raw text otherwise, `undefined` when empty. */',
    '    readonly body?: unknown,',
    '  ) {',
    '    super(`[lathe] ${status} for ${url}`)',
    '    this.name = "LatheHttpError"',
    '  }',
    '}',
  ]
}

/** The adapter-specific request execution. */
function sendFn(client: ClientName): string[] {
  if (client === 'fetch') {
    return [
      'async function send(',
      '  method: string,',
      '  url: string,',
      '  headers: Record<string, string>,',
      '  json: unknown,',
      '  signal: AbortSignal | undefined,',
      '): Promise<unknown> {',
      '  const res = await fetch(url, {',
      '    method,',
      '    headers,',
      '    // Spread rather than assigned: under `exactOptionalPropertyTypes` an',
    '    // explicit `undefined` is not assignable to `RequestInit["body"]`, so',
    '    // the key has to be ABSENT rather than present-and-undefined.',
    '    ...(json === undefined ? {} : { body: JSON.stringify(json) }),',
      '    ...(signal ? { signal } : {}),',
      '  })',
      '  // `fetch` resolves a 500 like any other response; every other adapter',
      '  // here rejects. Normalised so the generated hooks behave identically.',
      '  if (!res.ok) throw new LatheHttpError(res.status, url, await readBody(res))',
      '  return readBody(res)',
      '}',
      '',
      'async function readBody(res: Response): Promise<unknown> {',
      '  if (res.status === 204 || res.status === 205) return undefined',
      '  const text = await res.text()',
      '  if (text === "") return undefined',
      '  try {',
      '    return JSON.parse(text) as unknown',
      '  } catch {',
      '    // A non-JSON error page is far more useful as its text than as a',
      '    // parse failure that hides what the server actually said.',
      '    return text',
      '  }',
      '}',
    ]
  }
  if (client === 'axios') {
    return [
      'async function send(',
      '  method: string,',
      '  url: string,',
      '  headers: Record<string, string>,',
      '  json: unknown,',
      '  signal: AbortSignal | undefined,',
      '): Promise<unknown> {',
      '  try {',
      '    const res = await instance.request({',
      '      url,',
      '      method,',
      '      headers,',
      '      ...(json === undefined ? {} : { data: json }),',
      '      ...(signal ? { signal } : {}),',
      '    })',
      '    // axios reports an empty body as the EMPTY STRING, not `undefined`,',
      '    // so a 204 would decode to `""` and then fail a schema the other',
      '    // adapters never even reach with a value.',
      '    return res.data === "" ? undefined : res.data',
      '  } catch (err) {',
      '    const res = (err as { response?: { status: number; data: unknown } }).response',
      '    if (res) throw new LatheHttpError(res.status, url, res.data)',
      '    throw err',
      '  }',
      '}',
    ]
  }
  return [
    'async function send(',
    '  method: string,',
    '  url: string,',
    '  headers: Record<string, string>,',
    '  json: unknown,',
    '  signal: AbortSignal | undefined,',
    '): Promise<unknown> {',
    '  try {',
    '    const res = await instance(url, {',
    '      method,',
    '      headers,',
    '      ...(json === undefined ? {} : { json }),',
    '      ...(signal ? { signal } : {}),',
    '    })',
    '    if (res.status === 204 || res.status === 205) return undefined',
    '    const text = await res.text()',
    '    return text === "" ? undefined : (JSON.parse(text) as unknown)',
    '  } catch (err) {',
    '    const e = err as { response?: Response; data?: unknown }',
    '    if (e.response) {',
    '      // ky CONSUMES the error body into `error.data` and documents that',
    '      // `error.response.json()` will not work afterwards. Reading the',
    '      // response here returns an empty stream, so the status survives and',
    '      // the body silently does not.',
    '      throw new LatheHttpError(e.response.status, url, e.data)',
    '    }',
    '    throw err',
    '  }',
    '}',
  ]
}

/**
 * The endpoint factory — the seam every other emitter reads.
 *
 * Key construction matches `@pyreon/http`'s exactly: `[method, path]` as the
 * prefix, `[method, path, { params?, query? }]` when arguments narrow it. That
 * is not cosmetic — `keys.ts` is generated identically for every adapter, so a
 * different key shape here would make a generated `invalidateQueries` silently
 * match nothing.
 */
export function runtimeEndpoint(client: ClientName, baseUrl: string): string[] {
  return [
    ...sendFn(client),
    '',
    `const BASE_URL = ${JSON.stringify(baseUrl)}`,
    '',
    'function isEmpty(v: Record<string, unknown> | undefined): boolean {',
    '  return v === undefined || Object.keys(v).length === 0',
    '}',
    '',
    'export const api = {',
    '  /**',
    '   * Declare an endpoint from a `"METHOD /path/:param"` literal.',
    '   *',
    '   * `response` is an optional Standard Schema — zod, valibot, arktype and',
    '   * `@pyreon/validate` all satisfy it. When present the body is validated',
    '   * AND the return type is inferred from it.',
    '   */',
    '  endpoint<V = undefined>(spec: string, config?: { response?: V }): Endpoint<Infer<V>> {',
    '    const sep = spec.indexOf(" ")',
    '    const method = spec.slice(0, sep).toUpperCase()',
    '    const path = spec.slice(sep + 1)',
    '    const prefix: EndpointKey = [method, path]',
    '',
    '    const buildKey = (args?: EndpointArgs): EndpointKey => {',
    '      if (isEmpty(args?.params) && isEmpty(args?.query)) return prefix',
    '      const scope: Record<string, unknown> = {}',
    '      if (!isEmpty(args?.params)) scope.params = args?.params',
    '      if (!isEmpty(args?.query)) scope.query = args?.query',
    '      return [method, path, scope]',
    '    }',
    '',
    '    const call = async (args?: EndpointArgs): Promise<unknown> => {',
    '      const url = buildUrl(BASE_URL, path, args?.params, args?.query)',
    '      const headers: Record<string, string> = {',
    '        ...(args?.json === undefined ? {} : { "content-type": "application/json" }),',
    '        ...args?.headers,',
    '      }',
    '      // The seam is consulted BEFORE the transport, so a mock never needs',
    '      // the network to exist. `null` falls through to the real client.',
    '      if (devTransport) {',
    '        const answer = await devTransport({ method, url, path, headers, json: args?.json })',
    '        if (answer !== null) return validateResponse(config?.response, answer.json)',
    '      }',
    '      const body = await send(method, url, headers, args?.json, args?.signal)',
    '      return validateResponse(config?.response, body)',
    '    }',
    '',
    '    const key = Object.assign((args?: EndpointArgs) => buildKey(args), { prefix })',
    '',
    '    return Object.assign(call, {',
    '      method,',
    '      path,',
    '      key,',
    '      query: (args?: EndpointArgs) => ({',
    '        queryKey: buildKey(args),',
    '        queryFn: ({ signal }: { signal: AbortSignal }) => call({ ...args, signal }),',
    '      }),',
    '      mutation: (options?: {',
    '        invalidates?: readonly { readonly key: { readonly prefix: EndpointKey } }[]',
    '      }) => ({',
    '        mutationFn: (variables: EndpointArgs) => call(variables),',
    '        invalidates: options?.invalidates?.map((e) => e.key.prefix),',
    '      }),',
    '    }) as unknown as Endpoint<Infer<V>>',
    '  },',
    '}',
  ]
}
