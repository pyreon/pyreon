import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"
import { redirect } from "@pyreon/router"
import { getSession, type SessionInfo } from "../../lib/auth"

/**
 * Auth-gated route group. Every `/app/*` route runs through this loader, which
 * redirects to `/login` if no valid session exists. Replace `getSession` with
 * the production resolver from `@pyreon/auth-lucia` — the route guard pattern
 * stays the same.
 */
export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get("cookie") ?? ""
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookie)?.[1]

  const session = getSession(sid)
  if (!session) throw redirect("/login")

  return { session }
}

export function layout(props: { children: any; data: { session: SessionInfo } }) {
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
          <div>{props.data.session.email}</div>
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
