/**
 * `webhooks.ts` — the requests an API SENDS: 3.1 `webhooks` and operation
 * `callbacks`.
 *
 * A client never makes these calls, so they get no endpoint and no hook. What
 * the code RECEIVING them needs is emitted instead, framework-agnostic (a
 * fetch `Request` in, a `Response` out — which is also zero's API-route shape):
 *
 * ```ts
 * import { webhookHandler } from './gen'
 *
 * // src/routes/api/hooks/new-pet.ts (zero), or any fetch-style handler
 * export const POST = webhookHandler(
 *   { newPet: async (pet) => { await db.pets.insert(pet) } },
 *   { verify: ({ request, bytes }) => checkSignature(request.headers, bytes) },
 * )
 * ```
 *
 *  - `webhookSchemas` / `WebhookPayloads` / `WebhookHandler<K>`: the payload's
 *    schema and type, from the same walk as every other schema.
 *  - `validateWebhook(name, body)`: the schema, run on an untrusted body.
 *  - `webhookHandler(handlers, options)`: verify -> parse by the declared
 *    media type -> pick the event -> check the method -> validate -> dispatch.
 *    Signature checking is a HOOK (`verify`), not per-vendor crypto: every
 *    sender signs differently, and a guessed scheme is a false sense of
 *    security.
 *  - `callbackUrl(name, ctx)`: a callback's URL, by evaluating its OpenAPI
 *    runtime expression (`{$request.body#/callbackUrl}`) against the request
 *    that registered it.
 *
 * Keyed by the webhook's NAME as a string (a callback is
 * `<operationId>.<callbackName>`), never turned into identifiers: a name is
 * whatever the spec author wrote, and one keyed object cannot collide with a
 * model the way a `NewPetPayload` per webhook could.
 */
import type { IrDocument } from '../core/ir'
import { usesBigInt } from '../core/walk'
import { type ValidatorName } from '../core/config'
import { schemaExpr, schemaRefs, schemaSpecifierFor } from './schema'
import { dialectOf } from './validator'
import { SourceFile, q, safeBlockComment } from './writer'

export const WEBHOOKS_FILE = 'webhooks.ts'

// A literal __proto__ key changes an object's prototype instead of declaring a field.
const objectKey = (name: string): string => (name === '__proto__' ? `[${q(name)}]` : q(name))

