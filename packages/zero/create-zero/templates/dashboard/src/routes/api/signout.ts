import type { ApiContext } from "@pyreon/zero/api-routes"
import { signOut } from "../../lib/auth"
import { clearedSessionCookie, readSessionId } from "../../lib/session-cookie"

/**
 * POST /api/signout — ends the session and clears the cookie, then sends the
 * browser home. POST (a form button, see `app/_layout.tsx`) rather than a
 * GET link, so another site cannot sign users out with an `<img src>`.
 */
export async function POST(ctx: ApiContext) {
  const sid = readSessionId(ctx.request)
  if (sid) await signOut(sid)

  return new Response(null, {
    status: 303,
    headers: { "set-cookie": clearedSessionCookie(ctx.request), location: "/" },
  })
}
