import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

type Theme = 'dark' | 'light'

// Theme toggle — mirrors VitePress's appearance switch.
// Persists choice in localStorage under the same key the
// FOUC-safe pre-paint script reads, so the toggle survives full
// reload + matches the OS preference when unset.
export function ThemeToggle() {
  const theme = signal<Theme>(currentTheme())

  const apply = (next: Theme) => {
    if (typeof document === 'undefined') return
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // SSR / private mode — fine to swallow.
    }
    theme.set(next)
  }

  const toggle = () => {
    apply(theme() === 'dark' ? 'light' : 'dark')
  }

  onMount(() => {
    // Sync initial signal value with what the pre-paint script wrote.
    theme.set(currentTheme())
  })

  return (
    <button
      type="button"
      class="docs-theme-toggle"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      onClick={toggle}
    >
      {() => (theme() === 'dark' ? <SunIcon /> : <MoonIcon />)}
    </button>
  )
}

const STORAGE_KEY = 'pyreon-docs-appearance'

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return 'dark'
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
