import { signal } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"
import { useRouter } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"
import { getSession, type SessionInfo } from "../../lib/auth"

/**
 * Auth-gated route group. Every `/app/*` route runs through this layout,
 * which checks the session client-side on mount and redirects to `/login`
 * if missing. Pyreon doesn't ship a loader-side `throw redirect()` pattern
 * (unlike Remix / React Router), so the gate runs after first paint —
 * brief flash of the layout shell is acceptable since unauthorized users
 * see no real data (the data-fetching helpers in `lib/db.ts` should
 * additionally enforce authorization on the server).
 *
 * For SSR-side enforcement, set the session cookie on the server-rendered
 * response and add a route middleware that 302s anonymous requests at the
 * adapter layer (vercel.json rewrites, Cloudflare Pages function, etc.).
 */
export function layout(props: { children: any }) {
  const session = signal<SessionInfo | null>(null)
  const router = useRouter()

  onMount(() => {
    const sid = readSessionCookie()
    void getSession(sid).then((info) => {
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
            <a href="/api/signout">Sign out</a>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main class="app-content">{props.children}</main>
    </div>
  )
}

function readSessionCookie(): string | undefined {
  if (typeof document === "undefined") return undefined
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(document.cookie)
  return m?.[1]
}
