import { getRedirectInfo, safeRedirectLocation } from '@pyreon/router'
import type { MiddlewareContext } from '@pyreon/server'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Context passed to server action handlers. */
export interface ActionContext {
  /** The original request. */
  request: Request
  /** Parsed form data (for form submissions). */
  formData: FormData | null
  /** Parsed JSON body (for JSON submissions). */
  json: unknown
  /** Request headers. */
  headers: Headers
}

/** A server action handler function. */
export type ActionHandler<T = unknown> = (ctx: ActionContext) => T | Promise<T>

/** A registered action with its ID and handler. */
interface RegisteredAction {
  id: string
  handler: ActionHandler
}

/** Client-side callable action returned by defineAction. */
export interface Action<T = unknown> {
  /** Call the action with JSON data. */
  (data?: unknown): Promise<T>
  /** The action's unique ID. */
  actionId: string
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Module-level registry of every server action, keyed by the id the client
 * sends in `POST /_zero/actions/<id>`.
 *
 * Ids are DETERMINISTIC: zero's Vite plugin derives each one at build time
 * from the defining module's path + binding name (see
 * `actions-transform.ts`), so the client bundle and the server bundle agree
 * on it, and an HMR re-run of the same module overwrites its own entry
 * instead of adding a new one. Bounded by the number of `defineAction()`
 * call sites in the app.
 */
/** Response header carrying an action's `redirect()` target. @internal */
export const ACTION_REDIRECT_HEADER = 'X-Zero-Redirect'

const actionRegistry = new Map<string, RegisteredAction>()

let warnedPluginless = false

/**
 * Define a server action. Returns a callable function that:
 * - On the **client**: sends a POST request to `/_zero/actions/<id>`
 * - On the **server** (SSR): executes the handler directly (no fetch)
 *
 * Requires zero's Vite plugin (`zero()` in `vite.config.ts`), which gives
 * each action an id that is identical in the client and server bundles and
 * removes the handler body from the client bundle. Without the plugin the
 * id is random per bundle, so a client call can never reach the server's
 * handler: in a browser that is an error in production and a warning in
 * development. Server-only use (tests, scripts) works without the plugin.
 *
 * @example
 * // In a route file or module:
 * export const createPost = defineAction(async (ctx) => {
 *   const data = ctx.json as { title: string; body: string }
 *   // ... save to database
 *   return { success: true, id: 123 }
 * })
 *
 * // In a component:
 * const result = await createPost({ title: 'Hello', body: '...' })
 */
export function defineAction<T = unknown>(handler: ActionHandler<T>): Action<T> {
  // Reaching this function means the plugin did NOT rewrite the call.
  if (typeof globalThis.window !== 'undefined') {
    const message =
      '[Pyreon] defineAction() ran in the browser without zero\'s Vite plugin, so its action id ' +
      'is random and cannot match the server bundle — every call would 404. Add `zero()` to ' +
      'the `plugins` of your vite.config.ts, and import defineAction from "@pyreon/zero/actions".'
    if (process.env.NODE_ENV === 'production') throw new Error(message)
    if (!warnedPluginless) {
      warnedPluginless = true
      console.warn(message)
    }
  }
  return _defineActionWithId(`action_${crypto.randomUUID()}`, handler)
}

/**
 * `defineAction` with the id supplied — the SERVER-side form zero's Vite
 * plugin rewrites `defineAction(handler)` into.
 *
 * @internal
 */
