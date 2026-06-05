import { RouterLink, RouterView } from '@pyreon/router'

// The root layout — wraps every route. Renders a simple sticky top bar
// + the route content area. Sidebar/Toc are mounted by the docs route
// itself so the landing page (index.tsx) can render a different layout.
export function layout() {
  return (
    <div class="docs-shell">
      <header class="docs-header">
        <RouterLink to="/" class="docs-logo">
          Pyreon
        </RouterLink>
        <nav class="docs-nav">
          <RouterLink to="/docs/getting-started">Docs</RouterLink>
          <a href="https://github.com/pyreon/pyreon" rel="noopener">GitHub</a>
        </nav>
      </header>
      <main class="docs-main">
        <RouterView />
      </main>
    </div>
  )
}
