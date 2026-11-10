import { signal } from "@pyreon/reactivity"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { useRouter } from "@pyreon/router"
import { postCredentials } from "../lib/post-credentials"

export const meta = { title: "Sign in" }

export default function Login() {
  useHead({ title: meta.title })

  // The demo account exists only under `vite dev` (see `lib/auth.ts`), so the
  // form is pre-filled only there.
  const email = signal(import.meta.env.DEV ? "demo@example.com" : "")
  const password = signal(import.meta.env.DEV ? "demo1234" : "")
  const error = signal<string | null>(null)
  const submitting = signal(false)

  const router = useRouter()

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error.set(null)
    submitting.set(true)

    // The server checks the password and sets the session cookie (HttpOnly,
    // so this page never sees the id). Works unchanged with the Supabase
    // overlay, which swaps `lib/auth.ts` underneath the endpoint.
    const message = await postCredentials("/api/signin", email(), password())
    submitting.set(false)
    if (message) {
      error.set(message)
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
