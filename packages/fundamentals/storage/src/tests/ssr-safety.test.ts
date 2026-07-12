// @vitest-environment node
//
// SSR-safety: runs in a real Node context (NO `document`, NO `window`, NO
// `localStorage`) so `isClient` from @pyreon/reactivity is `false` and every
// browser-API guard takes its SERVER branch. This is the Node half of the
// test-environment-parity contract (the happy-dom tests are the client half):
// each browser-backed hook must return the default and no-op its writes on the
// server WITHOUT throwing, and `useCookie` must read from `setCookieSource`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStorage, _resetStorageListener } from '../local'
import { useSessionStorage } from '../session'
import { setCookieSource, useCookie } from '../cookie'
import { useMemoryStorage } from '../custom'
import { useIndexedDB } from '../indexed-db'
import { clearStorage, removeStorage } from '../clear'
import { _resetRegistry } from '../registry'

beforeEach(() => {
  _resetRegistry()
  _resetStorageListener()
  setCookieSource(null)
})
afterEach(() => {
  _resetRegistry()
  _resetStorageListener()
  setCookieSource(null)
})

describe('SSR — no DOM globals present', () => {
  it('sanity: no document/window/localStorage in this environment', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
    expect(typeof localStorage).toBe('undefined')
  })
})

describe('useStorage (localStorage) on the server', () => {
  it('returns the default and no-ops writes without throwing', () => {
    const s = useStorage('theme', 'light')
    expect(s()).toBe('light')
    expect(() => s.set('dark')).not.toThrow()
    // The in-memory signal still updates — only persistence is skipped.
    expect(s()).toBe('dark')
    expect(() => s.remove()).not.toThrow()
    expect(s()).toBe('light')
  })

  it('does not attach a cross-tab listener on the server (retain/release guards)', () => {
    const s = useStorage('k', 0)
    // Second consumer + release paths hit the SSR early-returns.
    const s2 = useStorage('k', 0)
    expect(s).toBe(s2)
    expect(() => s2.remove()).not.toThrow()
    expect(() => s.remove()).not.toThrow()
  })
})

describe('useSessionStorage on the server', () => {
  it('returns the default and no-ops writes', () => {
    const s = useSessionStorage('step', 0)
    expect(s()).toBe(0)
    expect(() => s.set(3)).not.toThrow()
    expect(s()).toBe(3)
  })
})

describe('useCookie on the server', () => {
  it('falls back to the default when no cookie source is set', () => {
    const c = useCookie('locale', 'en')
    expect(c()).toBe('en')
  })

  // Cookie values are JSON-serialized + URL-encoded by the writer, so a seeded
  // header must match: `key=<encodeURIComponent(JSON.stringify(value))>`.
  const cookiePair = (k: string, v: unknown) => `${k}=${encodeURIComponent(JSON.stringify(v))}`

  it('reads from a STRING cookie source', () => {
    setCookieSource(`${cookiePair('locale', 'de')}; ${cookiePair('theme', 'dark')}`)
    const locale = useCookie('locale', 'en')
    expect(locale()).toBe('de')
    _resetRegistry()
    const theme = useCookie('theme', 'light')
    expect(theme()).toBe('dark')
  })

  it('reads from an ACCESSOR cookie source (lazy, per-request seam)', () => {
    let header = cookiePair('locale', 'fr')
    setCookieSource(() => header)
    const locale = useCookie('locale', 'en')
    expect(locale()).toBe('fr')
    // Accessor is evaluated at read time — a later request context swap is seen
    // by a fresh registration.
    header = cookiePair('locale', 'es')
    _resetRegistry()
    expect(useCookie('locale', 'en')()).toBe('es')
  })

  it('skips malformed / empty-name cookie pairs in the header', () => {
    setCookieSource(`=orphan; ${cookiePair('locale', 'de')}; no-equals-sign`)
    expect(useCookie('locale', 'en')()).toBe('de')
  })

  it('no-ops writes/removes on the server without throwing', () => {
    setCookieSource(cookiePair('x', 1))
    const c = useCookie('x', 0)
    expect(c()).toBe(1)
    expect(() => c.set(9)).not.toThrow()
    expect(c()).toBe(9) // signal updates; document.cookie write skipped
    expect(() => c.remove()).not.toThrow()
  })
})

describe('useMemoryStorage on the server', () => {
  it('works fully in-process (the SSR-safe fallback)', () => {
    const m = useMemoryStorage('id', '')
    m.set('abc')
    expect(m()).toBe('abc')
    // Same key returns the same signal within the process.
    expect(useMemoryStorage('id', '')()).toBe('abc')
  })
})

describe('useIndexedDB on the server', () => {
  it('returns the default and no-ops without throwing (no indexedDB global)', () => {
    const d = useIndexedDB('draft', { title: '' })
    expect(d()).toEqual({ title: '' })
    expect(() => d.set({ title: 'x' })).not.toThrow()
    expect(() => d.remove()).not.toThrow()
  })
})

describe('cleanup utilities on the server', () => {
  it('removeStorage / clearStorage do not throw', () => {
    useStorage('a', 1)
    useSessionStorage('b', 2)
    expect(() => removeStorage('a')).not.toThrow()
    expect(() => removeStorage('b', { type: 'session' })).not.toThrow()
    expect(() => removeStorage('never-registered')).not.toThrow()
    expect(() => clearStorage('all')).not.toThrow()
  })
})
