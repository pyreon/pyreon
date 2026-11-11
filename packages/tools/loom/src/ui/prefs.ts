/**
 * Browser-held preferences — theme choice, viewport class, and a selection
 * carried in the URL hash. Split from `model.ts` so the model stays pure and
 * SSR-safe: the host resolves these ONCE and hands them to `createModel`.
 *
 * Every accessor takes its environment as an argument (storage, media query,
 * hash) so the rules are unit-testable without a DOM; `readPrefs()` is the
 * thin binding to the real globals. Storage access is wrapped: it throws in
 * private windows / with blocked site data, and a theme preference is never
 * worth a crash.
 */
import { isServer } from '@pyreon/reactivity'
import type { ModelInit } from './model'

/**
 * The SHARED Pyreon theme preference — pyreon.dev, the docs, Atlas and Loom
 * all read and write it, so choosing light in one is light in all of them.
 */
export const THEME_KEY = 'pyreon-theme'
/** Loom's own key before it joined the shared one — still read as a fallback. */
export const LEGACY_THEME_KEY = 'loom:theme'
/** The layout breakpoint below which the sidebar + detail panel become drawers. */
export const MOBILE_QUERY = '(max-width: 760px)'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * The shared rule: a remembered explicit choice wins; otherwise light only
 * when the OS asks for light — dark is the default, as on pyreon.dev.
 */
export function resolveDark(stored: string | null, prefersLight: boolean): boolean {
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return !prefersLight
}

/** The stored choice: the shared key, else Loom's legacy one. */
export function storedTheme(storage: StorageLike | undefined): string | null {
  const shared = safeGet(storage, THEME_KEY)
  if (shared === 'dark' || shared === 'light') return shared
  return safeGet(storage, LEGACY_THEME_KEY)
}

/** `#pkg=@pyreon/core` → `@pyreon/core`. Anything else → undefined. */
export function selFromHash(hash: string): string | undefined {
  const m = /^#?pkg=(.+)$/.exec(hash)
  if (!m) return undefined
  try {
    return decodeURIComponent(m[1]!)
  } catch {
    return undefined
  }
}

/** The hash that carries a selection — the inverse of `selFromHash`. Package
 * names only ever contain `@`, `/`, `.`, `-`, `_`, so keep them readable. */
export function hashForSel(id: string): string {
  return `#pkg=${encodeURIComponent(id).replace(/%40/g, '@').replace(/%2F/g, '/')}`
}

function safeGet(storage: StorageLike | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeThemePref(
  dark: boolean,
  storage: StorageLike | undefined = globalStorage(),
): void {
  try {
    storage?.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch {
    // Blocked storage: the toggle still works for this page, it just is not
    // remembered.
  }
}

function globalStorage(): StorageLike | undefined {
  if (isServer) return undefined
  try {
    return localStorage
  } catch {
    return undefined
  }
}

/** What the browser tells us, abstracted so the rules below are pure. */
export interface PrefsEnv {
  hash: string
  matches: (query: string) => boolean
  storage: StorageLike | undefined
}

/** Resolve the starting state from an environment — pure. */
export function prefsFrom(env: PrefsEnv): ModelInit {
  const mobile = env.matches(MOBILE_QUERY)
  const sel = selFromHash(env.hash)
  return {
    dark: resolveDark(storedTheme(env.storage), env.matches('(prefers-color-scheme: light)')),
    navOpen: !mobile,
    panelOpen: !mobile,
    ...(sel ? { selId: sel } : {}),
  }
}

/** Resolve the starting state from the real browser globals. SSR → `{}`. */
export function readPrefs(): ModelInit {
  if (isServer) return {}
  return prefsFrom({
    hash: location.hash,
    matches: (q) => typeof matchMedia === 'function' && matchMedia(q).matches,
    storage: globalStorage(),
  })
}
