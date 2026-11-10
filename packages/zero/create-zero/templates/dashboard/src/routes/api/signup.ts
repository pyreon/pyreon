import type { ApiContext } from "@pyreon/zero/api-routes"
import { signUp } from "../../lib/auth"
import { sessionCookie } from "../../lib/session-cookie"
import { readCredentials } from "../../lib/credentials"

/** POST /api/signup — creates the account and signs it in (HttpOnly cookie). */
export async function POST(ctx: ApiContext) {
  const creds = await readCredentials(ctx.request)
  if (creds instanceof Response) return creds

  const result = await signUp(creds.email, creds.password)
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 })

  return Response.json(
    { ok: true },
    { headers: { "set-cookie": sessionCookie(result.sessionId, ctx.request) } },
  )
}