export function _defineActionWithId<T = unknown>(
  id: string,
  handler: ActionHandler<T>,
): Action<T> {
  actionRegistry.set(id, { id, handler: handler as ActionHandler })

  const callable = async (data?: unknown): Promise<T> => {
    // Server-side: execute handler directly (no network round-trip)
    if (typeof globalThis.window === 'undefined') {
      return handler({
        request: new Request(`http://localhost/_zero/actions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data ?? null),
        }),
        formData: null,
        json: data ?? null,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    }
    return postAction<T>(id, data)
  }

  callable.actionId = id
  return callable as Action<T>
}

/**
 * The CLIENT-side form zero's Vite plugin rewrites `defineAction(handler)`
 * into: only the id survives, so the handler body (and whatever it
 * closes over) never ships to the browser.
 *
 * @internal
 */
export function _actionStub<T = unknown>(id: string): Action<T> {
  const callable = (data?: unknown): Promise<T> => postAction<T>(id, data)
  callable.actionId = id
  return callable as Action<T>
}

async function postAction<T>(id: string, data: unknown): Promise<T> {
  const response = await fetch(`/_zero/actions/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? null),
  })
  const redirectTo = response.headers.get(ACTION_REDIRECT_HEADER)
  if (redirectTo !== null) {
    globalThis.location.assign(redirectTo)
    return null as T
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Action failed: ${response.statusText}`)
  }
  return response.json()
}

/** Get all registered actions. Useful for testing. */
export function getRegisteredActions(): Map<string, RegisteredAction> {
  return actionRegistry
}

/**
 * Reset the action registry. Useful for testing.
 * @internal
 */
export function _resetActions(): void {
  actionRegistry.clear()
  warnedPluginless = false
}

// ─── Results: fail() ────────────────────────────────────────────────────────

const FAIL = Symbol.for('pyreon.zero.actionFailure')

/**
 * An expected, user-facing failure returned from an action handler — a
 * validation error, a conflict. Build it with {@link fail}.
 */
export interface ActionFailure<D = unknown> {
  readonly [FAIL]: true
  /** HTTP status of the response (4xx). */
  readonly status: number
  /** Data handed to the page (`useSubmission(action).result()`). */
  readonly data: D
}

/**
 * The data a page sees for an action whose handler returns `T`: a
 * {@link fail} result is unwrapped to its `data`.
 */
export type ActionData<T> = T extends ActionFailure<infer D> ? D : T

/**
 * Return an expected failure from an action handler. The page re-renders
 * (no-JS form post) or the submission settles (enhanced `<Form>`) with
 * `data` as the result and `status` as the HTTP status — unlike a thrown
 * error, which is a 500 and never exposes its message in production.
 *
 * @example
 * export const action = defineAction(async ({ formData }) => {
 *   const title = String(formData?.get('title') ?? '')
 *   if (!title) return fail(422, { error: 'Title is required', title })
 *   await db.posts.insert({ title })
 *   throw redirect('/posts')
 * })
 */
export function fail<D>(status: number, data: D): ActionFailure<D> {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new Error(
      `[Pyreon] fail(${status}, …): the status must be an HTTP error status (400-599). ` +
        'Return plain data for a success, or throw redirect() to navigate.',
    )
  }
  return { [FAIL]: true, status, data }
}

/** Is `value` a {@link fail} result? */
export function isActionFailure(value: unknown): value is ActionFailure {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[FAIL] === true
}

// ─── Server handler ──────────────────────────────────────────────────────────

/** Default request-body cap for action requests: 1 MiB. */
export const DEFAULT_ACTION_BODY_LIMIT = 1024 * 1024

export interface CreateActionMiddlewareOptions {
  /**
   * Origins (scheme + host + optional port) allowed to POST to actions
   * cross-origin. Default: same-origin only.
   *
   * Each entry is an ORIGIN and is matched by EXACT EQUALITY against the
   * origin the request's `Origin` header carries (a `Referer` is first
   * reduced to its own origin). Example: `['https://admin.example.com']`
   * allows POSTs from any URL under that origin — and ONLY that origin.
   * A prefix match would accept `https://admin.example.com.evil.net`,
   * so it is deliberately not used; write the full scheme + host (+ port).
   * Entries are normalized to their origin at construction, so a trailing
   * slash or an explicit default port is fine; an entry that is not a
   * parseable absolute URL is dropped with a warning.
   *
   * Without this opt-in, any cross-origin POST is rejected with HTTP 403.
   * This is the CSRF baseline: a malicious origin that a logged-in user
   * visits can otherwise POST to any defined action (action IDs are in
   * the client bundle and trivially discoverable). The same check guards
   * both `/_zero/actions/*` and page form posts.
   */
  corsOrigins?: readonly string[]
  /**
   * Maximum request-body size in bytes for an action request (JSON, form
   * or multipart). Larger bodies are rejected with HTTP 413 before the
   * handler runs — checked against `Content-Length` AND enforced while
   * reading, so a missing or lying header cannot bypass it.
   * Default {@link DEFAULT_ACTION_BODY_LIMIT} (1 MiB); raise it for uploads.
   */
  bodyLimit?: number
}

/** Normalized options shared by the JSON endpoint and page form posts. @internal */
export interface ResolvedActionOptions {
  corsOrigins: readonly string[]
  bodyLimit: number
}

/** @internal */
export function resolveActionOptions(options?: CreateActionMiddlewareOptions): ResolvedActionOptions {
  // Normalize the allowlist ONCE, at construction. Entries are written by
  // hand, so `https://admin.example.com/` (trailing slash) and a default
  // port are both plausible spellings of the same origin — and since the
  // match below is equality, an unnormalized entry would silently never
  // fire. An entry that is not a parseable absolute URL is dropped with a
  // warning rather than sitting in the list matching nothing.
  const corsOrigins = (options?.corsOrigins ?? []).flatMap((entry) => {
    const origin = originOf(entry)
    if (origin === null || origin === 'null') {
      console.warn(
        `[Pyreon] createActionMiddleware: ignoring corsOrigins entry ${JSON.stringify(entry)} — ` +
          'not a parseable origin. Write the full scheme + host (+ port), e.g. "https://admin.example.com".',
      )
      return []
    }
    return [origin]
  })
  const limit = options?.bodyLimit
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
    throw new Error(
      `[Pyreon] actions.bodyLimit must be a non-negative number of bytes, got ${String(limit)}.`,
    )
  }
  return { corsOrigins, bodyLimit: limit ?? DEFAULT_ACTION_BODY_LIMIT }
}

/**
 * CSRF baseline: Origin / Referer same-origin check. Returns the reason
 * string when the request must be rejected, `null` when it may proceed.
 *
 * Algorithm:
 *   - Neither Origin nor Referer present → ALLOW. Same-origin fetch()
 *     without credentials and server-to-server tools (curl, integration
 *     tests) often omit both; the auth layer owns "is this a logged-in
 *     user?". The baseline answers "did this come from a browser tab on an
 *     attacker's origin?" — and browsers always send `Origin` on a
 *     cross-origin POST, form submissions included.
 *   - Otherwise PARSE it and require its ORIGIN to equal the request's own
 *     origin, or be an opt-in `corsOrigins` entry. Equality, never a
 *     prefix: `startsWith` accepts `https://app.example.com.evil.net` and
 *     `https://app.example.com@evil.net`. A `Referer` is reduced to its
 *     origin the same way.
 *   - An unparseable header (including the literal `null` a sandboxed
 *     iframe sends) yields no origin → rejected.
 *
 * @internal
 */
export function checkActionOrigin(req: Request, corsOrigins: readonly string[]): string | null {
  const headerOrigin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!headerOrigin) return null
  const origin = originOf(headerOrigin)
  const sameOrigin = origin !== null && origin === new URL(req.url).origin
  const allowedCrossOrigin = origin !== null && corsOrigins.includes(origin)
  return sameOrigin || allowedCrossOrigin ? null : headerOrigin
}

/** Parsed action request payload. @internal */
export interface ActionPayload {
  formData: FormData | null
  json: unknown
}

/**
 * Read the request body under `limit` bytes and parse it. Returns an error
 * `Response` (413 / 400) instead of a payload when the body is refused.
 *
 * The limit is enforced twice: `Content-Length` rejects early without
 * reading, and the stream is counted while reading, because the header is
 * optional (chunked uploads) and client-controlled.
 *
 * @internal
 */
export async function readActionPayload(
  req: Request,
  limit: number,
  asJsonError = true,
): Promise<ActionPayload | Response> {
  const tooLarge = (): Response =>
    asJsonError
      ? Response.json({ error: 'Request body too large' }, { status: 413 })
      : new Response('Payload Too Large', { status: 413, headers: { 'Content-Type': 'text/plain' } })

  const declared = req.headers.get('content-length')
  if (declared !== null && Number(declared) > limit) return tooLarge()

  let bytes: Uint8Array<ArrayBuffer>
  if (!req.body) {
    bytes = new Uint8Array(0)
  } else {
    const reader = req.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return tooLarge()
      }
      chunks.push(value)
    }
    bytes = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      bytes.set(c, offset)
      offset += c.byteLength
    }
  }

  // Parse separately so a malformed body is a 400 (client problem), not a
  // 500. The parser's own message is logged, never returned.
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      return { formData: null, json: bytes.byteLength === 0 ? null : JSON.parse(new TextDecoder().decode(bytes)) }
    }
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData()
      return { formData, json: null }
    }
    return { formData: null, json: null }
  } catch (err) {
    console.error('[Pyreon Action] failed to parse request body:', err)
    return asJsonError
      ? Response.json({ error: 'Invalid request body' }, { status: 400 })
      : new Response('Bad Request', { status: 400, headers: { 'Content-Type': 'text/plain' } })
  }
}

