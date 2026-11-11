import type { ApiContext } from "@pyreon/zero/api-routes"
import { signIn } from "../../lib/auth"
import { sessionCookie } from "../../lib/session-cookie"
import { readCredentials } from "../../lib/credentials"

/**
 * POST /api/signin — `{ email, password }` → `Set-Cookie` (HttpOnly) on
 * success, 401 otherwise. The session id is never in the response body, so
 * page JavaScript never holds it.
 */
export async function POST(ctx: ApiContext) {
  const creds = await readCredentials(ctx.request)
  if (creds instanceof Response) return creds

  const result = await signIn(creds.email, creds.password)
  if ("error" in result) return Response.json({ error: result.error }, { status: 401 })

  return Response.json(
    { ok: true },
    { headers: { "set-cookie": sessionCookie(result.sessionId, ctx.request) } },
  )
}
