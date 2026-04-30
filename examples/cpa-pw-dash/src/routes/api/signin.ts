import type { ApiContext } from "@pyreon/zero/api-routes"
import { signIn } from "../../lib/auth"

/**
 * Server-side sign-in endpoint. Receives credentials over POST, calls
 * `signIn(email, password)` against the SSR-side `sessions` Map, and
 * responds with `Set-Cookie: sid=...` on success or 401 on failure.
 *
 * Why this exists (vs. the prior client-only `signIn()` call in login.tsx):
 * the in-memory `sessions` Map in `lib/auth.ts` lives in module state, and
 * Vite dev runs the SSR module instance and the CSR module instance in
 * separate JS realms — so a session created client-side never appears in
 * the SSR Map. When a later page request hits the server (initial nav /
 * full reload / `page.goto` in playwright), the SSR `_layout.tsx` loader
 * reads the cookie, calls `getSession(sid)` against the SSR Map, sees no
 * session, and redirects to /login. Routing the sign-in through this
 * endpoint populates the SSR Map directly, which is the same Map every
 * subsequent SSR loader reads.
 *
 * Real-app pattern note: `argon2id` for password hashing, signed/HttpOnly
 * cookies, CSRF token validation. The stub here mirrors the canonical zero
 * API-route shape — see create-zero's `templates/app/src/routes/api/posts.ts`.
 */
export async function POST(ctx: ApiContext) {
  let body: unknown
  try {
    body = await ctx.request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { email, password } =
    (body as { email?: unknown; password?: unknown }) ?? {}
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Missing email or password" }, { status: 400 })
  }

  const result = signIn(email, password)
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 401 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `sid=${result.sessionId}; path=/; max-age=${7 * 24 * 60 * 60}`,
    },
  })
}
