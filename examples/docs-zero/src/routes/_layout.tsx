import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { RouterView, useRoute } from '@pyreon/router'
import { Search } from '@pyreon/zero-content'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'

/**
 * Root layout — wraps every route with the persistent shell:
 *
 *   - Top `<Header>` with brand logo, nav, search trigger, theme
 *     toggle, GitHub icon, and mobile hamburger
 *   - `<Sidebar>` rendered when the URL matches `/docs/*` (matches
 *     VitePress's `sidebar: { '/docs/': [...] }` scoping)
 *   - `<Search>` overlay (mounted once, opens via Cmd+K OR the
 *     header's search button — the button injects a synthetic Cmd+K
 *     event so the Search component's own keyboard handler does the
 *     toggle, keeping all open/close state inside the component)
 *   - Mobile drawer support — same `<Sidebar>` slides in on mobile
 *
 * Landing page (`/`) renders WITHOUT the sidebar; docs pages render
 * WITH it. Both share the same top header chrome, so navigation
 * doesn't visually jump between layouts.
 */
export function layout() {
  const drawerOpen = signal(false)
  const route = useRoute()

  const isDocsPath = () => {
    const path = route().path
    if (typeof path !== 'string') return false
    return /\/docs(\/|$)/.test(path)
  }

  // The header's search button can't directly call `useSearch()` to
  // toggle open, because `useSearch` is hook-shaped and creates a new
  // state instance per call. Instead, dispatch a synthetic Cmd+K (or
  // Ctrl+K on non-Mac) keyboard event on `window` — `<Search>`'s own
  // keyboard handler listens for that and toggles its internal open
  // state. This keeps the open/close source-of-truth inside the
  // Search component.
  const openSearch = () => {
    if (typeof window === 'undefined') return
    const isMac =
      typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
    const evt = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(evt)
  }

  // Escape key closes the mobile drawer.
  onMount(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen()) drawerOpen.set(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  onUnmount(() => {
    drawerOpen.set(false)
  })

  return (
    <div
      class={() =>
        drawerOpen() ? 'docs-shell docs-shell--drawer-open' : 'docs-shell'
      }
    >
      <Header
        onOpenSearch={openSearch}
        onHamburgerToggle={() => drawerOpen.set(!drawerOpen())}
        drawerOpen={() => drawerOpen()}
      />

      {() =>
        isDocsPath() ? (
          <>
            <aside
              class={() =>
                drawerOpen()
                  ? 'docs-aside docs-aside--drawer-open'
                  : 'docs-aside'
              }
            >
              <Sidebar onNavigate={() => drawerOpen.set(false)} />
            </aside>
            {/* Mobile backdrop — tap to close the drawer. */}
            <div
              class="docs-drawer-backdrop"
              onClick={() => drawerOpen.set(false)}
              aria-hidden="true"
            />
          </>
        ) : null
      }

      <main class="docs-main">
        <RouterView />
      </main>

      <Search />
    </div>
  )
}