/** What running an action produced. @internal */
export type ActionOutcome =
  | { kind: 'data'; status: number; data: unknown }
  | { kind: 'redirect'; status: number; to: string }
  | { kind: 'error'; message: string }

/**
 * Run a handler and classify the result: plain data, a {@link fail}
 * result, a thrown or returned `redirect()`, or an unexpected error (logged;
 * its message kept only outside production — it routinely carries
 * connection strings and hostnames the client has no claim on).
 *
 * @internal
 */
export async function runActionHandler(
  handler: ActionHandler,
  req: Request,
  payload: ActionPayload,
): Promise<ActionOutcome> {
  try {
    const result = await handler({ request: req, formData: payload.formData, json: payload.json, headers: req.headers })
    if (isActionFailure(result)) return { kind: 'data', status: result.status, data: result.data }
    const returned = getRedirectInfo(result)
    if (returned) return { kind: 'redirect', status: returned.status, to: returned.url }
    return { kind: 'data', status: 200, data: result ?? null }
  } catch (err) {
    const info = getRedirectInfo(err)
    if (info) return { kind: 'redirect', status: info.status, to: info.url }
    console.error('[Pyreon Action] handler failed:', err)
    const isProduction = process.env.NODE_ENV === 'production'
    return { kind: 'error', message: isProduction || !(err instanceof Error) ? 'Internal server error' : err.message }
  }
}

