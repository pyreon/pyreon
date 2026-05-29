import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'

interface ErrorPageProps {
  /**
   * The error caught by the route's error boundary. Always present when
   * rendered as a route `errorComponent` (the framework passes it).
   *
   * In production builds, the error message + stack are hidden from the
   * rendered output but the error IS still logged to `console.error` for
   * ops visibility. In dev, both the rendered output AND console show
   * the full stack — this lets you debug without bisecting routes.
   */
  error?: unknown
}

export default function ErrorPage(props: ErrorPageProps = {}) {
  useHead({ title: 'Something went wrong — Zero' })

  // Surface the actual error to the browser devtools immediately so any
  // `pageerror` listener / `console.error` subscriber sees it. Cheap;
  // runs once per error boundary trip. Without this line, errors caught
  // by the framework's boundary are invisible to dev tools.
  if (props.error !== undefined && typeof console !== 'undefined') {
    console.error('[Pyreon] route error boundary caught:', props.error)
  }

  // In dev mode render the error message + stack inline so the user can
  // debug without re-opening the browser console. In production we keep
  // the generic message — never leak internals to public output.
  const isDev = import.meta.env.DEV
  const err = props.error
  const message = err instanceof Error ? err.message : err !== undefined ? String(err) : null
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
            This detail block only renders when <code>import.meta.env.DEV</code> is true. Production
            builds hide the message + stack but still call <code>console.error()</code>.
          </p>
        </details>
      )}

      <Link href="/" class="btn btn-primary" style="margin-top: var(--space-md);">
        Back to Home
      </Link>
    </div>
  )
}
