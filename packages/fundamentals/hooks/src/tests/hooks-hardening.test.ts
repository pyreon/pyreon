// Regression locks for the 2026-09 @pyreon/hooks hardening pass. Each block
// names the failure it pins; every one was written against the broken code
// first and bisect-verified (see the PR body).

import { h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useClickOutside } from '../useClickOutside'
import { useElementSize } from '../useElementSize'
import { useEventListener } from '../useEventListener'
import { useGeolocation } from '../useGeolocation'
import { useInfiniteScroll } from '../useInfiniteScroll'
import { useIntersection } from '../useIntersection'
import { useKeyboard } from '../useKeyboard'
import { useLinking } from '../useLinking'
import { useMediaQuery } from '../useMediaQuery'
import { useNotifications } from '../useNotifications'
import { useScrollLock } from '../useScrollLock'
import { useSpeech } from '../useSpeech'
import { useTimeAgo } from '../useTimeAgo'
import { useWebSocket } from '../useWebSocket'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function host(): HTMLDivElement {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

// ─── useGeolocation ─────────────────────────────────────────────────────────

describe('useGeolocation — a non-fatal error does not orphan the watch', () => {
  function install() {
    let failure: ((err: { code: number; message: string }) => void) | undefined
    const clearWatch = vi.fn()
    const watchPosition = vi.fn((_ok: unknown, err: typeof failure) => {
      failure = err
      return 42
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })
    return {
      clearWatch,
      watchPosition,
      fail: (code: number, message: string) => failure?.({ code, message }),
    }
  }

  it('TIMEOUT keeps the watch alive — stop() still clears it, start() does not open a second', () => {
    const g = install()
    const geo = useGeolocation()
    geo.start()
    g.fail(3, 'Timeout expired')
    expect(geo.error).toContain('Timeout expired')
    // The browser keeps watching after a TIMEOUT / POSITION_UNAVAILABLE, so
    // the hook must keep the id — dropping it leaves the GPS running with
    // nothing able to clear it.
    expect(geo.isTracking).toBe(true)
    geo.start()
    expect(g.watchPosition).toHaveBeenCalledTimes(1)
    geo.stop()
    expect(g.clearWatch).toHaveBeenCalledWith(42)
  })

  it('PERMISSION_DENIED ends the watch and clears it explicitly', () => {
    const g = install()
    const geo = useGeolocation()
    geo.start()
    g.fail(1, 'User denied Geolocation')
    expect(geo.isTracking).toBe(false)
    expect(g.clearWatch).toHaveBeenCalledWith(42)
    geo.start()
    expect(g.watchPosition).toHaveBeenCalledTimes(2)
  })
})

// ─── useEventListener ───────────────────────────────────────────────────────

describe('useEventListener — a ref target resolves at MOUNT, not at setup', () => {
  it('binds to the element a ref points at after mount, never falling back to window', () => {
    const root = host()
    const onClick = vi.fn()
    let btn: HTMLButtonElement | null = null
    function Comp() {
      useEventListener('click', onClick, undefined, () => btn)
      return h('button', { ref: (el: HTMLButtonElement | null) => { btn = el } }, 'x')
    }
    const dispose = mount(h(Comp, null), root)
    // A click elsewhere must NOT fire — the old code bound to window because
    // the ref was still null during setup.
    window.dispatchEvent(new MouseEvent('click'))
    expect(onClick).not.toHaveBeenCalled()
    btn!.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
    dispose()
    btn = null
    root.remove()
  })

  it('accepts an EventTarget directly', () => {
    const el = document.createElement('div')
    const onClick = vi.fn()
    useEventListener('click', onClick, undefined, el)
    el.dispatchEvent(new MouseEvent('click'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('warns (and binds nothing) when a given target is still null after mount', () => {
    const root = host()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onClick = vi.fn()
    function Comp() {
      useEventListener('click', onClick, undefined, () => null)
      return h('div', null)
    }
    const dispose = mount(h(Comp, null), root)
    window.dispatchEvent(new MouseEvent('click'))
    expect(onClick).not.toHaveBeenCalled()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('useEventListener'))).toBe(true)
    dispose()
    root.remove()
  })
})

// ─── useTimeAgo ─────────────────────────────────────────────────────────────

describe('useTimeAgo', () => {
  it('a reactive date getter is TRACKED — a change updates without waiting for the timer', () => {
    vi.useFakeTimers()
    const now = Date.now()
    const date = signal(now - 10_000)
    const e = effect(() => {})
    const result = useTimeAgo(() => date())
    vi.advanceTimersByTime(0)
    expect(result()).toMatch(/10 seconds? ago/)
    date.set(now - 3 * 3600_000)
    expect(result()).toMatch(/3 hours? ago/)
    e.dispose()
  })

  it('"just now" goes through a custom formatter too', () => {
    const formatter = vi.fn((value: number, unit: string) => `${value}:${unit}`)
    const result = useTimeAgo(Date.now() - 1000, { formatter })
    expect(result()).toBe('0:second')
  })
})

// ─── useSpeech ──────────────────────────────────────────────────────────────

describe('useSpeech — only the CURRENT utterance drives state', () => {
  type U = { text: string; onend: (() => void) | null; onerror: (() => void) | null }
  function installEngine() {
    let current: U | null = null
    const synth = {
      speak: vi.fn((u: U) => {
        current = u
      }),
      // Browsers fire the cancelled utterance's `onend` ASYNCHRONOUSLY — i.e.
      // after the replacing speak() already set speaking=true. That late event
      // is what flipped speaking() to false mid-speech.
      cancel: vi.fn(() => {
        const u = current
        current = null
        if (u) queueMicrotask(() => u.onend?.())
      }),
    }
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string
        onend: (() => void) | null = null
        onerror: (() => void) | null = null
        constructor(t: string) {
          this.text = t
        }
      },
    )
    return synth
  }

  it('a replacing speak() keeps speaking() true', async () => {
    installEngine()
    const s = useSpeech()
    await s.speak('one')
    await s.speak('two')
    await new Promise((r) => setTimeout(r, 0))
    expect(s.speaking()).toBe(true)
  })

  it('unmounting a hook that is not speaking does not cancel another hook’s speech', async () => {
    const synth = installEngine()
    const other = useSpeech()
    await other.speak('keep talking')
    synth.cancel.mockClear()
    const e = effect(() => {
      useSpeech()
    })
    e.dispose()
    expect(synth.cancel).not.toHaveBeenCalled()
    expect(other.speaking()).toBe(true)
  })
})

// ─── useNotifications ───────────────────────────────────────────────────────

describe('useNotifications', () => {
  it('falls back to the service-worker registration when the constructor throws (Android Chrome)', async () => {
    class ThrowingNotification {
      static permission = 'granted'
      static requestPermission = vi.fn()
      constructor() {
        throw new TypeError("Failed to construct 'Notification': Illegal constructor.")
      }
    }
    vi.stubGlobal('Notification', ThrowingNotification)
    const showNotification = vi.fn(() => Promise.resolve())
    const nav = navigator as Navigator & { serviceWorker?: unknown }
    const original = Object.getOwnPropertyDescriptor(nav, 'serviceWorker')
    Object.defineProperty(nav, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification }) },
      configurable: true,
    })
    try {
      expect(() => useNotifications().notify('Saved', 'done')).not.toThrow()
      await new Promise((r) => setTimeout(r, 0))
      expect(showNotification).toHaveBeenCalledWith('Saved', { body: 'done' })
    } finally {
      if (original) Object.defineProperty(nav, 'serviceWorker', original)
      else delete (nav as { serviceWorker?: unknown }).serviceWorker
    }
  })

  it('notify() on a platform without the API says so in dev', () => {
    vi.stubGlobal('Notification', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useNotifications().notify('a', 'b')
    expect(warn.mock.calls.some((c) => String(c[0]).includes('useNotifications'))).toBe(true)
  })
})