/**
 * Create a middleware that handles action requests at `/_zero/actions/*`.
 * `createServer` mounts it for you; mount it manually only with
 * `actions: false`.
 *
 * **Security baseline**: every cross-origin POST is rejected with HTTP 403
 * by default (`corsOrigins` opts specific origins in), and bodies over
 * `bodyLimit` (1 MiB) are rejected with 413.
 *
 * For higher assurance:
 *   1. Set `SameSite=Strict` (or `Lax`) on your auth cookies
 *   2. Wire your auth middleware BEFORE this one so the handler can read
 *      authenticated user state.
 *   3. Per-session CSRF tokens + encrypted action IDs (Next.js-style)
 *      are tracked as follow-up work.
 */
export function createActionMiddleware(
  options?: CreateActionMiddlewareOptions,
): (
  ctx: MiddlewareContext,
) => Response | undefined | Promise<Response | undefined> {
  const resolved = resolveActionOptions(options)
  return async (ctx: MiddlewareContext) => {
    // Pathname only — `ctx.path` carries the query string, which would be
    // glued onto the action id.
    const pathname = ctx.url.pathname
    if (!pathname.startsWith('/_zero/actions/')) return

    const actionId = pathname.slice('/_zero/actions/'.length)
    const action = actionRegistry.get(actionId)

    if (!action) {
      return Response.json({ error: 'Action not found' }, { status: 404 })
    }

    if (ctx.req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const rejectedOrigin = checkActionOrigin(ctx.req, resolved.corsOrigins)
    if (rejectedOrigin !== null) {
      return Response.json(
        {
          error:
            'Server action rejected: Origin not allowed. ' +
            'Cross-origin POSTs to /_zero/actions/* require an explicit ' +
            '`corsOrigins` entry in createActionMiddleware().',
          origin: rejectedOrigin,
        },
        { status: 403 },
      )
    }

    const payload = await readActionPayload(ctx.req, resolved.bodyLimit)
    if (payload instanceof Response) return payload

    const outcome = await runActionHandler(action.handler, ctx.req, payload)
    if (outcome.kind === 'error') return Response.json({ error: outcome.message }, { status: 500 })
    if (outcome.kind === 'redirect') {
      // A fetch() would silently FOLLOW a 3xx and hand the caller the target
      // page's HTML, so a redirect travels as a header the client acts on.
      return new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json', [ACTION_REDIRECT_HEADER]: safeRedirectLocation(outcome.to) },
      })
    }
    return Response.json(outcome.data, { status: outcome.status })
  }
}

/** @internal Look up a registered action by id. */
export function _getAction(id: string): RegisteredAction | undefined {
  return actionRegistry.get(id)
}

/**
 * Reduce an `Origin` or `Referer` header value to its ORIGIN
 * (scheme + host + port), or `null` when it is not a parseable absolute URL.
 *
 * The `null` return is load-bearing: a caller must treat "no origin" as
 * "not allowed", never as "same origin".
 */
function originOf(headerValue: string): string | null {
  try {
    return new URL(headerValue).origin
  } catch {
    return null
  }
}
export * from './form'
