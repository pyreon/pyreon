import { redirect, RouterView, useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/router'
import { Link } from '@pyreon/zero/link'
import { ThemeToggle } from '@pyreon/zero/theme'

import type { SessionInfo } from '../../lib/auth'

/**
 * Auth-gated route group. Every `/app/*` route runs through this layout's
 * loader, which looks up the session and calls `redirect('/login')` when
 * there is none. The loader runs before the layout renders, so:
 *
 * - on the server (first request) the redirect becomes a 302 and no
 *   authenticated markup is sent;
 * - in the browser (client navigation) the router replaces the URL with
 *   `/login` before any `/app/*` page mounts.
 *
 * The data helpers in `lib/db.ts` should still check authorization on the
 * server: this gate decides what the UI shows, not who may read the data.
 */
export async function loader(ctx: LoaderContext): Promise<{ session: SessionInfo }> {
  const session = await resolveSession(ctx)
  if (!session) redirect('/login')

  return { session }
}

/**
 * Re-check the session on every navigation into `/app/*`. The default loader
 * cache key is the path and params, which cannot see a session that ended
 * mid-visit (sign-out in another tab, expiry): a cached result would keep
 * showing authenticated pages. A fresh key per navigation costs one
 * `/api/session` request and closes that gap.
 */
let navigation = 0

export function loaderKey(): string {
  navigation += 1

  return `auth-gate|${navigation}`
}

export function layout() {
  // The loader already redirected when there is no session.
  const { session } = useLoaderData<{ session: SessionInfo }>()

  return (
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="brand">Dashboard</div>
        <Link
          href="/app/dashboard"
          prefetch="hover"
          exactActiveClass="nav-active"
        >
          Overview
        </Link>
        <Link
          href="/app/users"
          prefetch="hover"
          exactActiveClass="nav-active"
        >
          Users
        </Link>
        <Link
          href="/app/invoices"
          prefetch="hover"
          activeClass="nav-active"
        >
          Invoices
        </Link>
        <Link
          href="/app/settings"
          prefetch="hover"
          activeClass="nav-active"
        >
          Settings
        </Link>

        <div class="app-sidebar-footer">
          <div>{session.email}</div>
          <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
            <form
              method="post"
              action="/api/signout"
              style="display: inline;"
            >
              <button
                type="submit"
                class="btn-link"
              >
                Sign out
              </button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main class="app-content">
        <RouterView />
      </main>
    </div>
  )
}

/**
 * On the server, read the session straight from the request's cookie. In the
 * browser, ask `/api/session`: the cookie is HttpOnly, so page JavaScript
 * cannot read it, and the dev server's browser and server realms do not
 * share the in-memory session store. The server branch is dropped from the
 * client bundle, so `lib/auth` never ships to the browser.
 */
async function resolveSession(ctx: LoaderContext): Promise<SessionInfo | null> {
  if (import.meta.env.SSR && ctx.request) {
    const { getSession } = await import('../../lib/auth')
    const { readSessionId } = await import('../../lib/session-cookie')

    return getSession(readSessionId(ctx.request))
  }

  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' })
    if (!res.ok) return null

    return ((await res.json()) as { session: SessionInfo | null }).session
  } catch {
    return null
  }
}
