import { signal } from "@pyreon/reactivity"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { useRouter } from "@pyreon/router"
import { signUp } from "../lib/auth"

export const meta = { title: "Create an account" }

export default function Signup() {
  useHead({ title: meta.title })

  const email = signal("")
  const password = signal("")
  const error = signal<string | null>(null)
  const submitting = signal(false)

  const router = useRouter()

  async function handleSubmit(e: Event) {
    e.preventDefault()
    error.set(null)
    submitting.set(true)

    const result = signUp(email(), password())
    submitting.set(false)

    if ("error" in result) {
      error.set(result.error)
      return
    }

    if (typeof document !== "undefined") {
      document.cookie = `sid=${result.sessionId}; path=/; max-age=${7 * 24 * 60 * 60}`
    }
    await router.push("/app/dashboard")
  }

  return (
    <div class="auth-shell">
      <form class="auth-card" onSubmit={handleSubmit}>
        <h1>Create an account</h1>

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
          <label for="password">Password (min 8 chars)</label>
          <input
            id="password"
            type="password"
            value={password}
            onInput={(e) => password.set((e.currentTarget as HTMLInputElement).value)}
            required
            minLength={8}
          />
        </div>

        {() => (error() ? <div class="error">{error()}</div> : null)}

        <button type="submit" class="btn btn-primary" disabled={submitting} style="width: 100%; justify-content: center; margin-top: 1rem;">
          {() => (submitting() ? "Creating…" : "Create account")}
        </button>

        <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--c-text-muted); text-align: center;">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
