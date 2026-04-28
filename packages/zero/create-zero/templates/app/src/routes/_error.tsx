import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"

export default function ErrorPage() {
  useHead({ title: "Something went wrong — Zero" })

  return (
    <div class="error-page">
      <div class="error-code">500</div>
      <h1>Something went wrong</h1>
      <p style="color: var(--c-text-secondary); max-width: 400px;">
        An unexpected error occurred. Try refreshing the page or navigating back home.
      </p>
      <Link href="/" class="btn btn-primary" style="margin-top: var(--space-md);">
        Back to Home
      </Link>
    </div>
  )
}