// ─── useClickOutside ────────────────────────────────────────────────────────

describe('useClickOutside — one handler call per tap', () => {
  it('a touch tap (pointerdown + legacy mousedown/touchstart) fires the handler ONCE', () => {
    const root = host()
    const onOutside = vi.fn()
    let panel: HTMLDivElement | null = null
    function Comp() {
      useClickOutside(() => panel, onOutside)
      return h('div', { ref: (el: HTMLDivElement | null) => { panel = el } }, 'p')
    }
    const dispose = mount(h(Comp, null), root)
    // What a mobile browser dispatches for one tap outside.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onOutside).toHaveBeenCalledTimes(1)
    dispose()
    panel = null
    root.remove()
  })
})

// ─── useInfiniteScroll ──────────────────────────────────────────────────────

describe('useInfiniteScroll — a first page that does not fill the container', () => {
  function installIO() {
    const state = { visible: true }
    let cb: ((e: IntersectionObserverEntry[]) => void) | null = null
    class MockIO {
      constructor(c: (e: IntersectionObserverEntry[]) => void) {
        cb = c
      }
      observe() {
        // A real IO reports the current state on every observe().
        const fire = cb
        queueMicrotask(() => fire?.([{ isIntersecting: state.visible } as IntersectionObserverEntry]))
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
    return state
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('keeps loading while the sentinel stays visible after a page lands', async () => {
    installIO()
    let pages = 0
    const hasMore = signal(true)
    const onLoadMore = vi.fn(async () => {
      pages++
      if (pages >= 3) hasMore.set(false)
    })
    const { ref } = useInfiniteScroll(onLoadMore, { hasMore })
    ref(document.createElement('div'))
    for (let i = 0; i < 6; i++) await flush()
    expect(onLoadMore).toHaveBeenCalledTimes(3)
  })

  it('a sync onLoadMore driving a `loading` signal re-checks when loading settles', async () => {
    installIO()
    const loading = signal(false)
    let pages = 0
    const onLoadMore = vi.fn(() => {
      pages++
      loading.set(true)
    })
    const { ref } = useInfiniteScroll(onLoadMore, {
      loading,
      hasMore: () => pages < 2,
    })
    ref(document.createElement('div'))
    await flush()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    loading.set(false) // page 1 landed, sentinel still visible
    await flush()
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('does not re-enter while a load is in flight', async () => {
    let cb: ((e: IntersectionObserverEntry[]) => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(c: typeof cb) {
          cb = c
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    let resolve!: () => void
    const onLoadMore = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const { ref } = useInfiniteScroll(onLoadMore)
    ref(document.createElement('div'))
    cb!([{ isIntersecting: true } as IntersectionObserverEntry])
    cb!([{ isIntersecting: false } as IntersectionObserverEntry])
    cb!([{ isIntersecting: true } as IntersectionObserverEntry])
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    resolve()
  })
})

// ─── useLinking ─────────────────────────────────────────────────────────────

describe('useLinking — scheme allowlist', () => {
  it('refuses javascript: and data: URLs', () => {
    const open = vi.fn()
    vi.spyOn(window, 'open').mockImplementation(open)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const linking = useLinking()
    linking.openUrl('javascript:alert(1)')
    linking.openUrl('  JaVaScRiPt:alert(1)')
    linking.openUrl('data:text/html,<script>alert(1)</script>')
    expect(open).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('still opens http(s), mailto, tel and relative URLs', () => {
    const open = vi.fn()
    vi.spyOn(window, 'open').mockImplementation(open)
    const linking = useLinking()
    for (const url of ['https://a.dev', 'http://a.dev', 'mailto:a@b.c', 'tel:+100', '/docs']) {
      linking.openUrl(url)
    }
    expect(open).toHaveBeenCalledTimes(5)
  })
})

// ─── useIntersection / useElementSize — the element can arrive after mount ──

describe('element-observing hooks track a reactive element getter', () => {
  it('useIntersection observes an element that appears after mount', () => {
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(el: Element) {
          observed.push(el)
        }
        disconnect() {}
      },
    )
    const root = host()
    const target = signal<HTMLElement | null>(null)
    function Comp() {
      useIntersection(() => target())
      return h('div', null)
    }
    const dispose = mount(h(Comp, null), root)
    expect(observed).toHaveLength(0)
    const el = document.createElement('div')
    target.set(el)
    expect(observed).toEqual([el])
    dispose()
    root.remove()
  })

  it('useElementSize measures an element that appears after mount', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const root = host()
    const target = signal<HTMLElement | null>(null)
    let size!: ReturnType<typeof useElementSize>
    function Comp() {
      size = useElementSize(() => target())
      return h('div', null)
    }
    const dispose = mount(h(Comp, null), root)
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ width: 120, height: 40 }) as DOMRect
    target.set(el)
    expect(size()).toEqual({ width: 120, height: 40 })
    dispose()
    root.remove()
  })
})

// ─── useMediaQuery ──────────────────────────────────────────────────────────

describe('useMediaQuery — a reactive query re-subscribes', () => {
  it('follows the query getter', () => {
    const matchMedia = vi.fn((q: string) => ({
      matches: q === '(min-width: 800px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('matchMedia', matchMedia)
    const root = host()
    const query = signal('(min-width: 400px)')
    let matches!: () => boolean
    function Comp() {
      matches = useMediaQuery(() => query())
      return h('div', null)
    }
    const dispose = mount(h(Comp, null), root)
    expect(matches()).toBe(false)
    query.set('(min-width: 800px)')
    expect(matches()).toBe(true)
    dispose()
    root.remove()
  })
})

// ─── useKeyboard ────────────────────────────────────────────────────────────

describe('useKeyboard — ignoreInputs', () => {
  it('skips keys typed into an editable field when ignoreInputs is set', () => {
    const root = host()
    const handler = vi.fn()
    function Comp() {
      useKeyboard('k', handler, { ignoreInputs: true })
      return h('input', null)
    }
    const dispose = mount(h(Comp, null), root)
    const input = root.querySelector('input')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
    dispose()
    root.remove()
  })
})

// ─── useScrollLock ──────────────────────────────────────────────────────────

describe('useScrollLock — layout-shift + iOS', () => {
  it('compensates for the removed scrollbar and locks <html> too, then restores both', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1009,
      configurable: true,
    })
    try {
      const { lock, unlock } = useScrollLock()
      lock()
      expect(document.body.style.paddingRight).toBe('15px')
      expect(document.documentElement.style.overflow).toBe('hidden')
      unlock()
      expect(document.body.style.paddingRight).toBe('')
      expect(document.documentElement.style.overflow).toBe('')
    } finally {
      delete (document.documentElement as { clientWidth?: number }).clientWidth
    }
  })
})

// ─── useWebSocket ───────────────────────────────────────────────────────────

describe('useWebSocket — maxMessages bounds the history', () => {
  it('keeps only the newest N messages', () => {
    let sock!: { onmessage: ((e: { data: string }) => void) | null }
    vi.stubGlobal(
      'WebSocket',
      class {
        OPEN = 1
        readyState = 1
        onopen = null
        onmessage = null
        onerror = null
        onclose = null
        constructor() {
          sock = this as never
        }
        close() {}
        send() {}
      },
    )
    const ws = useWebSocket('ws://x', { maxMessages: 2 })
    for (const m of ['a', 'b', 'c', 'd']) sock.onmessage?.({ data: m })
    expect(ws.messages).toEqual(['c', 'd'])
    expect(ws.lastMessage).toBe('d')
  })
})

// ─── coverage of the new failure arms ───────────────────────────────────────

describe('failure arms of the hardening fixes', () => {
  it('useInfiniteScroll: a rejected load clears the in-flight guard', async () => {
    let cb: ((e: IntersectionObserverEntry[]) => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(c: typeof cb) {
          cb = c
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const onLoadMore = vi.fn(() => Promise.reject(new Error('offline')))
    const { ref } = useInfiniteScroll(onLoadMore)
    ref(document.createElement('div'))
    cb!([{ isIntersecting: true } as IntersectionObserverEntry])
    await new Promise((r) => setTimeout(r, 0))
    cb!([{ isIntersecting: true } as IntersectionObserverEntry])
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('useKeyboard ignoreInputs: a non-element target (document) still fires', () => {
    const root = host()
    const handler = vi.fn()
    function Comp() {
      useKeyboard('k', handler, { ignoreInputs: true })
      return h('div', null)
    }
    const dispose = mount(h(Comp, null), root)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    expect(handler).toHaveBeenCalledTimes(1)
    dispose()
    root.remove()
  })

  it('useLinking refuses a URL that does not parse', () => {
    const open = vi.fn()
    vi.spyOn(window, 'open').mockImplementation(open)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    useLinking().openUrl('http://[')
    expect(open).not.toHaveBeenCalled()
  })

  it('useNotifications warns when the constructor throws and no service worker exists', () => {
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted'
        static requestPermission = vi.fn()
        constructor() {
          throw new TypeError('Illegal constructor')
        }
      },
    )
    const nav = navigator as Navigator & { serviceWorker?: unknown }
    const original = Object.getOwnPropertyDescriptor(nav, 'serviceWorker')
    Object.defineProperty(nav, 'serviceWorker', { value: undefined, configurable: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => useNotifications().notify('a', 'b')).not.toThrow()
      expect(warn.mock.calls.some((c) => String(c[0]).includes('service worker'))).toBe(true)
    } finally {
      if (original) Object.defineProperty(nav, 'serviceWorker', original)
      else delete (nav as { serviceWorker?: unknown }).serviceWorker
    }
  })

  it('useScrollLock adds no padding when there is no scrollbar', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1024, configurable: true })
    try {
      const { lock, unlock } = useScrollLock()
      lock()
      expect(document.body.style.paddingRight).toBe('')
      unlock()
    } finally {
      delete (document.documentElement as { clientWidth?: number }).clientWidth
    }
  })
})

describe('useNotifications service-worker fallback failure', () => {
  it('a rejected showNotification is swallowed, not an unhandled rejection', async () => {
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted'
        static requestPermission = vi.fn()
        constructor() {
          throw new TypeError('Illegal constructor')
        }
      },
    )
    const showNotification = vi.fn(() => Promise.reject(new Error('no permission')))
    const nav = navigator as Navigator & { serviceWorker?: unknown }
    const original = Object.getOwnPropertyDescriptor(nav, 'serviceWorker')
    Object.defineProperty(nav, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification }) },
      configurable: true,
    })
    try {
      useNotifications().notify('a', 'b')
      await new Promise((r) => setTimeout(r, 0))
      expect(showNotification).toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(nav, 'serviceWorker', original)
      else delete (nav as { serviceWorker?: unknown }).serviceWorker
    }
  })
})
