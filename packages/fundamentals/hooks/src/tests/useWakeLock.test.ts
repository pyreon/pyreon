import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WakeLockControls } from '../useWakeLock'
import { useWakeLock } from '../useWakeLock'

/**
 * A fake sentinel that behaves like the real one in the way that matters:
 * it can be released BY THE BROWSER and announces that through a `release`
 * event. Modelling only `release()` would make the visibility test pass
 * against a hook that never observes the browser's own release — the exact
 * bug this file exists to lock.
 */
function makeSentinel() {
  const handlers: Array<() => void> = []
  let releasedCount = 0
  const sentinel = {
    release: async () => {
      releasedCount += 1
      for (const h of handlers) h()
    },
    addEventListener: (_type: 'release', handler: () => void) => {
      handlers.push(handler)
    },
    /** What the browser does on document-hide. */
    browserRelease: () => {
      for (const h of handlers) h()
    },
    get releasedCount() {
      return releasedCount
    },
  }
  return sentinel
}

/**
 * Install a fake `navigator.wakeLock`. The visibility contract is entirely
 * about HOW MANY times the lock is taken, so the spy count is the assertion.
 */
function installWakeLock(opts: { reject?: boolean } = {}) {
  const issued: Array<ReturnType<typeof makeSentinel>> = []
  const request = vi.fn(async () => {
    if (opts.reject === true) throw new Error('denied')
    const s = makeSentinel()
    issued.push(s)
    return s
  })
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  })
  return { request, issued }
}

/**
 * Create the hook inside a real reactive scope, the way a component's setup
 * frame does. Without one, `onCleanup` is a no-op and every test's document
 * listener survives into the next — which showed up here as a third,
 * unexplained acquisition from a previous test's still-live hook.
 */
const scopes: Array<{ dispose: () => void }> = []
function mountHook(): WakeLockControls {
  let w!: WakeLockControls
  const e = effect(() => {
    w = useWakeLock()
  })
  scopes.push(e)
  return w
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useWakeLock', () => {
  beforeEach(() => {
    setVisibility('visible')
  })

  afterEach(() => {
    for (const s of scopes.splice(0)) s.dispose()
    // biome-ignore lint: test teardown of a defineProperty'd global
    delete (globalThis.navigator as unknown as Record<string, unknown>).wakeLock
    vi.restoreAllMocks()
  })

  it('reports unsupported when the platform has no wakeLock', () => {
    const w = mountHook()
    expect(w.supported()).toBe(false)
    expect(w.active()).toBe(false)
  })

  it('request() on an unsupported platform is a quiet false, not a throw', async () => {
    // The bail is also where the secure-context diagnostic fires: an insecure
    // origin is one of the two ways `wakeLock` goes missing, and it is the one
    // the user can fix. Reaching this path without a working lock must stay a
    // plain `false` — a hook that threw here would take down a component whose
    // only sin is running on a browser that lacks the API.
    const w = mountHook()
    await expect(w.request()).resolves.toBe(false)
    expect(w.active()).toBe(false)
  })

  it('acquires and releases', async () => {
    const { request } = installWakeLock()
    const w = mountHook()
    expect(w.supported()).toBe(true)

    expect(await w.request()).toBe(true)
    expect(w.active()).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)

    await w.release()
    expect(w.active()).toBe(false)
  })

  it('a rejected request is an ordinary false, not a throw', async () => {
    installWakeLock({ reject: true })
    const w = mountHook()
    // Low battery and background tabs both refuse; a caller should be able
    // to branch on it rather than wrap every call in try/catch.
    await expect(w.request()).resolves.toBe(false)
    expect(w.active()).toBe(false)
  })

  it('request is idempotent — a second call does not take a second lock', async () => {
    const { request } = installWakeLock()
    const w = mountHook()
    await w.request()
    await w.request()
    expect(request).toHaveBeenCalledTimes(1)
  })

  // THE 1:1 CONTRACT. The browser releases a sentinel whenever the document
  // hides and does NOT reacquire it; iOS/Android keep the equivalent flag
  // across backgrounding. Without this re-acquire the same call would leave
  // the screen sleeping on web and lit on native — mirrored, not 1:1.
  it('re-acquires when the document becomes visible again', async () => {
    const { request, issued } = installWakeLock()
    const w = mountHook()
    await w.request()
    expect(request).toHaveBeenCalledTimes(1)
    expect(w.active()).toBe(true)

    // What the browser actually does on hide: releases the sentinel and
    // announces it. The hook must NOTICE — that is the half that was
    // missing, and without it the assertion below is unreachable.
    setVisibility('hidden')
    issued[0]?.browserRelease()
    expect(w.active()).toBe(false)

    setVisibility('visible')
    await Promise.resolve()
    await Promise.resolve()

    // Re-acquired, because the caller never released. This is what makes
    // the hook 1:1 with the native flag rather than merely mirrored.
    expect(request).toHaveBeenCalledTimes(2)
    expect(w.active()).toBe(true)
  })

  it('does NOT re-acquire after the caller released', async () => {
    const { request } = installWakeLock()
    const w = mountHook()
    await w.request()
    await w.release()
    expect(w.active()).toBe(false)

    setVisibility('hidden')
    setVisibility('visible')
    await Promise.resolve()
    await Promise.resolve()

    // Still one — an explicit release is intent, and a tab switch must not
    // resurrect a lock the caller deliberately gave up.
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('a SECOND caller that joins an in-flight request gets the same answer', async () => {
    // Both callers of one `acquire()` must see the same contract. The
    // rejection handling used to sit in a `catch` around the await, so only
    // the caller that STARTED the attempt was inside it — a caller that
    // joined at the in-flight guard received the raw rejection instead of
    // `false`, and would have thrown out of a call the type says resolves.
    installWakeLock({ reject: true })
    const w = mountHook()

    const first = w.request()
    const joiner = w.request()

    await expect(joiner).resolves.toBe(false)
    await expect(first).resolves.toBe(false)
  })

  it('concurrent requests acquire ONE lock, not one each', async () => {
    // The window is the permission round-trip, so it is widest for the user
    // who hesitates: without the shared promise both calls pass the
    // `sentinel !== null` check and the first sentinel is orphaned — held by
    // the browser with nothing left holding a reference to release it.
    const { request } = installWakeLock()
    const w = mountHook()

    const results = await Promise.all([w.request(), w.request(), w.request()])

    expect(results).toEqual([true, true, true])
    expect(request).toHaveBeenCalledTimes(1)
  })
})
