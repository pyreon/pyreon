import { redirect, RouterView, useLoaderData } from "@pyreon/router"
import type { LoaderContext } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"
import { getSession, type SessionInfo } from "../../lib/auth"

/**
 * Auth-gated route group. Every `/app/*` route runs through this layout's
 * loader, which checks the session and `throw redirect('/login')` if missing.
 *
 * The loader runs BEFORE the layout's component is invoked, so:
 * - On SSR (initial nav): the redirect is converted to a 302 `Location:` by
 *   the SSR handler — no layout HTML ever leaves the server. Clients hit
 *   `/login` directly.
 * - On CSR (subsequent nav): the redirect propagates through the navigate
 *   flow; `router.replace('/login')` runs before any layout / page mounts.
 *
 * This replaces the older `onMount + router.push('/login')` workaround which
 * was unreliable under nested-layout dev SSR + hydration (the inner layout's
 * `onMount` was skipped after hydration, leaving authenticated UI exposed
 * to unauthenticated users for the duration of the session-fetch round-trip).
 */
export async function loader(ctx: LoaderContext): Promise<{ session: SessionInfo }> {
  const sid = readSessionCookie(ctx)
  const session = await getSession(sid)
  if (!session) redirect("/login")
  return { session }
}

export function layout() {
  // The loader's return value is available here; it's typed as the loader's
  // resolved type. By the time `layout()` runs, the redirect has already
  // happened — `session` is guaranteed non-null.
  const { session } = useLoaderData<{ session: SessionInfo }>()

  return (
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="brand">Dashboard</div>
        <Link href="/app/dashboard" prefetch="hover" exactActiveClass="nav-active">
          Overview
        </Link>
        <Link href="/app/users" prefetch="hover" exactActiveClass="nav-active">
          Users
        </Link>
        <Link href="/app/invoices" prefetch="hover" activeClass="nav-active">
          Invoices
        </Link>
        <Link href="/app/settings" prefetch="hover" activeClass="nav-active">
          Settings
        </Link>

        <div class="app-sidebar-footer">
          <div>{session.email}</div>
          <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
            <a href="/api/signout">Sign out</a>
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
 * Read the `sid` cookie from either the SSR request (initial navigation) or
 * `document.cookie` (subsequent CSR navigation). The loader runs in both
 * environments — `ctx.request` is populated only on SSR.
 */
function readSessionCookie(ctx: LoaderContext): string | undefined {
  const cookieHeader =
    ctx.request?.headers.get("cookie") ??
    (typeof document !== "undefined" ? document.cookie : "")
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader)
  return m?.[1]
}
