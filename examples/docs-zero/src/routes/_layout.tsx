import { RouterView } from '@pyreon/router'
import { Header } from '../components/Header'

// Root layout — wraps every route with a sticky header + theme toggle
// + the main content area. The mobile sidebar drawer wiring lives in
// the docs route itself ([...slug].tsx) because it needs the current
// slug for active highlighting; the header just shows a non-functional
// hamburger on non-docs pages (it's hidden via CSS).
export function layout() {
  return (
    <div class="docs-shell">
      <Header />
      <main class="docs-main">
        <RouterView />
      </main>
    </div>
  )
}
