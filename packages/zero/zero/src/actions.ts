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
 * Module-level registry of every `defineAction()` call. Lookup is by the
 * `action_<uuid>` string the client sends in `POST /_zero/actions/<id>`.
 *
 * **HMR caveat (dev-only):** the registry uses fresh `crypto.randomUUID()`
 * per `defineAction()` invocation. When Vite hot-replaces a module that
 * calls `defineAction()`, the module re-runs and a NEW entry is inserted
 * — the OLD entry stays in the Map until the dev process exits. Each
 * entry holds `{ id, handler }` (~80 bytes). Bounded by the count of
 * distinct UUIDs minted in the session; a realistic dev session sees
 * <50 entries, so total dev-memory cost stays under ~5KB. Production
 * registers each module exactly once at startup — no leak. A
 * FinalizationRegistry-based purge is tracked as a follow-up; the
 * current cost is too small to justify the WeakRef/finalizer complexity.
 */
const actionRegistry = new Map<string, RegisteredAction>()

/**
 * Define a server action. Returns a callable function that:
 * - On the **client**: sends a POST request to `/_zero/actions/<id>`
 * - On the **server** (SSR): executes the handler directly (no fetch)
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
  const id = `action_${crypto.randomUUID().slice(0, 8)}`

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

    // Client-side: POST to the action endpoint
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

  callable.actionId = id
  return callable as Action<T>
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
}

// ─── Server handler ──────────────────────────────────────────────────────────

/**
 * Create a middleware that handles action requests at `/_zero/actions/*`.
 * Mount this before the SSR handler in the server entry.
 */
export function createActionMiddleware(): (
  ctx: MiddlewareContext,
) => Response | undefined | Promise<Response | undefined> {
  return async (ctx: MiddlewareContext) => {
    if (!ctx.path.startsWith('/_zero/actions/')) return

    const actionId = ctx.path.slice('/_zero/actions/'.length)
    const action = actionRegistry.get(actionId)

    if (!action) {
      return Response.json({ error: 'Action not found' }, { status: 404 })
    }

    if (ctx.req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
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
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Execute the user-supplied action handler. Surface errors to server
  // logs via `console.error` — the cloud adapter audit (PR #755) found
  // this same swallow-error pattern hiding production crashes from
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
    console.error('[Pyreon Action] handler failed:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return Response.json({ error: message }, { status: 500 })
  }
}
