import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { RouterView } from '@pyreon/router'
import { Search } from '@pyreon/zero-content'
import { Header } from '../../components/Header'
import { PrimaryNavigation } from '../../components/PrimaryNavigation'
import { Sidebar } from '../../components/Sidebar'

/**
 * Docs layout — the reading shell for `/docs` and `/docs/*`:
 *
 *   - Top `<Header>` with brand logo, nav, search trigger, theme
 *     toggle, GitHub icon, and mobile hamburger
 *   - `<Sidebar>` (the docs navigation; a drawer below 768px)
 *   - `<Search>` overlay (mounted once, opens via Cmd+K OR the
 *     header's search button — the button injects a synthetic Cmd+K
 *     event so the Search component's own keyboard handler does the
 *     toggle, keeping all open/close state inside the component)
 *
 * Every other page renders inside the marketing shell
 * (`routes/(site)/_layout.tsx`). Both sit under the root layout, which
 * owns the head defaults and the `<PyreonUI>` theme provider. The docs
 * layout itself is redesigned in a later slice.
 */
export function layout() {
  const drawerOpen = signal(false)

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
        class={() => (drawerOpen() ? 'docs-aside docs-aside--drawer-open' : 'docs-aside')}
      >
        <PrimaryNavigation
          class="docs-mobile-nav"
          label="Mobile primary"
          onNavigate={() => closeDrawer()}
        />
        <Sidebar onNavigate={() => closeDrawer()} />
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
