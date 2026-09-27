import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCookieWarnings } from '../cookie'
import { _resetRegistry, useCookie, useStorage } from '../index'

function clearAllCookies(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  }
}

/** Capture every string assigned to `document.cookie` (still applying it). */
function captureCookieWrites(): string[] {
  const writes: string[] = []
  let proto: object | null = document
  let desc: PropertyDescriptor | undefined
  while (proto && !desc) {
    desc = Object.getOwnPropertyDescriptor(proto, 'cookie')
    proto = Object.getPrototypeOf(proto)
  }
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => desc!.get!.call(document),
    set: (v: string) => {
      writes.push(v)
      desc!.set!.call(document, v)
    },
  })
  return writes
}

beforeEach(() => {
  _resetCookieWarnings()
  _resetRegistry()
  clearAllCookies()
})

afterEach(() => {
  delete (document as { cookie?: string }).cookie // drop the capture shim
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  _resetRegistry()
  clearAllCookies()
})

describe('useCookie — names that need encoding round-trip', () => {
  it.each(['a b', 'user;id', 'ünï', 'k=v'])('a cookie named %j reads back after reload', (name) => {
    useCookie(name, 'default').set('persisted')

    _resetRegistry() // a fresh page load: nothing cached, read from document.cookie
    expect(useCookie(name, 'default')()).toBe('persisted')
  })

  it('a name with a malformed percent-escape still reads (raw fallback)', () => {
    document.cookie = 'bad%zz=' + encodeURIComponent(JSON.stringify('v')) + '; path=/'
    expect(useCookie('bad%zz', 'default')()).toBe('v')
  })
})

describe('useCookie — secure defaults', () => {
  it('defaults `secure` to true on an https page', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const writes = captureCookieWrites()
    useCookie('s', 'a').set('b')
    expect(writes.at(-1)).toMatch(/; secure/)
  })

  it('does not add `secure` on an http page', () => {
    vi.stubGlobal('location', { protocol: 'http:' })
    const writes = captureCookieWrites()
    useCookie('s', 'a').set('b')
    expect(writes.at(-1)).not.toMatch(/; secure/)
  })

  it('an explicit `secure: false` on https is honoured', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const writes = captureCookieWrites()
    useCookie('s', 'a', { secure: false }).set('b')
    expect(writes.at(-1)).not.toMatch(/; secure/)
  })

  it('`sameSite: "none"` implies `secure` (browsers reject it otherwise)', () => {
    vi.stubGlobal('location', { protocol: 'http:' })
    const writes = captureCookieWrites()
    useCookie('s', 'a', { sameSite: 'none' }).set('b')
    expect(writes.at(-1)).toMatch(/; secure/)
    expect(writes.at(-1)).toMatch(/samesite=none/)
  })

  it('warns when `sameSite: "none"` is combined with an explicit `secure: false`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useCookie('s', 'a', { sameSite: 'none', secure: false }).set('b')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[Pyreon\].*sameSite.*none.*secure/))
  })

  it('warns when a cookie exceeds the ~4KB browser limit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useCookie('big', '').set('x'.repeat(5000))
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[Pyreon\].*"big".*4096/))
  })

  it('does not warn for an ordinary cookie', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useCookie('small', '').set('ok')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('same-key call with different options', () => {
  it('warns once when a second call passes a different default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useStorage('theme', 'light')
    useStorage('theme', 'dark')
    useStorage('theme', 'dark')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/\[Pyreon\].*"theme".*default value/)
  })

  it('warns when a second call passes a different option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useCookie('c', 'x', { maxAge: 60 })
    useCookie('c', 'x', { maxAge: 3600 })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/`maxAge` option/))
  })

  it('does not warn for equal object defaults, equal dates, or fresh inline callbacks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const opts = () => ({ serializer: (v: { a: number }) => JSON.stringify(v), expires: new Date(1) })
    useCookie('o', { a: 1 }, opts())
    useCookie('o', { a: 1 }, opts())
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays silent in production (dev-only diagnostics)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useStorage('p', 'a')
    useStorage('p', 'b')
    useCookie('pc', '', { sameSite: 'none', secure: false }).set('x'.repeat(5000))
    expect(warn).not.toHaveBeenCalled()
  })
})
