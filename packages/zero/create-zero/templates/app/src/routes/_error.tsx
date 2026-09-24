import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"

interface ErrorPageProps {
  /**
   * The error caught by the route's error boundary. Always present when
   * rendered as a route `errorComponent` (the framework passes it).
   *
   * The error is always logged to the console. In development the message
   * + stack are also rendered inline, so you can debug without bisecting
   * routes; production renders only the generic message. Report production
   * errors to your error tracker from here if you use one.
   */
  error?: unknown
}

export default function ErrorPage(props: ErrorPageProps = {}) {
  useHead({ title: "Something went wrong — Zero" })

  // `process.env.NODE_ENV` is replaced at build time by every bundler, so
  // this branch — and the details block below — is removed from production
  // builds. Never render internals to public output.
  const isDev = process.env.NODE_ENV !== "production"

  // Log the caught error in EVERY environment: in production this is the
  // only trace an operator gets. (The lint rule below guards library dev
  // warnings; an app's error log is not one.)
  if (props.error !== undefined) {
    // pyreon-lint-ignore pyreon/dev-guard-warnings
    console.error("[Pyreon] route error boundary caught:", props.error)
  }
  const err = props.error
  const message =
    err instanceof Error ? err.message : err !== undefined ? String(err) : null
  const stack = err instanceof Error ? err.stack : null

  return (
    <div class="error-page">
      <div class="error-code">500</div>
      <h1>Something went wrong</h1>
      <p style="color: var(--c-text-secondary); max-width: 480px;">
        An unexpected error occurred. Try refreshing the page or navigating back home.
      </p>

      {isDev && message && (
        <details
          open
          style="margin-top: var(--space-md); max-width: min(900px, 90vw); width: 100%; background: var(--c-surface); border: 1px solid var(--c-danger); border-radius: 8px; padding: var(--space-md); text-align: left;"
        >
          <summary style="cursor: pointer; font-weight: 600; color: var(--c-danger); margin-bottom: var(--space-sm);">
            {message}
          </summary>
          {stack && (
            <pre style="margin-top: var(--space-sm); font-family: var(--font-mono, monospace); font-size: 12px; line-height: 1.5; color: var(--c-text-secondary); white-space: pre-wrap; word-break: break-word; max-height: 50vh; overflow: auto;">
              {stack}
            </pre>
          )}
          <p style="margin-top: var(--space-sm); font-size: 11px; color: var(--c-text-muted);">
            This detail block only renders in development. Production builds show
            only the generic message above.
          </p>
        </details>
      )}

      <Link href="/" class="btn btn-primary" style="margin-top: var(--space-md);">
        Back to Home
      </Link>
    </div>
  )
}