/** `webhooks.ts`, or `null` when the spec declares no webhook or callback. */
export function emitWebhooks(doc: IrDocument, validator: ValidatorName): SourceFile | null {
  const hooks = doc.webhooks ?? []
  if (hooks.length === 0) return null
  const dialect = dialectOf(validator)
  const f = new SourceFile(WEBHOOKS_FILE)
  const refs = new Set<string>()
  for (const w of hooks) if (w.payload) schemaRefs(w.payload, refs)
  for (const name of [...refs].sort()) f.import(schemaSpecifierFor(WEBHOOKS_FILE, name, doc), name)
  const withPayload = hooks.filter((w) => w.payload !== undefined)
  const exprs = withPayload.map((w) =>
    schemaExpr(w.payload as NonNullable<typeof w.payload>, {
      native: false,
      validator,
      lossless: usesBigInt(doc),
    }),
  )
  if (exprs.some((e) => new RegExp(`\\b${dialect.binding}\\.`).test(e)))
    f.import(dialect.module, dialect.binding)
  const infer = (t: string): string =>
    dialect.typeHelper ? `${dialect.typeHelper.name}<${t}>` : `${dialect.binding}.infer<${t}>`
  if (dialect.typeHelper) f.importType(dialect.typeHelper.module, dialect.typeHelper.name)
  else if (!exprs.some((e) => new RegExp(`\\b${dialect.binding}\\.`).test(e)))
    f.importType(dialect.module, dialect.binding)
  f.line()
  f.doc(
    'Schemas for the payloads this API SENDS (webhooks and callbacks), keyed by name.',
    "Validate an incoming body with `webhookSchemas[name]['~standard'].validate(body)`.",
  )
  f.line('export const webhookSchemas = {')
  withPayload.forEach((w, i) => {
    const describe = [
      w.kind === 'callback'
        ? `Callback \`${w.method}\`${w.expression ? ` to \`${w.expression}\`` : ''}`
        : `Webhook \`${w.method}\``,
      w.summary,
    ].filter(Boolean)
    f.line(`  /** ${safeBlockComment(describe.join(' — ').replace(/\s+/g, ' '))} */`)
    f.line(`  ${objectKey(w.name)}: ${exprs[i]},`)
  })
  f.line('} as const')
  f.line()
  f.doc('The payload of each webhook / callback — `undefined` for one that sends no body.')
  f.line('export interface WebhookPayloads {')
  for (const w of hooks) {
    f.line(
      `  ${q(w.name)}: ${w.payload ? infer(`typeof webhookSchemas[${q(w.name)}]`) : 'undefined'}`,
    )
  }
  f.line('}')
  f.line()
  f.doc('A handler for one webhook or callback, typed by its payload.')
  f.line(
    'export type WebhookHandler<K extends keyof WebhookPayloads> = (payload: WebhookPayloads[K]) => void | Promise<void>',
  )
  f.line()
  f.line("/** How each webhook / callback is sent: its method, and its body's media type. */")
  f.line(
    'const webhookRequests: { readonly [K in keyof WebhookPayloads]: { readonly method: string; readonly media: string | undefined } } = {',
  )
  for (const w of hooks)
    f.line(
      `  ${objectKey(w.name)}: { method: ${q(w.method)}, media: ${w.mediaType !== undefined && w.payload !== undefined ? q(w.mediaType) : 'undefined'} },`,
    )
  f.line('}')
  f.lines(...WEBHOOK_RUNTIME)
  const callbacks = hooks.filter((w) => w.kind === 'callback' && w.expression !== undefined)
  if (callbacks.length > 0) {
    f.line()
    f.doc(
      "Each callback's URL, as the spec declares it: an OpenAPI runtime expression",
      '(`{$request.body#/callbackUrl}`), resolved by {@link callbackUrl}.',
    )
    f.line('export const callbackUrls = {')
    for (const w of callbacks) f.line(`  ${objectKey(w.name)}: ${q(w.expression as string)},`)
    f.line('} as const')
    f.lines(...CALLBACK_RUNTIME)
  }
  return f
}

/**
 * The framework-agnostic receiving side, emitted verbatim (it depends only on
 * `webhookSchemas` and `webhookRequests` above). Everything is standard fetch:
 * `Request`, `Response`, `URLSearchParams`, `TextDecoder`.
 */
