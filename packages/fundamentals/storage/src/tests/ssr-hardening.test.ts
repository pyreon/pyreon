// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCookieWarnings, setCookieSource, useCookie } from '../cookie'
import { useIndexedDB } from '../indexed-db'
import { _resetRegistry } from '../registry'

beforeEach(() => {
  _resetRegistry()
  _resetCookieWarnings()
  setCookieSource(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  _resetRegistry()
})

describe('server-side writes', () => {
  it('useCookie().set() on the server warns once that no Set-Cookie is sent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = useCookie('session', '')
    c.set('a')
    c.set('b')
    expect(c()).toBe('b')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/\[Pyreon\].*"session".*server.*Set-Cookie/)
  })

  it('the server-set warning is dev-only', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useCookie('s2', '').set('a')
    expect(warn).not.toHaveBeenCalled()
  })

  it('useIndexedDB is ready immediately on the server (nothing to load)', async () => {
    const d = useIndexedDB('k', 'default')
    expect(d.ready()).toBe(true)
    await expect(d.whenReady()).resolves.toBeUndefined()
    await expect(d.flush()).resolves.toBeUndefined()
  })
})
