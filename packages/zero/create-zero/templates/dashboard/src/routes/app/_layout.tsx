import { signal } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"
import { RouterView, useRouter } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"
import type { SessionInfo } from "../../lib/auth"

/**
 * Auth-gated route group. Every `/app/*` route runs through this layout,
 * which asks `/api/session` on mount (the cookie is HttpOnly, so only the
 * server can read it) and redirects to `/login` if there is no session. Pyreon doesn't ship a loader-side `throw redirect()` pattern
 * (unlike Remix / React Router), so the gate runs after first paint —
 * brief flash of the layout shell is acceptable since unauthorized users
 * see no real data (the data-fetching helpers in `lib/db.ts` should
 * additionally enforce authorization on the server).
 *
 * For SSR-side enforcement, set the session cookie on the server-rendered
 * response and add a route middleware that 302s anonymous requests at the
 * adapter layer (vercel.json rewrites, Cloudflare Pages function, etc.).
 */
export function layout() {
  const session = signal<SessionInfo | null>(null)
  const router = useRouter()

  onMount(() => {
    void fetchSession().then((info) => {
      if (!info) {
        void router.push("/login")
        return
      }
      session.set(info)
    })
  })

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
          {() => {
            const s = session()
            return s ? <div>{s.email}</div> : <div>Loading…</div>
          }}
          <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
            <form method="post" action="/api/signout" style="display: inline;">
              <button type="submit" class="btn-link">Sign out</button>
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
 * Ask the server who is signed in. The session cookie is HttpOnly, so page
 * JavaScript cannot read it — `/api/session` reads it and answers.
 */
async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin" })
    if (!res.ok) return null
    return ((await res.json()) as { session: SessionInfo | null }).session
  } catch {
    return null
  }
}
