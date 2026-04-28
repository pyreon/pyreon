import { signal } from "@pyreon/reactivity"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { useRouter } from "@pyreon/router"
import { signIn } from "../lib/auth"

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

    const result = signIn(email(), password())
    submitting.set(false)

    if ("error" in result) {
      error.set(result.error)
      return
    }

    // Persist the stub session id client-side. Real impl uses an HttpOnly cookie
    // set by the auth handler. See @pyreon/auth-lucia for the production path.
    if (typeof document !== "undefined") {
      document.cookie = `sid=${result.sessionId}; path=/; max-age=${7 * 24 * 60 * 60}`
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
