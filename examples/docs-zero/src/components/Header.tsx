import { RouterLink } from '@pyreon/router'
import { signal } from '@pyreon/reactivity'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  /** Optional toggle for the mobile sidebar drawer. */
  onToggleSidebar?: () => void
}

// Sticky docs header. Logo + nav + theme toggle (+ optional mobile
// sidebar hamburger when the layout's narrow). Single-source —
// every page in the site renders this exact instance.
export function Header(props: HeaderProps) {
  // Search-button state: opens the (lazy-loaded) command palette.
  const searchOpen = signal(false)

  return (
    <header class="docs-header">
      <div class="docs-header__left">
        {props.onToggleSidebar ? (
          <button
            type="button"
            class="docs-hamburger"
            aria-label="Toggle navigation menu"
            onClick={props.onToggleSidebar}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        ) : null}
        <RouterLink to="/" class="docs-logo">
          Pyreon
        </RouterLink>
      </div>
      <nav class="docs-nav" aria-label="Primary navigation">
        <RouterLink to="/docs/getting-started">Docs</RouterLink>
        <a
          href="https://github.com/pyreon/pyreon"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </nav>
      <div class="docs-header__right">
        <button
          type="button"
          class="docs-search-btn"
          aria-label="Search"
          onClick={() => searchOpen.set(!searchOpen())}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span class="docs-search-btn__label">Search</span>
          <kbd>⌘ K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
