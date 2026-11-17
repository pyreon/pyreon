import type { ApiContext } from '@pyreon/zero/api-routes'

import { getSession } from '../../lib/auth'
import { readSessionId } from '../../lib/session-cookie'

/**
 * GET /api/session — `{ session: { userId, email } | null }`. The cookie is
 * HttpOnly, so this endpoint is how the browser learns who is signed in.
 */
export async function GET(ctx: ApiContext) {
  const session = await getSession(readSessionId(ctx.request))
  return Response.json(
    { session },
    { headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } },
  )
}
