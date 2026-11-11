import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { colorMode, toggleColorMode } from '../site/color-mode'

/**
 * Docs header theme toggle — sun/moon icon button over the site-wide
 * colour-mode store (`src/site/color-mode.ts`), the same one the marketing
 * shell's toggle and the root `<PyreonUI>` use, so a choice made on either
 * side carries over. The pre-paint script in index.html has already set
 * `data-theme` before this mounts.
 *
 * The icon renders the dark variant on the server AND during hydration
 * (`mounted` is false until `onMount`), then follows the store, so the
 * hydrated DOM always matches the prerendered HTML.
 */
export function ThemeToggle() {
  const mounted = signal(false)
  onMount(() => {
    mounted.set(true)
  })
  const isDark = () => !mounted() || colorMode() === 'dark'
  const toggle = () => toggleColorMode()

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
