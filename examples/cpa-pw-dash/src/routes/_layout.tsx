import { RouterView } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"

/**
 * Public marketing layout. Wraps `/`, `/login`, `/signup` — anything outside
 * `/app/*`. The auth-gated `app/_layout.tsx` provides its own sidebar shell.
 */
export function layout() {
  return <RouterView />
}

export function MarketingHeader() {
  return (
    <header class="marketing-header">
      <Link href="/" class="marketing-logo">
        Dashboard
      </Link>
      <nav class="marketing-nav">
        <Link href="/login">Sign in</Link>
        <Link href="/signup" class="btn btn-primary">
          Get started
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  )
}
