import { onMount, onUnmount } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { RouterView, useRoute } from '@pyreon/router'
import { Search } from '@pyreon/zero-content'
import { Header } from '../components/Header'
import { PrimaryNavigation } from '../components/PrimaryNavigation'
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
 *   - Mobile drawer on every route, with primary links and the docs sidebar
 *
 * Landing page (`/`) renders WITHOUT the sidebar; docs pages render
 * WITH it. Both share the same top header chrome, so navigation
 * doesn't visually jump between layouts.
 */
export function layout() {
  const drawerOpen = signal(false)
  const route = useRoute()

  // A DEDUPING computed (not a plain accessor): the sidebar `<aside>` is
  // rendered inside a reactive conditional `{() => isDocsPath() ? … : null}`,
  // and `mountReactive` UNMOUNTS + REMOUNTS that subtree on every effect
  // re-run. A plain `() => …route().path…` reads `route()`, so it would re-run
  // on EVERY navigation — re-mounting the whole sidebar even on docs→docs nav,
  // which (a) resets `.pyreon-sidebar`'s scroll position to the top and (b)
  // flashes the sidebar out/in (worsened by its `view-transition-name`).
  // The `equals` computed recomputes on each route change but only NOTIFIES
  // the conditional when the boolean actually FLIPS (landing↔docs), so the
  // sidebar mounts once on entering docs and persists across docs→docs nav.
  const isDocsPath = computed(
    () => {
      const path = route().path
      if (typeof path !== 'string') return false
      return /\/docs(\/|$)/.test(path)
    },
    { equals: (a, b) => a === b },
  )

  const setPageScrollLocked = (locked: boolean) => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('docs-drawer-scroll-locked', locked)
  }

  const closeDrawer = (restoreFocus = false) => {
    if (!drawerOpen()) return
    drawerOpen.set(false)
    setPageScrollLocked(false)
    if (restoreFocus && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.docs-header__hamburger')?.focus()
      })
    }
  }

  const toggleDrawer = () => {
    const next = !drawerOpen()
    drawerOpen.set(next)
    setPageScrollLocked(next)
    if (next && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('#docs-navigation-drawer a, #docs-navigation-drawer button')
          ?.focus()
      })
    }
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
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
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
      if (e.key === 'Escape' && drawerOpen()) {
        e.preventDefault()
        closeDrawer(true)
        return
      }
      if (e.key !== 'Tab' || !drawerOpen() || typeof document === 'undefined') return
      const drawer = document.querySelector<HTMLElement>('#docs-navigation-drawer')
      const hamburger = document.querySelector<HTMLElement>('.docs-header__hamburger')
      const focusable = [
        hamburger,
        ...(drawer?.querySelectorAll<HTMLElement>('a, button') ?? []),
      ].filter((element): element is HTMLElement =>
        Boolean(element && element.offsetParent !== null),
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onResize = () => {
      if (window.innerWidth > 768) closeDrawer()
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('resize', onResize)
    }
  })

  onUnmount(() => {
    closeDrawer()
    setPageScrollLocked(false)
  })

  return (
    <div class={() => (drawerOpen() ? 'docs-shell docs-shell--drawer-open' : 'docs-shell')}>
      <Header
        onOpenSearch={openSearch}
        onHamburgerToggle={toggleDrawer}
        drawerOpen={() => drawerOpen()}
      />

      <aside
        id="docs-navigation-drawer"
        class={() => {
          const base = isDocsPath() ? 'docs-aside' : 'docs-mobile-drawer'
          return drawerOpen() ? `${base} docs-aside--drawer-open` : base
        }}
      >
        <PrimaryNavigation
          class="docs-mobile-nav"
          label="Mobile primary"
          onNavigate={() => closeDrawer()}
        />
        {() => (isDocsPath() ? <Sidebar onNavigate={() => closeDrawer()} /> : null)}
      </aside>
      {/* Mobile backdrop — tap to close the drawer. */}
      <div class="docs-drawer-backdrop" onClick={() => closeDrawer(true)} aria-hidden="true" />

      <main class="docs-main">
        <RouterView />
      </main>

      <Search />
    </div>
  )
}
