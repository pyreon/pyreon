import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetUnloadFlush } from '../local'
import { _resetRegistry, useStorage } from '../index'

// Real timers (not fake) per .claude/rules/testing.md — fake timers cause
// subtle issues with the debounce/await flow.
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useStorage — writeDebounceMs (opt-in write coalescing)', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetRegistry()
    _resetUnloadFlush()
  })
  afterEach(() => {
    localStorage.clear()
    _resetRegistry()
    _resetUnloadFlush()
  })

  it('updates the signal SYNCHRONOUSLY but debounces the localStorage write', async () => {
    const s = useStorage('draft', 'a', { writeDebounceMs: 50 })
    s.set('b')
    // The signal is reactive immediately — the UI never waits on the debounce.
    expect(s()).toBe('b')
    // ...but the synchronous setItem hasn't fired yet.
    expect(localStorage.getItem('draft')).toBeNull()
    await tick(80)
    expect(JSON.parse(localStorage.getItem('draft')!)).toBe('b')
  })

  it('coalesces rapid writes — only the LATEST value is persisted', async () => {
    const s = useStorage('draft', '', { writeDebounceMs: 50 })
    s.set('a')
    s.set('b')
    s.set('c')
    expect(s()).toBe('c')
    expect(localStorage.getItem('draft')).toBeNull() // no write mid-burst
    await tick(80)
    expect(JSON.parse(localStorage.getItem('draft')!)).toBe('c')
  })

  it('flushes the pending write on pagehide (last value not lost on close)', () => {
    const s = useStorage('draft', '', { writeDebounceMs: 1000 })
    s.set('typed')
    expect(localStorage.getItem('draft')).toBeNull()
    // The shared unload listener flushes synchronously — no timer wait.
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem('draft')!)).toBe('typed')
    void s
  })

  it('.remove() cancels a pending write (no resurrection after the timer)', async () => {
    localStorage.setItem('draft', JSON.stringify('old'))
    _resetRegistry()
    const s = useStorage('draft', '', { writeDebounceMs: 50 })
    s.set('new') // schedules a debounced write
    s.remove() // clears storage AND cancels the pending write
    expect(localStorage.getItem('draft')).toBeNull()
    await tick(80)
    // The cancelled timer must not re-create the entry.
    expect(localStorage.getItem('draft')).toBeNull()
  })

  it('default (no writeDebounceMs) writes synchronously — unchanged behavior', () => {
    const s = useStorage('sync-key', 'x')
    s.set('y')
    expect(JSON.parse(localStorage.getItem('sync-key')!)).toBe('y')
    void s
  })
})
