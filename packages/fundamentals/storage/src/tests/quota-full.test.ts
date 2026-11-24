// A FULL storage (every write throws `QuotaExceededError`) is still readable:
// the data is there and `getItem` works. A failed write must never change what
// reads return (#4812). Before the fix, `getWebStorage()` probed availability
// with a test WRITE; on a full storage that write threw, the backend was
// treated as absent for reads too, and `useStorage` returned the DEFAULT — an
// app "forgot" a stored session or setting on any device whose storage
// happened to be full.
//
// The contract, for every backend: the stored value stays authoritative for
// reads, a `.set()` still updates the in-memory signal, and the write failure
// reaches `onError` (the package's existing error channel) instead of being
// swallowed or thrown out of `.set()`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRegistry,
  _resetStorageListener,
  createStorage,
  removeStorage,
  useCookie,
  useSessionStorage,
  useStorage,
} from '../index'

/** Make every `setItem` on `area` throw the real quota error, leaving reads intact. */
function fillUp(area: Storage): () => void {
  const realSet = area.setItem
  Object.defineProperty(area, 'setItem', {
    configurable: true,
    value: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    },
  })

  return () => {
    Object.defineProperty(area, 'setItem', { configurable: true, value: realSet })
  }
}

beforeEach(() => {
  _resetRegistry()
  _resetStorageListener()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  _resetRegistry()
  _resetStorageListener()
  localStorage.clear()
  sessionStorage.clear()
})

describe.each([
  ['localStorage', () => localStorage, useStorage],
  ['sessionStorage', () => sessionStorage, useSessionStorage],
] as const)('a full %s (#4812)', (_name, area, useHook) => {
  it('reads the stored value, not the default', () => {
    area().setItem('theme', JSON.stringify('dark'))
    const restore = fillUp(area())
    try {
      expect(useHook('theme', 'light')()).toBe('dark')
    } finally {
      restore()
    }
  })

  it('a failed set() updates the signal, keeps the stored value and reports to onError', () => {
    area().setItem('theme', JSON.stringify('dark'))
    const restore = fillUp(area())
    try {
      const onError = vi.fn()
      const theme = useHook('theme', 'light', { onError })
      theme.set('blue')
      expect(theme()).toBe('blue')
      expect(area().getItem('theme')).toBe(JSON.stringify('dark'))
      expect(onError).toHaveBeenCalledTimes(1)
      expect((onError.mock.calls[0]![0] as DOMException).name).toBe('QuotaExceededError')
    } finally {
      restore()
    }
  })

  it('a failed set() does not throw without an onError', () => {
    const restore = fillUp(area())
    try {
      const theme = useHook('theme', 'light')
      expect(() => theme.set('blue')).not.toThrow()
      expect(theme()).toBe('blue')
    } finally {
      restore()
    }
  })

  it('remove() still deletes from a full storage', () => {
    area().setItem('theme', JSON.stringify('dark'))
    const restore = fillUp(area())
    try {
      const theme = useHook('theme', 'light')
      theme.remove()
      expect(theme()).toBe('light')
      expect(area().getItem('theme')).toBeNull()
    } finally {
      restore()
    }
  })

  it('a remove() the storage refuses reports to onError and still resets the signal', () => {
    area().setItem('theme', JSON.stringify('dark'))
    const realRemove = area().removeItem
    Object.defineProperty(area(), 'removeItem', {
      configurable: true,
      value: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    try {
      const onError = vi.fn()
      const theme = useHook('theme', 'light', { onError })
      expect(() => theme.remove()).not.toThrow()
      expect(theme()).toBe('light')
      expect(onError).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(area(), 'removeItem', { configurable: true, value: realRemove })
    }
  })

  it('a write that fails once does not stop later writes from persisting', () => {
    const restore = fillUp(area())
    const theme = useHook<string>('theme', 'light', { onError: () => undefined })
    theme.set('blue')
    restore() // space was freed
    theme.set('green')
    expect(area().getItem('theme')).toBe(JSON.stringify('green'))
  })
})

describe('removeStorage on a full storage without a live binding (#4812)', () => {
  it('still clears the raw key', () => {
    localStorage.setItem('orphan', '"x"')
    const restore = fillUp(localStorage)
    try {
      removeStorage('orphan')
      expect(localStorage.getItem('orphan')).toBeNull()
    } finally {
      restore()
    }
  })
})

describe('a cookie write the browser refuses (#4812)', () => {
  it('reports to onError instead of throwing out of set(); the signal still updates', () => {
    document.cookie = `lang=${encodeURIComponent(JSON.stringify('de'))}; path=/`
    let owner = Object.getPrototypeOf(document) as object | null
    while (owner && !Object.getOwnPropertyDescriptor(owner, 'cookie')) {
      owner = Object.getPrototypeOf(owner) as object | null
    }
    const real = Object.getOwnPropertyDescriptor(owner!, 'cookie')!
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => real.get!.call(document),
      set: () => {
        throw new DOMException('cookies are disabled in this document', 'SecurityError')
      },
    })
    try {
      const onError = vi.fn()
      const lang = useCookie('lang', 'en', { onError })
      expect(lang()).toBe('de')
      expect(() => lang.set('fr')).not.toThrow()
      expect(lang()).toBe('fr')
      expect(onError).toHaveBeenCalledTimes(1)
      expect(() => lang.remove()).not.toThrow()
      expect(onError).toHaveBeenCalledTimes(2)
    } finally {
      Reflect.deleteProperty(document, 'cookie')
      document.cookie = 'lang=; max-age=0; path=/'
    }
  })

  it('a cookie read the browser refuses falls back to the default', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => {
        throw new DOMException('cookies are disabled in this document', 'SecurityError')
      },
      set: () => {},
    })
    try {
      expect(useCookie('lang', 'en')()).toBe('en')
    } finally {
      Reflect.deleteProperty(document, 'cookie')
    }
  })
})

describe('a custom backend whose remove() throws (#4812)', () => {
  it('a non-Error thrown by a write still reaches onError as an Error', () => {
    const onError = vi.fn()
    const useStringThrower = createStorage(
      {
        get: () => null,
        set: () => {
          // oxlint-disable-next-line no-throw-literal -- a third-party backend may throw anything
          throw 'disk full'
        },
        remove: () => {},
      },
      'string-thrower',
    )
    useStringThrower('k', 'a', { onError }).set('b')
    const err = onError.mock.calls[0]![0] as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('disk full')
  })

  it('reports to onError; the signal is reset', () => {
    const onError = vi.fn()
    const useFlaky = createStorage(
      {
        get: () => '"stored"',
        set: () => {},
        remove: () => {
          throw new Error('remove failed')
        },
      },
      'flaky-remove',
    )
    const s = useFlaky('k', 'default', { onError })
    expect(s()).toBe('stored')
    s.remove()
    expect(s()).toBe('default')
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
