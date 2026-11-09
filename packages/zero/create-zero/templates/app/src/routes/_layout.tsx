import { QueryClient, QueryClientProvider } from "@pyreon/query"
import { RouterView } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000 } },
})

export function layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <header class="app-header">
        <div class="app-header-inner">
          <Link href="/" class="app-logo">
            <span class="logo-mark">Z</span>
            <span>Zero</span>
          </Link>
          <nav class="app-nav">
            <Link href="/" prefetch="viewport" exactActiveClass="nav-active">
              Home
            </Link>
            <Link href="/counter" prefetch="hover" exactActiveClass="nav-active">
              Counter
            </Link>
            <Link href="/posts" prefetch="hover" activeClass="nav-active">
              Posts
            </Link>
            <Link href="/about" prefetch="hover" exactActiveClass="nav-active">
              About
            </Link>
            <Link href="/dashboard" prefetch="hover" exactActiveClass="nav-active">
              Dashboard
            </Link>
            <ThemeToggle class="theme-toggle" />
          </nav>
        </div>
      </header>

      <main class="app-main">
        <RouterView />
      </main>

      <footer class="app-footer">Built with Pyreon Zero — signal-based, fine-grained.</footer>
    </QueryClientProvider>
  )
}
