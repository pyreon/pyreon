import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { RouterLink } from '@pyreon/router'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  /** Called when the user clicks the search trigger button. */
  onOpenSearch?: () => void
  onHamburgerToggle?: () => void
  /** Reactive accessor — drives the hamburger's aria-expanded state. */
  drawerOpen?: () => boolean
}

/**
 * Top navigation bar — matches VitePress's `VPNavBar` layout from the
 * brand handoff. Ships:
 *   - theme-aware SVG logo (auto-switches via CSS [data-theme] selector)
 *   - text wordmark
 *   - nav links (Docs, GitHub)
 *   - search trigger ("Search… ⌘K") that opens the overlay
 *   - theme toggle (sun/moon)
 *   - GitHub icon link
 *   - mobile hamburger (visible on <768px)
 *
 * Search overlay itself is rendered separately by `_layout.tsx`'s
 * `<Search />` to keep the dialog mounted at the document root, not
 * nested inside the header (so the dialog backdrop covers the whole
 * viewport — not just the header strip).
 */
export function Header(props: HeaderProps) {
  // Detect Mac for the ⌘/Ctrl glyph in the trigger button.
  const isMac = signal(false)
  onMount(() => {
    if (typeof navigator !== 'undefined') {
      isMac.set(navigator.userAgent.includes('Mac'))
    }
  })

  // Keep the hamburger button's aria-expanded reactive without
  // requiring the parent to pass a signal directly — the parent
  // passes an accessor and a callback.
  const drawerOpen = props.drawerOpen ?? (() => false)

  // Base-aware asset paths. `__ZERO_BASE__` is the build-time global
  // zero's vite-plugin defines with the resolved `base` value (e.g.
  // `/pyreon/` for the production GitHub Pages deploy). Relative paths like
  // `./brand/...` would resolve against the CURRENT page URL
  // (`/pyreon/docs/X/`), which produces `/pyreon/docs/
  // brand/...` and 404s. The base-prefixed URL stays correct on every
  // page regardless of depth.
  //
  // We deliberately don't use `import.meta.env.BASE_URL` because the
  // SSG inner SSR sub-build re-runs Vite with `configFile: false` and
  // doesn't always pick up the outer `base` for that env var.
  // `__ZERO_BASE__` is set by zero's plugin `config()` hook AND
  // `configResolved` sync (PR #1395), so it always reflects the final
  // resolved base in both the outer build and the inner SSR build.
  const base =
    typeof __ZERO_BASE__ !== 'undefined' && __ZERO_BASE__ !== '/'
      ? __ZERO_BASE__
      : '/'

  return (
    <header class="docs-header">
      <div class="docs-header__inner">
        {/* LEFT: brand (SVG mark + wordmark) */}
        <RouterLink to="/" class="docs-brand" aria-label="Pyreon home">
          <img
            class="docs-brand__mark docs-brand__mark--dark"
            src={`${base}brand/logo-on-mono-dark.svg`}
            alt=""
            width="32"
            height="32"
            aria-hidden="true"
          />
          <img
            class="docs-brand__mark docs-brand__mark--light"
            src={`${base}brand/logo-on-mono-light.svg`}
            alt=""
            width="32"
            height="32"
            aria-hidden="true"
          />
          <span class="docs-brand__wordmark">pyreon</span>
        </RouterLink>

        {/* CENTER: search trigger — prominent, fills the center column */}
        <div class="docs-header__search-wrap">
          <button
            type="button"
            class="docs-header__search-btn"
            onClick={() => props.onOpenSearch?.()}
            aria-label="Open search"
            title="Search (⌘K)"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span class="docs-header__search-label">Search docs…</span>
            <kbd class="docs-header__search-kbd">
              {() => (isMac() ? '⌘' : 'Ctrl')}K
            </kbd>
          </button>
        </div>

        {/* RIGHT: nav links + theme + GitHub + mobile hamburger */}
        <div class="docs-header__controls">
          <nav class="docs-header__nav" aria-label="Primary">
            <RouterLink to="/docs/getting-started" class="docs-header__link">
              Docs
            </RouterLink>
          </nav>

          <ThemeToggle />

          <a
            class="docs-header__icon-link"
            href="https://github.com/pyreon/pyreon"
            rel="noopener"
            target="_blank"
            aria-label="GitHub"
            title="GitHub"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .5C5.4.5 0 5.9 0 12.5c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6V21c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6C20.6 22.3 24 17.8 24 12.5 24 5.9 18.6.5 12 .5z"
              />
            </svg>
          </a>

          <button
            type="button"
            class="docs-header__hamburger"
            onClick={() => props.onHamburgerToggle?.()}
            aria-label="Toggle navigation"
            aria-expanded={() => (drawerOpen() ? 'true' : 'false')}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  )
}
