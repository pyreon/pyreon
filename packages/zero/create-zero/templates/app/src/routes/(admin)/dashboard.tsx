import { useHead } from "@pyreon/head"
import type { MiddlewareContext } from "@pyreon/server"
import type { LoaderContext } from "@pyreon/zero"

export const meta = {
  title: "Dashboard — Pyreon Zero",
}

/**
 * Navigation guard — runs before the route renders.
 * Demonstrates how to protect routes with authentication checks.
 *
 * In a real app, you'd check a session cookie, JWT token, or auth state.
 * Returning a string redirects to that path.
 */
export function guard() {
  // Simulate auth check — in a real app, check session/token
  const isAuthenticated =
    typeof window !== "undefined" && localStorage.getItem("zero-demo-auth") === "true"

  if (!isAuthenticated) {
    return "/about" // Redirect unauthenticated users
  }
  return true // Allow navigation
}

/**
 * Per-route middleware — runs on the server before rendering.
 * Great for logging, auth checks, rate limiting per-route.
 *
 * Uses @pyreon/server's Middleware signature: (ctx) => Response | void
 * Return a Response to short-circuit, or void to continue.
 */
export const middleware = (ctx: MiddlewareContext) => {
  // Add server timing header to track route performance
  ctx.headers.set("Server-Timing", `route;desc="Dashboard"`)
}

export async function loader(_ctx: LoaderContext) {
  return {
    user: "Demo User",
    stats: {
      views: 12_847,
      routes: 6,
      buildTime: "1.2s",
    },
  }
}

export default function Dashboard() {
  useHead({ title: meta.title })

  return (
    <>
      <div class="page-header">
        <span class="badge">Protected Route</span>
        <h1 style="margin-top: var(--space-md);">Dashboard</h1>
        <p>
          This route is protected by a <code>guard</code> function and uses per-route{" "}
          <code>middleware</code> for server-side logging.
        </p>
      </div>

      <div class="about-grid">
        <div class="card about-stat">
          <div class="stat-value">12.8k</div>
          <div class="stat-label">Page views</div>
        </div>
        <div class="card about-stat">
          <div class="stat-value">6</div>
          <div class="stat-label">Routes</div>
        </div>
        <div class="card about-stat">
          <div class="stat-value">1.2s</div>
          <div class="stat-label">Build time</div>
        </div>
      </div>

      <div class="code-block" style="max-width: 520px; margin: var(--space-2xl) auto 0;">
        <div class="code-block-header">
          <span>dashboard.tsx</span>
        </div>
        <pre>
          <code>
            <span class="cm">{"// Navigation guard — protect routes"}</span>
            <span class="kw">export function</span> <span class="fn">guard</span>() {"{"}
            <span class="kw">if</span> (!isAuthenticated) {"{"}
            <span class="kw">return</span> <span class="str">"/login"</span>{" "}
            <span class="cm">{"// redirect"}</span>
            {"}"}
            <span class="kw">return</span> <span class="str">true</span>{" "}
            <span class="cm">{"// allow"}</span>
            {"}"}
            <span class="cm">{"// Per-route server middleware"}</span>
            <span class="kw">export const</span> <span class="fn">middleware</span> = (req, next)
            =&gt; {"{"}
            <span class="cm">{"// logging, auth, rate limiting..."}</span>
            <span class="kw">return</span> <span class="fn">next</span>(req)
            {"}"}
          </code>
        </pre>
      </div>

      <div style="text-align: center; margin-top: var(--space-2xl);">
        <button
          type="button"
          class="btn btn-secondary"
          onClick={() => {
            localStorage.removeItem("zero-demo-auth")
            window.location.href = "/about"
          }}
        >
          Log out (clear demo auth)
        </button>
      </div>
    </>
  )
}
