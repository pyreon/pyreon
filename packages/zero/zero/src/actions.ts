import type { MiddlewareContext } from "@pyreon/server"

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

const actionRegistry = new Map<string, RegisteredAction>()
let actionCounter = 0

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
  const id = `action_${actionCounter++}`

  actionRegistry.set(id, { id, handler: handler as ActionHandler })

  const callable = async (data?: unknown): Promise<T> => {
    // Server-side: execute handler directly (no network round-trip)
    if (typeof globalThis.window === "undefined") {
      return handler({
        request: new Request(`http://localhost/_zero/actions/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data ?? null),
        }),
        formData: null,
        json: data ?? null,
        headers: new Headers({ "Content-Type": "application/json" }),
      })
    }

    // Client-side: POST to the action endpoint
    const response = await fetch(`/_zero/actions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  actionCounter = 0
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
    if (!ctx.path.startsWith("/_zero/actions/")) return

    const actionId = ctx.path.slice("/_zero/actions/".length)
    const action = actionRegistry.get(actionId)

    if (!action) {
      return Response.json({ error: "Action not found" }, { status: 404 })
    }

    if (ctx.req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 })
    }

    return executeAction(action, ctx.req)
  }
}

async function executeAction(action: RegisteredAction, req: Request): Promise<Response> {
  try {
    const contentType = req.headers.get("content-type") ?? ""
    let formData: FormData | null = null
    let json: unknown = null

    if (contentType.includes("application/json")) {
      json = await req.json()
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      formData = await req.formData()
    }

    const result = await action.handler({
      request: req,
      formData,
      json,
      headers: req.headers,
    })

    return Response.json(result ?? null)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return Response.json({ error: message }, { status: 500 })
  }
}
