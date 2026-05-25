import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { RouterView } from '@pyreon/router'
import { Link } from '@pyreon/zero/link'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // HN content updates slowly; 30s stale is plenty.
      staleTime: 30_000,
      // Don't refetch on focus — too aggressive for a content site.
      refetchOnWindowFocus: false,
    },
  },
})

export function layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <header class="hn-header">
        <div class="hn-header-inner">
          <Link href="/" class="hn-logo" prefetch="viewport">
            <span class="hn-y">Y</span>
            <span>Hacker News (Pyreon)</span>
          </Link>
          <nav class="hn-nav">
            <Link href="/" prefetch="hover" exactActiveClass="nav-active">
              top
            </Link>
            <Link href="/new" prefetch="hover" exactActiveClass="nav-active">
              new
            </Link>
            <Link href="/ask" prefetch="hover" exactActiveClass="nav-active">
              ask
            </Link>
            <Link href="/show" prefetch="hover" exactActiveClass="nav-active">
              show
            </Link>
            <Link href="/jobs" prefetch="hover" exactActiveClass="nav-active">
              jobs
            </Link>
          </nav>
        </div>
      </header>

      <main class="hn-main">
        <RouterView />
      </main>

      <footer class="hn-footer">
        <span>
          Built with{' '}
          <a href="https://github.com/pyreon/pyreon" target="_blank" rel="noreferrer">
            Pyreon Zero
          </a>{' '}
          · Data from the{' '}
          <a href="https://github.com/HackerNews/API" target="_blank" rel="noreferrer">
            Hacker News API
          </a>
        </span>
      </footer>
    </QueryClientProvider>
  )
}
