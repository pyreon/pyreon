import type { ApiContext } from "@pyreon/zero/api-routes"
import { getSession } from "../../lib/auth"

/**
 * Server-side session lookup endpoint. Reads the `sid` cookie from the
 * request, calls `getSession(sid)` against the SSR-side `sessions` Map,
 * and returns `{ session: SessionInfo | null }`.
 *
 * Why this exists: see the sibling `/api/signin.ts` for the full root cause.
 * tl;dr the in-memory `sessions` Map lives in module state and Vite dev's
 * SSR/CSR module instances each have their own Map. Routing the lookup
 * through this endpoint means the CSR-side `_layout.tsx` loader hits the
 * SAME server Map that `/api/signin` populated, so signed-in users can
 * navigate CSR-side after a successful login without false redirects.
 */
export async function GET(ctx: ApiContext) {
  const cookie = ctx.request.headers.get("cookie") ?? ""
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookie)?.[1]
  const session = await getSession(sid)
  return Response.json({ session })
}
