import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { MarketingHeader } from "./_layout"

export const meta = {
  title: "Dashboard — your SaaS in a box",
  description: "A SaaS-shape Pyreon Zero starter. Auth, invoices, users, settings — out of the box.",
}

export default function Home() {
  useHead({
    title: meta.title,
    meta: [{ name: "description", content: meta.description }],
  })

  return (
    <>
      <MarketingHeader />

      <section class="hero">
        <h1>Your SaaS in a box.</h1>
        <p>
          A Pyreon Zero starter with auth, table views, settings, and an invoice export
          pipeline that renders the same component tree to PDF and email.
        </p>
        <div class="hero-actions">
          <Link href="/signup" class="btn btn-primary">
            Create an account
          </Link>
          <Link href="/login" class="btn btn-secondary">
            Sign in
          </Link>
        </div>
        <p style="margin-top: 1.5rem; font-size: 0.875rem; color: var(--c-text-muted);">
          Demo login: <code>demo@example.com</code> / <code>demo1234</code>
        </p>
      </section>
    </>
  )
}
