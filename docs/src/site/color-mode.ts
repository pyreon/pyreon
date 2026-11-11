import { signal } from '@pyreon/reactivity'

/**
 * The site's dark/light preference: one store shared by the marketing shell's
 * toggle, the docs header toggle and the root `<PyreonUI mode>`.
 *
 * - No stored choice → follow the OS (`prefers-color-scheme`), live.
 * - A click on a toggle stores the choice under `pyreon-theme` (the key the
 *   tool apps — Loom, Atlas — read too) and stops following the OS.
 * - `PRE_PAINT_SCRIPT` runs in <head> before first paint and writes
 *   `data-theme` on <html>; this module seeds its signal FROM that attribute,
 *   so hydration starts on the mode the visitor already sees: no flash, and
 *   no second write.
 */
export type ColorMode = 'light' | 'dark'

export const STORAGE_KEY = 'pyreon-theme'
/** The VitePress-era key; read once so returning visitors keep their choice. */
export const LEGACY_STORAGE_KEY = 'vitepress-theme-appearance'
export const MODE_ATTRIBUTE = 'data-theme'

/**
 * Inline, blocking, dependency-free. Kept in sync with `resolveInitialMode`
 * below (the unit test runs both on the same inputs).
 */
export const PRE_PAINT_SCRIPT =
  `(function(){var d=document.documentElement,m;try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});` +
  `if(s!=="light"&&s!=="dark"){var l=localStorage.getItem(${JSON.stringify(LEGACY_STORAGE_KEY)});s=l==="light"||l==="dark"?l:null}` +
  `m=s||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}catch(e){m="dark"}` +
  `d.setAttribute(${JSON.stringify(MODE_ATTRIBUTE)},m);d.style.colorScheme=m})()`

/** The same decision as `PRE_PAINT_SCRIPT`, as a pure function. */
export function resolveInitialMode(input: {
  stored: string | null
  legacy: string | null
  prefersLight: boolean
}): ColorMode {
  const s = input.stored
  if (s === 'light' || s === 'dark') return s
  const l = input.legacy
  if (l === 'light' || l === 'dark') return l
  return input.prefersLight ? 'light' : 'dark'
}

const isBrowser = typeof document !== 'undefined'

function readAttribute(): ColorMode {
  if (!isBrowser) return 'dark'
  return document.documentElement.getAttribute(MODE_ATTRIBUTE) === 'light' ? 'light' : 'dark'
}

function readStored(): ColorMode | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s === 'light' || s === 'dark' ? s : null
  } catch {
    return null
  }
}

/** The resolved mode. On the server it is `dark`; the CSS-variables output does not depend on it. */
export const colorMode = signal<ColorMode>(readAttribute())

/**
 * Follow the OS while the visitor has not chosen. One listener for the page's
 * lifetime, installed once when this module first loads in a browser.
 */
if (isBrowser && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (readStored() !== null) return
    colorMode.set(e.matches ? 'light' : 'dark')
  })
}

export function setColorMode(next: ColorMode): void {
  colorMode.set(next)
  if (!isBrowser) return
  // The root <PyreonUI> writes the attribute too (in an effect); writing it
  // here keeps the docs pages, whose CSS reads [data-theme] directly, in step
  // on the same frame.
  document.documentElement.setAttribute(MODE_ATTRIBUTE, next)
  document.documentElement.style.colorScheme = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
}

export function toggleColorMode(): void {
  setColorMode(colorMode() === 'dark' ? 'light' : 'dark')
}
