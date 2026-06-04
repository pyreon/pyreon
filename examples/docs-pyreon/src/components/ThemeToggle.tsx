import { signal } from '@pyreon/reactivity'

/**
 * Theme mode — 'dark' | 'light'. Reads/writes `localStorage` and
 * mirrors the value onto `<html data-theme>` so tokens.css can swap
 * the palette without a flash. The pre-paint script in index.html
 * handles the initial value before this signal is constructed.
 */
function readStored(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  return (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark'
}

export const themeMode = signal<'dark' | 'light'>(readStored())

if (typeof document !== 'undefined') {
  themeMode.subscribe(() => {
    const v = themeMode.peek()
    document.documentElement.dataset.theme = v
    try {
      localStorage.setItem('pyreon-theme', v)
    } catch {
      // ignore
    }
  })
}

export function ThemeToggle() {
  const toggle = () => themeMode.set(themeMode.peek() === 'dark' ? 'light' : 'dark')
  return (
    <button
      class="theme-toggle"
      onClick={toggle}
      aria-label={() => (themeMode() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d={() =>
            themeMode() === 'dark'
              ? 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
              : 'M12 4V2m0 20v-2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'
          }
          fill={() => (themeMode() === 'dark' ? 'currentColor' : 'none')}
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  )
}
