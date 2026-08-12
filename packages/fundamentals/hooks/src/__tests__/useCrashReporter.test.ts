import { afterEach, describe, expect, it } from 'vitest'
import { setCrashTransport, useCrashReporter } from '../useCrashReporter'

const KEY = 'pyreon.crash.last'

describe('useCrashReporter', () => {
  afterEach(() => {
    window.localStorage.clear()
    setCrashTransport(undefined)
  })

  it('starts empty; recordError persists a report readable by a fresh instance', () => {
    const a = useCrashReporter()
    expect(a.hadCrash).toBe(false)
    expect(a.lastCrash).toBe('')
    a.breadcrumb('opened settings')
    a.recordError('TestCrash: boom')
    // A fresh instance models a page RELOAD — start() rehydrates from storage.
    const b = useCrashReporter()
    expect(b.hadCrash).toBe(false) // not until start()
    b.start()
    expect(b.hadCrash).toBe(true)
    expect(b.lastCrash).toContain('TestCrash: boom')
    expect(b.lastCrash).toContain('opened settings')
  })

  it('clear() removes the persisted report (a later instance sees nothing)', () => {
    const a = useCrashReporter()
    a.recordError('x')
    const b = useCrashReporter()
    b.start()
    expect(b.hadCrash).toBe(true)
    b.clear()
    expect(window.localStorage.getItem(KEY)).toBeNull()
    const c = useCrashReporter()
    c.start()
    expect(c.hadCrash).toBe(false)
  })

  it('forwards the rehydrated report AND each recordError to the wired transport', () => {
    useCrashReporter().recordError('persist me')
    const sent: string[] = []
    setCrashTransport((r) => sent.push(r))
    const r = useCrashReporter()
    r.start()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('persist me')
    r.recordError('manual')
    expect(sent).toHaveLength(2)
  })

  it('the breadcrumb ring is capped (oldest evicted)', () => {
    const r = useCrashReporter()
    for (let i = 0; i < 100; i++) r.breadcrumb(`b${i}`)
    r.recordError('m')
    const raw = window.localStorage.getItem(KEY)!
    expect(raw).not.toContain('b0\\n')
    expect(raw).toContain('b99')
  })

  it('start() captures a window error event into a persisted report', () => {
    const r = useCrashReporter()
    r.start()
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'window boom', error: new Error('window boom') }),
    )
    const raw = window.localStorage.getItem(KEY)!
    expect(raw).toContain('window boom')
  })
})

// The other half of `start()`'s window wiring.
//
// `start()` registers TWO listeners and a cleanup, and only the `error` path
// had a test — so the rejection handler and the whole teardown were uncovered
// (lines 117-118 and 123-124, the largest gap in this package's coverage).
//
// The teardown half lives in `cleanup-paths-coverage.test.ts`, which already
// carries the module mocks that let an `onCleanup` body be invoked — and it
// matters beyond a percentage: `start()` adds listeners to the shared `window`,
// which is memory-leak class D (event-listener pile-up) in this repo's
// catalogue. An untested cleanup is exactly how that class ships.
describe('useCrashReporter — window wiring', () => {
  it('captures an unhandled promise rejection into a persisted report', () => {
    const r = useCrashReporter()
    r.start()
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    // happy-dom has no PromiseRejectionEvent constructor; the handler only
    // reads `.reason`, so a plain Event carrying one exercises the real path.
    event.reason = new Error('rejected boom')
    window.dispatchEvent(event)
    expect(window.localStorage.getItem(KEY)!).toContain('rejected boom')
  })

  it('reads a rejection reason that is not an Error', () => {
    const r = useCrashReporter()
    r.start()
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    // `String(reason?.message ?? reason)` — the `?? reason` arm, which a
    // thrown string or number takes. Half of that branch was uncovered.
    event.reason = 'plain string rejection'
    window.dispatchEvent(event)
    expect(window.localStorage.getItem(KEY)!).toContain('plain string rejection')
  })


  it('forwards the rehydrated report AND each recordError to the wired transport', () => {
    useCrashReporter().recordError('persist me')
    const sent: string[] = []
    setCrashTransport((r) => sent.push(r))
    const r = useCrashReporter()
    r.start()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('persist me')
    r.recordError('manual')
    expect(sent).toHaveLength(2)
  })

  it('the breadcrumb ring is capped (oldest evicted)', () => {
    const r = useCrashReporter()
    for (let i = 0; i < 100; i++) r.breadcrumb(`b${i}`)
    r.recordError('m')
    const raw = window.localStorage.getItem(KEY)!
    expect(raw).not.toContain('b0\\n')
    expect(raw).toContain('b99')
  })

  it('start() captures a window error event into a persisted report', () => {
    const r = useCrashReporter()
    r.start()
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'window boom', error: new Error('window boom') }),
    )
    const raw = window.localStorage.getItem(KEY)!
    expect(raw).toContain('window boom')
  })
})

// The other half of `start()`'s window wiring.
//
// `start()` registers TWO listeners and a cleanup, and only the `error` path
// had a test — so the rejection handler and the whole teardown were uncovered
// (lines 117-118 and 123-124, the largest gap in this package's coverage).
//
// The teardown half lives in `cleanup-paths-coverage.test.ts`, which already
// carries the module mocks that let an `onCleanup` body be invoked — and it
// matters beyond a percentage: `start()` adds listeners to the shared `window`,
// which is memory-leak class D (event-listener pile-up) in this repo's
// catalogue. An untested cleanup is exactly how that class ships.
describe('useCrashReporter — window wiring', () => {
  it('captures an unhandled promise rejection into a persisted report', () => {
    const r = useCrashReporter()
    r.start()
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    // happy-dom has no PromiseRejectionEvent constructor; the handler only
    // reads `.reason`, so a plain Event carrying one exercises the real path.
    event.reason = new Error('rejected boom')
    window.dispatchEvent(event)
    expect(window.localStorage.getItem(KEY)!).toContain('rejected boom')
  })

  it('reads a rejection reason that is not an Error', () => {
    const r = useCrashReporter()
    r.start()
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    // `String(reason?.message ?? reason)` — the `?? reason` arm, which a
    // thrown string or number takes. Half of that branch was uncovered.
    event.reason = 'plain string rejection'
    window.dispatchEvent(event)
    expect(window.localStorage.getItem(KEY)!).toContain('plain string rejection')
  })

  it('never throws when storage refuses the write', () => {
    // The contract in `persist`'s catch: "a crash reporter must never itself
    // throw". Quota-exceeded and disabled-storage both surface as a throwing
    // setItem, and a reporter that propagates that turns a handled crash into
    // an unhandled one — the worst possible moment to add a second failure.
    const setItem = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      expect(() => useCrashReporter().recordError('over quota')).not.toThrow()
    } finally {
      window.localStorage.setItem = setItem
    }
  })
})
