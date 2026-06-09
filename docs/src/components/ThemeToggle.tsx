import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Theme toggle — sun/moon icon button. Persists to localStorage under
 * the key `vitepress-theme-appearance` (matches VitePress's storage key
 * so users with a stored preference from the legacy site see no flicker
 * after the cut-over). Sets `data-theme` on `<html>`; tokens.css reads
 * `:root` (dark) by default and `[data-theme="light"]` for the light
 * palette.
 *
 * The initial value is read from the in-DOM `data-theme` attribute that
 * the FOUC pre-paint script in index.html set BEFORE this component
 * mounted — so the visual state matches what the user sees, even when
 * the localStorage value is missing or stale.
 */
const STORAGE_KEY = 'vitepress-theme-appearance'

export function ThemeToggle() {
  const isDark = signal(true)

  onMount(() => {
    if (typeof document === 'undefined') return
    isDark.set(document.documentElement.dataset.theme !== 'light')
  })

  const toggle = () => {
    const next = isDark() ? 'light' : 'dark'
    isDark.set(!isDark())
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = next
    }
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable — ignore (e.g. private mode quota).
    }
  }

  return (
    <button
      type="button"
      class="docs-theme-toggle"
      onClick={toggle}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {() =>
        isDark() ? (
          // Sun icon — shown in dark mode (click → light)
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          // Moon icon — shown in light mode (click → dark)
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )
      }
    </button>
  )
}
