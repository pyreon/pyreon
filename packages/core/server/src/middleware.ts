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

export interface MiddlewareContext {
  /** The incoming request */
  req: Request;
  /** Parsed URL */
  url: URL;
  /** Pathname + search (passed to router) */
  path: string;
  /** Response headers — middleware can set custom headers */
  headers: Headers;
  /** Arbitrary per-request data shared between middleware and components */
  locals: Record<string, unknown>;
}

/**
 * Middleware function. Return a Response to short-circuit, or void to continue.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — callers may return void
export type Middleware = (ctx: MiddlewareContext) => Response | void | Promise<Response | void>;
