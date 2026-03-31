/**
 * SSR middleware — simple request processing pipeline.
 *
 * Middleware runs before rendering. Return a Response to short-circuit
 * (e.g. for redirects, auth checks, or static file serving).
 * Return void / undefined to continue to the next middleware or rendering.
 *
 * @example
 * const authMiddleware: Middleware = async (ctx) => {
 *   const token = ctx.req.headers.get("Authorization")
 *   if (!token) return new Response("Unauthorized", { status: 401 })
 *   ctx.locals.user = await verifyToken(token)
 * }
 *
 * const handler = createHandler({
 *   App,
 *   routes,
 *   middleware: [authMiddleware],
 * })
 */

import { createContext, useContext, provide } from '@pyreon/core'

export interface MiddlewareContext {
  /** The incoming request */
  req: Request
  /** Parsed URL */
  url: URL
  /** Pathname + search (passed to router) */
  path: string
  /** Response headers — middleware can set custom headers */
  headers: Headers
  /** Arbitrary per-request data shared between middleware and components */
  locals: Record<string, unknown>
}

/**
 * Middleware function. Return a Response to short-circuit, or void to continue.
 */
export type Middleware = (ctx: MiddlewareContext) => Response | void | Promise<Response | void>

/**
 * Context for per-request locals — populated by the SSR handler from
 * middleware `ctx.locals`. Components access it via `useRequestLocals()`.
 *
 * This bridges the middleware → component gap: middleware sets `ctx.locals`,
 * the handler provides it into the Pyreon context system, and components
 * read it without coupling to the middleware layer.
 */
export const RequestLocalsCtx = createContext<Record<string, unknown>>({})

/**
 * Read per-request locals inside a component (SSR only).
 *
 * Returns the `ctx.locals` object populated by middleware.
 * On the client, returns an empty object.
 *
 * @example
 * ```tsx
 * import { useRequestLocals } from "@pyreon/server"
 *
 * function MyComponent() {
 *   const locals = useRequestLocals()
 *   const nonce = locals.cspNonce as string ?? ''
 *   return <script nonce={nonce}>...</script>
 * }
 * ```
 */
export function useRequestLocals(): Record<string, unknown> {
  return useContext(RequestLocalsCtx)
}

/**
 * Provide request locals into the component tree.
 * Called by the SSR handler — not for direct use.
 * @internal
 */
export function provideRequestLocals(locals: Record<string, unknown>): void {
  provide(RequestLocalsCtx, locals)
}
