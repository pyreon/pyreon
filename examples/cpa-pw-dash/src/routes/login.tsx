import { signal } from "@pyreon/reactivity"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { useRouter } from "@pyreon/router"

export const meta = { title: "Sign in" }

export default function Login() {
  useHead({ title: meta.title })

  const email = signal("demo@example.com")
  const password = signal("demo1234")
  const error = signal<string | null>(null)
  const submitting = signal(false)

  const router = useRouter()

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error.set(null)
    submitting.set(true)

    // Route the sign-in through the server endpoint so the SSR-side
    // `sessions` Map is populated. Calling `signIn(email, password)` directly
    // here would only populate the BROWSER module's Map — the server has its
    // own under Vite dev's split-realm module instances, and SSR loaders
    // (e.g. `/app/_layout.tsx`'s auth gate) would still see no session on
    // the next full-page navigation. The endpoint sets `Set-Cookie: sid=...`
    // on success; the browser stores it automatically.
    let res: Response
    try {
      res = await fetch("/api/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email(), password: password() }),
      })
    } catch {
      submitting.set(false)
      error.set("Network error — please try again")
      return
    }

    submitting.set(false)

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      error.set(body.error ?? "Sign in failed")
      return
    }

    await router.push("/app/dashboard")
  }

  return (
    <div class="auth-shell">
      <form class="auth-card" onSubmit={handleSubmit}>
        <h1>Sign in</h1>

        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onInput={(e) => email.set((e.currentTarget as HTMLInputElement).value)}
            required
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onInput={(e) => password.set((e.currentTarget as HTMLInputElement).value)}
            required
          />
        </div>

        {() => (error() ? <div class="error">{error()}</div> : null)}

        <button type="submit" class="btn btn-primary" disabled={submitting} style="width: 100%; justify-content: center; margin-top: 1rem;">
          {() => (submitting() ? "Signing in…" : "Sign in")}
        </button>

        <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--c-text-muted); text-align: center;">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </form>
    </div>
  )
}
