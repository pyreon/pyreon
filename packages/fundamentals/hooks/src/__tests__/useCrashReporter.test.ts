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