const WEBHOOK_RUNTIME: readonly string[] = [
  '',
  "/** One problem with a payload, in Standard Schema's shape. */",
  'export interface WebhookIssue {',
  '  readonly message: string',
  '  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined',
  '}',
  '',
  '/** The outcome of {@link validateWebhook}. */',
  'export type WebhookValidation<K extends keyof WebhookPayloads> =',
  '  | { readonly ok: true; readonly value: WebhookPayloads[K] }',
  '  | { readonly ok: false; readonly issues: readonly WebhookIssue[] }',
  '',
  'interface StandardLike {',
  '  readonly "~standard": {',
  '    validate(value: unknown): StandardResult | Promise<StandardResult>',
  '  }',
  '}',
  'type StandardResult = { readonly value?: unknown; readonly issues?: readonly WebhookIssue[] | undefined }',
  '',
  '/**',
  " * Validate an incoming body against the webhook's schema. A webhook that",
  ' * declares no body validates to `undefined`.',
  ' */',
  'export async function validateWebhook<K extends keyof WebhookPayloads>(name: K, body: unknown): Promise<WebhookValidation<K>> {',
  '  const schemas: Readonly<Record<string, StandardLike | undefined>> = webhookSchemas',
  '  const schema = Object.hasOwn(schemas, name) ? schemas[name] : undefined',
  '  if (!schema) return { ok: true, value: undefined as unknown as WebhookPayloads[K] }',
  '  const result = await schema["~standard"].validate(body)',
  '  return result.issues ? { ok: false, issues: result.issues } : { ok: true, value: result.value as WebhookPayloads[K] }',
  '}',
  '',
  '/** What {@link webhookHandler} hands `verify` and each handler. */',
  'export interface WebhookRequestContext {',
  '  readonly request: Request',
  '  /** The body exactly as received — what a signature is computed over. */',
  '  readonly bytes: Uint8Array',
  '  /** The same bytes, decoded as UTF-8. */',
  '  readonly rawBody: string',
  '}',
  '',
  '/**',
  ' * Handlers by webhook / callback name. Return nothing for a `204`, or a',
  " * `Response` to answer with it. A throw propagates, so the framework's own",
  ' * error handling (and its 500) applies.',
  ' */',
  'export type WebhookHandlers = {',
  '  readonly [K in keyof WebhookPayloads]?: (',
  '    payload: WebhookPayloads[K],',
  '    context: WebhookRequestContext & { readonly name: K },',
  '  ) => void | Response | Promise<void | Response>',
  '}',
  '',
  'export interface WebhookHandlerOptions {',
  '  /** Maximum incoming body size in bytes, enforced while reading. Default 1 MiB. */',
  '  bodyLimit?: number | undefined',
  '  /**',
  '   * Authenticate the request BEFORE its body is parsed — a signature, a',
  '   * shared secret, an allow-listed source. Return `false` (or throw) to',
  "   * answer `401`. Lathe does not guess a vendor's signing scheme: compute",
  '   * the HMAC (or whatever the sender documents) over `bytes` here.',
  '   */',
  '  verify?: ((context: WebhookRequestContext) => boolean | Promise<boolean>) | undefined',
  '  /**',
  '   * Which webhook a request is, when one endpoint receives several — from a',
  '   * header (`x-github-event`) or a body field (`type`). Required when more',
  '   * than one handler is registered; `undefined` answers `404`.',
  '   */',
  '  event?:',
  '    | ((request: Request, body: unknown) => keyof WebhookPayloads | undefined | Promise<keyof WebhookPayloads | undefined>)',
  '    | undefined',
  '}',
  '',
  "/** A fetch `Request`, or anything carrying one (zero's API-route context). */",
  'export type WebhookInput = Request | { readonly request: Request }',
  '',
  'function webhookReply(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {',
  '  return new Response(JSON.stringify({ error, ...extra }), {',
  '    status,',
  '    headers: { "content-type": "application/json", ...headers },',
  '  })',
  '}',
  '',
  'async function readWebhookBody(request: Request, limit: number): Promise<ArrayBuffer | Response> {',
  '  const length = request.headers.get("content-length")',
  '  if (length !== null && Number(length) > limit) {',
  '    await request.body?.cancel().catch(() => undefined)',
  '    return webhookReply(413, "webhook body exceeds bodyLimit")',
  '  }',
  '  if (!request.body) return new ArrayBuffer(0)',
  '  const reader = request.body.getReader()',
  '  const chunks: Uint8Array[] = []',
  '  let total = 0',
  '  try {',
  '    while (true) {',
  '      const { done, value } = await reader.read()',
  '      if (done) break',
  '      total += value.byteLength',
  '      if (total > limit) {',
  '        await reader.cancel().catch(() => undefined)',
  '        return webhookReply(413, "webhook body exceeds bodyLimit")',
  '      }',
  '      chunks.push(value)',
  '    }',
  '  } finally {',
  '    reader.releaseLock()',
  '  }',
  '  const bytes = new Uint8Array(total)',
  '  let offset = 0',
  '  for (const chunk of chunks) {',
  '    bytes.set(chunk, offset)',
  '    offset += chunk.byteLength',
  '  }',
  '  return bytes.buffer',
  '}',
  '',
  '/** A body as its declared media type reads: JSON, a form, text, or a multipart form. */',
  'async function parseWebhookBody(buffer: ArrayBuffer, text: string, media: string | undefined, contentType: string | null): Promise<unknown> {',
  '  if (media === undefined) return undefined',
  '  const type = media.split(";")[0]?.trim().toLowerCase() ?? ""',
  '  if (type === "application/x-www-form-urlencoded") {',
  '    const out: Record<string, string | string[]> = Object.create(null)',
  '    for (const [k, v] of new URLSearchParams(text)) {',
  '      const prev = out[k]',
  '      out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]',
  '    }',
  '    return out',
  '  }',
  '  if (type === "multipart/form-data") {',
  '    const form = await new Response(buffer, { headers: { "content-type": contentType ?? type } }).formData()',
  '    const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = Object.create(null)',
  '    for (const [k, v] of form) {',
  '      const prev = out[k]',
  '      out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]',
  '    }',
  '    return out',
  '  }',
  '  if (type.startsWith("text/")) return text',
  '  if (type === "application/json" || type.endsWith("+json") || type === "*/*") return text === "" ? undefined : JSON.parse(text)',
  '  return new Uint8Array(buffer)',
  '}',
  '',
  '/**',
  ' * A fetch-style handler (`(Request | { request }) => Promise<Response>`) that',
  ' * verifies, parses, validates and dispatches incoming webhooks.',
  ' *',
  ' * Answers `401` when `verify` refuses, `400` for a body that does not parse,',
  ' * `413` when the body exceeds bodyLimit, `404` for an event with no handler,',
  ' * `405` for the wrong method (with',
  ' * `Allow`), `422` with the issues for an invalid payload, and `204` (or the',
  " * handler's own `Response`) otherwise.",
  ' *',
  ' * ```ts',
  ' * export const POST = webhookHandler(',
  ' *   { newPet: (pet) => save(pet), deletedPet: (e) => remove(e.id) },',
  ' *   { event: (req) => req.headers.get("x-event") as never, verify: ({ bytes, request }) => verifyHmac(bytes, request) },',
  ' * )',
  ' * ```',
  ' */',
  'export function webhookHandler(handlers: WebhookHandlers, options: WebhookHandlerOptions = {}): (input: WebhookInput) => Promise<Response> {',
  '  const names = (Object.keys(handlers) as Array<keyof WebhookPayloads>).filter((n) => handlers[n] !== undefined)',
  '  if (names.length === 0) throw new Error("webhookHandler: register at least one handler.")',
  '  for (const n of names) {',
  '    if (!Object.hasOwn(webhookRequests, n)) throw new Error(`webhookHandler: \\`${String(n)}\\` is not a webhook or callback this API declares.`)',
  '  }',
  '  const limit = options.bodyLimit ?? 1024 * 1024',
  '  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("webhookHandler: bodyLimit must be a non-negative safe integer.")',
  '  const pick = options.event',
  '  if (names.length > 1 && !pick) {',
  '    throw new Error(`webhookHandler: ${names.length} handlers need an \\`event\\` option to tell which one a request is for.`)',
  '  }',
  '  return async (input) => {',
  '    const request = input instanceof Request ? input : input.request',
  '    const incoming = await readWebhookBody(request, limit)',
  '    if (incoming instanceof Response) return incoming',
  '    const buffer = incoming',
  '    const bytes = new Uint8Array(buffer)',
  '    const rawBody = new TextDecoder().decode(bytes)',
  '    const context: WebhookRequestContext = { request, bytes, rawBody }',
  '    if (options.verify) {',
  '      let verified = false',
  '      try {',
  '        verified = (await options.verify(context)) === true',
  '      } catch {',
  '        verified = false',
  '      }',
  '      if (!verified) return webhookReply(401, "webhook verification failed")',
  '    }',
  '    // Parsed once per media type. Before the event is known, the body is read',
  '    // as the FIRST candidate declares, for `event` to inspect; a body that does',
  '    // not parse that way reaches `event` as `undefined` rather than failing,',
  '    // since the event it names may declare a different media type.',
  '    const parsed = new Map<string | undefined, { ok: true; value: unknown } | { ok: false }>()',
  '    const parse = async (media: string | undefined): Promise<{ ok: true; value: unknown } | { ok: false }> => {',
  '      const known = parsed.get(media)',
  '      if (known) return known',
  '      let result: { ok: true; value: unknown } | { ok: false }',
  '      try {',
  '        result = { ok: true, value: await parseWebhookBody(buffer, rawBody, media, request.headers.get("content-type")) }',
  '      } catch {',
  '        result = { ok: false }',
  '      }',
  '      parsed.set(media, result)',
  '      return result',
  '    }',
  '    const firstMedia = webhookRequests[names[0] as keyof WebhookPayloads].media',
  '    const early = await parse(firstMedia)',
  '    const name = pick ? await pick(request, early.ok ? early.value : undefined) : names[0]',
  '    const handler = name === undefined || !Object.hasOwn(handlers, name) ? undefined : handlers[name]',
  '    if (name === undefined || !handler) return webhookReply(404, `no handler for webhook ${JSON.stringify(name ?? null)}`)',
  '    const declared = webhookRequests[name]',
  '    if (request.method.toUpperCase() !== declared.method) {',
  '      return webhookReply(405, `webhook ${String(name)} is sent with ${declared.method}`, {}, { allow: declared.method })',
  '    }',
  '    const body = await parse(declared.media)',
  '    if (!body.ok) return webhookReply(400, `the body does not parse as ${declared.media ?? "its declared media type"}`)',
  '    const checked = await validateWebhook(name, body.value)',
  '    if (!checked.ok) return webhookReply(422, "invalid webhook payload", { issues: checked.issues })',
  '    const run = handler as (payload: unknown, context: WebhookRequestContext & { readonly name: typeof name }) => void | Response | Promise<void | Response>',
  '    const out = await run(checked.value, { ...context, name })',
  '    return out instanceof Response ? out : new Response(null, { status: 204 })',
  '  }',
  '}',
]

