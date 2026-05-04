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
  const session = await resolveSession(ctx)
  if (!session) redirect("/login")
  return { session }
}

/**
 * SSR-side: read the cookie from the request and call `getSession` against
 * the SSR-side `sessions` Map directly.
 *
 * CSR-side: fetch `/api/session` so the lookup hits the SAME server-side
 * Map (Vite dev runs SSR and CSR in separate JS realms with their own
 * `sessions` Map module state — calling `getSession` directly here would
 * read the empty CSR-side Map even though the user just signed in via
 * `/api/signin`). The endpoint reads the `sid` cookie from the browser
 * request automatically.
 */
async function resolveSession(ctx: LoaderContext): Promise<SessionInfo | null> {
  if (ctx.request) {
    const cookie = ctx.request.headers.get("cookie") ?? ""
    const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookie)?.[1]
    return getSession(sid)
  }
  const res = await fetch("/api/session", { credentials: "same-origin" })
  if (!res.ok) return null
  const body = (await res.json()) as { session: SessionInfo | null }
  return body.session
}

/**
 * Auth-gate loaders are cached per `_loaderCache` like any other loader,
 * but the default cache key (`path + params`) doesn't see cookie changes —
 * so a session invalidation mid-CSR-session wouldn't re-fire the loader on
 * the next navigation. The user would stay on auth-gated pages with the
 * stale `{ session }` data.
 *
 * This `loaderKey` derives from the session cookie so any cookie change
 * (signout, expiry, manual clear) flips the cache key, forces a cache miss
 * on the next nav, and the loader re-runs — at which point `getSession`
 * returns null and `redirect('/login')` fires.
 *
 * On SSR `document` is undefined; the per-request router has a fresh cache
 * anyway so the loader always runs. Falls back to `'anon'` on SSR.
 */
export function loaderKey(): string {
  if (typeof document === "undefined") return "auth-gate|ssr"
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(document.cookie)?.[1] ?? "anon"
  return `auth-gate|${sid}`
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

