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

// ─── Server handler ──────────────────────────────────────────────────────────

export interface CreateActionMiddlewareOptions {
  /**
   * Origins (scheme + host + optional port) allowed to POST to
   * `/_zero/actions/*` cross-origin. Default: same-origin only.
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
   * the client bundle and trivially discoverable).
   */
  corsOrigins?: readonly string[]
}

/**
 * Create a middleware that handles action requests at `/_zero/actions/*`.
 * Mount this before the SSR handler in the server entry.
 *
 * **Security baseline**: every cross-origin POST is rejected with HTTP 403
 * by default. Use `corsOrigins` to opt in to specific cross-origin callers.
 * Without this check, any malicious origin a logged-in user visits can
 * forge POSTs to any defined action (CSRF).
 *
 * This is **defense in depth** for the basic case. For higher assurance:
 *   1. Set `SameSite=Strict` (or `Lax`) on your auth cookies
 *   2. Wire your auth middleware BEFORE `createActionMiddleware()` so the
 *      action handler can read authenticated user state.
 *   3. Per-session CSRF tokens + encrypted action IDs (Next.js-style)
 *      are tracked as follow-up work.
 */
export function createActionMiddleware(
  options?: CreateActionMiddlewareOptions,
): (
  ctx: MiddlewareContext,
) => Response | undefined | Promise<Response | undefined> {
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

    // ── CSRF baseline: Origin / Referer same-origin check ────────────────────
    // Without this, any malicious origin a logged-in user visits can forge
    // POSTs to /_zero/actions/<id>. Action IDs are bundled in client JS
    // so they are trivially discoverable via DevTools / source inspection.
    //
    // Algorithm:
    //   - If neither Origin nor Referer is present → ALLOW. Same-origin
    //     fetch() / form submit without credentials AND server-to-server
    //     tools (curl, integration tests) often omit Origin; rejecting
    //     here would break legitimate usage. The auth layer is responsible
    //     for the "is this a logged-in user?" check; the CSRF baseline is
    //     "did this request come from a browser tab on an attacker's origin?".
    //   - If Origin/Referer is present → PARSE it and require its ORIGIN to
    //     equal the request's own origin, or to be one of the opt-in
    //     `corsOrigins` entries. Equality, never a prefix: `startsWith`
    //     accepts `https://app.example.com.evil.net`, `...comevil.net` and
    //     `https://app.example.com@evil.net` (userinfo), all of which are
    //     attacker-controlled origins. A `Referer` is a full URL, so it is
    //     reduced to its origin the same way.
    //   - An unparseable header (including the literal `null` a sandboxed
    //     iframe sends) yields no origin → 403.
    //   - Otherwise → 403.
    const headerOrigin = ctx.req.headers.get('origin') ?? ctx.req.headers.get('referer')
    if (headerOrigin) {
      const origin = originOf(headerOrigin)
      const sameOrigin = origin !== null && origin === new URL(ctx.req.url).origin
      const allowedCrossOrigin = origin !== null && corsOrigins.includes(origin)
      if (!sameOrigin && !allowedCrossOrigin) {
        return Response.json(
          {
            error:
              'Server action rejected: Origin not allowed. ' +
              'Cross-origin POSTs to /_zero/actions/* require an explicit ' +
              '`corsOrigins` entry in createActionMiddleware().',
            origin: headerOrigin,
          },
          { status: 403 },
        )
      }
    }

    return executeAction(action, ctx.req)
  }
}

async function executeAction(action: RegisteredAction, req: Request): Promise<Response> {
  // Parse the request payload separately so a malformed body returns
  // 400 (Bad Request) instead of being conflated with a runtime 500.
  // `req.json()` / `req.formData()` throw on syntactically invalid
  // payloads (truncated JSON, malformed multipart, invalid UTF-8, etc.)
  // — that's a client problem, not a server problem, and the HTTP
  // status code should reflect that.
  const contentType = req.headers.get('content-type') ?? ''
  let formData: FormData | null = null
  let json: unknown = null
  try {
    if (contentType.includes('application/json')) {
      json = await req.json()
    } else if (
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      formData = await req.formData()
    }
  } catch (err) {
    // Malformed request body — log for ops diagnostics but return 400
    // (not 500) so the client sees the right status code. Don't leak
    // the parser's internal error message; surface only the shape.
    console.error('[Pyreon Action] failed to parse request body:', err)
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400 },
    )
  }

  // Execute the user-supplied action handler. Surface errors to server
  // logs via `console.error` — the cloud-adapter audit found this
  // same swallow-error pattern hiding production crashes from
  // operators. Without it, a CMS-triggered action that crashed inside
  // the user's handler returned a generic 500 to the client AND
  // logged nothing on the server side, so the operator couldn't
  // diagnose the failure.
  try {
    const result = await action.handler({
      request: req,
      formData,
      json,
      headers: req.headers,
    })
    return Response.json(result ?? null)
  } catch (err) {
    // Log the real error for operators; return a GENERIC message to the
    // client in production. `err.message` routinely carries connection
    // strings, credentials and internal hostnames ("pg: password
    // authentication failed for user ..."), and the client has no claim
    // on it — exactly the reasoning the body-parse arm above already
    // applies. Outside production the detail is kept, because that is
    // where a developer is reading the response.
    console.error('[Pyreon Action] handler failed:', err)
    const isProduction = process.env.NODE_ENV === 'production'
    const message =
      isProduction || !(err instanceof Error) ? 'Internal server error' : err.message
    return Response.json({ error: message }, { status: 500 })
  }
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