/**
 * The OpenAPI runtime-expression evaluator, emitted only for a spec with
 * callbacks. Grammar (OpenAPI 3.1 §Runtime Expressions): `$url`, `$method`,
 * `$statusCode`, and `$request.` / `$response.` followed by `header.<token>`,
 * `query.<name>`, `path.<name>` or `body` with an optional `#` JSON pointer.
 */
const CALLBACK_RUNTIME: readonly string[] = [
  '',
  'type HeaderSource = Headers | Readonly<Record<string, string | undefined>>',
  '',
  '/** The request (and response) a callback is being resolved against. */',
  'export interface RuntimeExpressionContext {',
  '  /** The full URL of the request that registered the callback. */',
  '  readonly url?: string | undefined',
  '  readonly method?: string | undefined',
  '  readonly statusCode?: number | undefined',
  '  readonly request?:',
  '    | {',
  '        readonly headers?: HeaderSource | undefined',
  '        /** Defaults to the query of `url`. */',
  '        readonly query?: URLSearchParams | Readonly<Record<string, string | undefined>> | undefined',
  '        readonly path?: Readonly<Record<string, string | undefined>> | undefined',
  '        readonly body?: unknown',
  '      }',
  '    | undefined',
  '  readonly response?: { readonly headers?: HeaderSource | undefined; readonly body?: unknown } | undefined',
  '}',
  '',
  'function headerOf(source: HeaderSource | undefined, name: string): string | undefined {',
  '  if (!source) return undefined',
  '  if (source instanceof Headers) return source.get(name) ?? undefined',
  '  const lower = name.toLowerCase()',
  '  for (const [k, v] of Object.entries(source)) if (k.toLowerCase() === lower) return v',
  '  return undefined',
  '}',
  '',
  'function pointerInto(value: unknown, pointer: string): unknown {',
  '  if (pointer === "") return value',
  '  if (!pointer.startsWith("/")) return undefined',
  '  let cur: unknown = value',
  '  for (const raw of pointer.slice(1).split("/")) {',
  '    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~")',
  '    if (cur === null || typeof cur !== "object") return undefined',
  '    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Record<string, unknown>)[key]',
  '  }',
  '  return cur',
  '}',
  '',
  '/**',
  ' * Evaluate one OpenAPI runtime expression (`$request.body#/callbackUrl`).',
  ' * `undefined` when it names something the context does not carry; an',
  ' * expression outside the grammar throws.',
  ' */',
  'export function evaluateRuntimeExpression(expression: string, context: RuntimeExpressionContext): unknown {',
  '  if (expression === "$url") return context.url',
  '  if (expression === "$method") return context.method',
  '  if (expression === "$statusCode") return context.statusCode',
  '  const m = /^\\$(request|response)\\.(header\\.|query\\.|path\\.|body)(.*)$/.exec(expression)',
  '  if (!m) throw new Error(`runtime expression: \\`${expression}\\` is not an OpenAPI runtime expression.`)',
  '  const side = m[1] === "request" ? context.request : context.response',
  '  const kind = m[2] as string',
  '  const rest = m[3] as string',
  '  if (kind === "header.") return headerOf(side?.headers, rest)',
  '  if (kind === "body") {',
  '    if (rest !== "" && !rest.startsWith("#")) throw new Error(`runtime expression: \\`${expression}\\` — a body reference is \\`body\\` or \\`body#/pointer\\`.`)',
  '    return pointerInto(side?.body, rest === "" ? "" : decodeURIComponent(rest.slice(1)))',
  '  }',
  '  if (m[1] === "response") throw new Error(`runtime expression: \\`${expression}\\` — a response has no ${kind.slice(0, -1)}.`)',
  '  const req = context.request',
  '  if (kind === "path.") return req?.path?.[rest]',
  '  const query = req?.query ?? (context.url !== undefined ? new URL(context.url, "http://x").searchParams : undefined)',
  '  if (!query) return undefined',
  '  return query instanceof URLSearchParams ? (query.get(rest) ?? undefined) : query[rest]',
  '}',
  '',
  '/**',
  ' * Expand a callback URL template: every `{$…}` is replaced by its value; a',
  ' * template that IS one bare expression (`$request.body#/url`) is evaluated',
  ' * whole. A value that is missing throws, naming the expression — a callback',
  ' * with nowhere to go is a bug in the registering request, not a URL.',
  ' */',
  'export function expandCallbackUrl(template: string, context: RuntimeExpressionContext): string {',
  '  const value = (expression: string): string => {',
  '    const v = evaluateRuntimeExpression(expression, context)',
  '    if (v === undefined || v === null || v === "") {',
  '      throw new Error(`callback URL: \\`${expression}\\` resolved to nothing in this request.`)',
  '    }',
  '    return typeof v === "object" ? JSON.stringify(v) : String(v)',
  '  }',
  '  if (template.startsWith("$") && !template.includes("{")) return value(template)',
  '  return template.replace(/\\{(\\$[^}]+)\\}/g, (_, expression: string) => value(expression))',
  '}',
  '',
  "/** A callback's URL, resolved against the request that registered it. */",
  'export function callbackUrl(name: keyof typeof callbackUrls, context: RuntimeExpressionContext): string {',
  '  return expandCallbackUrl(callbackUrls[name], context)',
  '}',
]
