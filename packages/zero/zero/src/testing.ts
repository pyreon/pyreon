import type { Middleware, MiddlewareContext } from "@pyreon/server"
import type { ApiHandler, ApiRouteEntry } from "./api-routes"
import { createApiMiddleware } from "./api-routes"

// ─── Test helpers for Zero applications ─────────────────────────────────────

/**
 * Create a mock MiddlewareContext for testing middleware.
 *
 * @example
 * import { createTestContext } from "@pyreon/zero/testing"
 *
 * const ctx = createTestContext("/api/posts", { method: "POST", body: { title: "Hello" } })
 * const result = await myMiddleware(ctx)
 */
export function createTestContext(
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
  } = {},
): MiddlewareContext {
  const { method = "GET", headers = {}, body } = options
  const url = new URL(`http://localhost${path}`)

  const requestHeaders: Record<string, string> = { ...headers }
  let requestBody: string | undefined

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json"
    requestBody = JSON.stringify(body)
  }

  const req = new Request(url.toString(), {
    method,
    headers: requestHeaders,
    ...(requestBody != null ? { body: requestBody } : {}),
  })

  return {
    req,
    url,
    path,
    headers: new Headers(),
    locals: {},
  }
}

/**
 * Test a middleware by running it with a mock context and returning
 * the result along with the response headers it set.
 *
 * @example
 * import { testMiddleware } from "@pyreon/zero/testing"
 *
 * const { response, headers } = await testMiddleware(
 *   corsMiddleware({ origin: "*" }),
 *   "/api/posts"
 * )
 * expect(headers.get("Access-Control-Allow-Origin")).toBe("*")
 */
export async function testMiddleware(
  middleware: Middleware,
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
  } = {},
): Promise<{ response: Response | undefined; headers: Headers }> {
  const ctx = createTestContext(path, options)
  const response = (await middleware(ctx)) as Response | undefined
  return { response, headers: ctx.headers }
}

/**
 * Create a test server for API routes. Returns a function that
 * accepts Request objects and dispatches to the correct handler.
 *
 * @example
 * import { createTestApiServer } from "@pyreon/zero/testing"
 *
 * const server = createTestApiServer([
 *   { pattern: "/api/posts", module: postsApi },
 *   { pattern: "/api/posts/:id", module: postByIdApi },
 * ])
 *
 * const response = await server.request("/api/posts")
 * expect(response.status).toBe(200)
 *
 * const data = await server.request("/api/posts", { method: "POST", body: { title: "Hi" } })
 * expect(data.status).toBe(201)
 */
export function createTestApiServer(routes: ApiRouteEntry[]) {
  const middleware = createApiMiddleware(routes)

  return {
    async request(
      path: string,
      options: {
        method?: string
        headers?: Record<string, string>
        body?: unknown
      } = {},
    ): Promise<Response> {
      const ctx = createTestContext(path, options)
      const result = await middleware(ctx)
      if (!result) {
        return new Response("Not Found", { status: 404 })
      }
      return result
    },
  }
}

/**
 * Create a mock API handler for testing.
 * Records all calls and returns a configurable response.
 *
 * @example
 * import { createMockHandler } from "@pyreon/zero/testing"
 *
 * const handler = createMockHandler({ status: 200, body: { ok: true } })
 * // ... use handler in your API route module
 * expect(handler.calls).toHaveLength(1)
 * expect(handler.calls[0].params).toEqual({ id: "123" })
 */
export function createMockHandler(
  responseConfig: { status?: number; body?: unknown; headers?: Record<string, string> } = {},
): ApiHandler & {
  calls: Array<{ path: string; params: Record<string, string> }>
} {
  const { status = 200, body = null, headers = {} } = responseConfig
  const calls: Array<{ path: string; params: Record<string, string> }> = []

  const handler: ApiHandler = (ctx) => {
    calls.push({ path: ctx.path, params: ctx.params })
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    })
  }

  return Object.assign(handler, { calls })
}
