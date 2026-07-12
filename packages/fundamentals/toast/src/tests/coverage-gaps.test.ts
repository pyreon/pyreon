// Targeted coverage for toast's residual branches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _pauseAll, _reset, _resumeAll, _toasts, LEAVE_DURATION, MAX_TOASTS, toast } from '../toast'

afterEach(() => _reset())

describe('toast — MAX_TOASTS overflow evicts the oldest', () => {
  it('adding past the cap drops the oldest entry', () => {
    for (let i = 0; i < MAX_TOASTS + 3; i++) toast(`t${i}`)
    expect(_toasts().length).toBe(MAX_TOASTS)
  })

  it('dropping a timer-less oldest toast hits the no-timer eviction arm', () => {
    toast('oldest-sticky', { duration: 0 }) // oldest has NO timer
    for (let i = 0; i < MAX_TOASTS + 1; i++) toast(`t${i}`) // overflow evicts it
    expect(_toasts().some((t) => t.message === 'oldest-sticky')).toBe(false)
  })
})

describe('toast — duration <= 0 means no auto-dismiss timer', () => {
  it('a zero-duration toast persists (no scheduled dismiss)', () => {
    const id = toast('sticky', { duration: 0 })
    expect(_toasts().some((t) => t.id === id)).toBe(true)
  })

  it('dismissing a timer-less (duration:0) toast hits the no-timer branch', () => {
    vi.useFakeTimers()
    const id = toast('sticky', { duration: 0 })
    toast.dismiss(id) // timer === undefined → the `if (timer !== undefined)` false arm
    expect(_toasts().find((t) => t.id === id)?.state).toBe('exiting')
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toasts().some((t) => t.id === id)).toBe(false)
    vi.useRealTimers()
  })

  it('updating a timer-less toast hits the no-timer branch', () => {
    const id = toast('sticky', { duration: 0 })
    toast.update(id, { message: 'changed' })
    expect(_toasts().find((t) => t.id === id)?.message).toBe('changed')
  })
})

describe('toast — pause/resume with a timer-less (duration:0) toast', () => {
  it('pause + resume skip a no-timer toast (the &&-chain / timer-undefined false arms)', () => {
    const id = toast('sticky', { duration: 0 }) // no timer
    _pauseAll() // `if (t.timer !== undefined)` false (no timer to clear)
    _resumeAll() // `if (t.duration > 0 && ...)` false (duration is 0)
    expect(_toasts().some((t) => t.id === id)).toBe(true)
  })
})

describe('toast — two-phase dismiss / remove (leave animation)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dismiss is idempotent — a second dismiss on an exiting toast is a no-op', () => {
    const onDismiss = vi.fn()
    const id = toast('x', { duration: 0, onDismiss })
    toast.dismiss(id)
    expect(_toasts().find((t) => t.id === id)?.state).toBe('exiting')
    toast.dismiss(id) // already exiting → early return, no second onDismiss / timer
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('dismiss() (all) skips already-exiting toasts (and is a no-op when all are exiting)', () => {
    const a = toast('a', { duration: 0 })
    toast('b', { duration: 0 })
    toast.dismiss(a) // a → exiting
    toast.dismiss() // all: a is skipped (already exiting), b → exiting
    expect(_toasts().every((t) => t.state === 'exiting')).toBe(true)
    // Every toast is already exiting now → the map produces no change (`changed`
    // stays false, no redundant _toasts.set).
    toast.dismiss()
    expect(_toasts().every((t) => t.state === 'exiting')).toBe(true)
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })

  it('remove(id) is hard + instant, clears a live timer, and fires onDismiss', () => {
    const onDismiss = vi.fn()
    const id = toast('x', { duration: 4000, onDismiss }) // live auto-dismiss timer
    toast.remove(id) // hits the `match.timer !== undefined` clear arm
    expect(_toasts().length).toBe(0)
    expect(onDismiss).toHaveBeenCalledOnce()
    // The cleared timer never fires a second dismiss.
    vi.advanceTimersByTime(4000 + LEAVE_DURATION)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('remove(id) on an already-exiting toast does NOT re-fire onDismiss', () => {
    const onDismiss = vi.fn()
    const id = toast('x', { duration: 4000, onDismiss })
    toast.dismiss(id) // fires onDismiss, schedules leave
    toast.remove(id) // clears the pending leaveTimer, drops it, no second onDismiss
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(_toasts().length).toBe(0)
  })

  it('remove() (all) hard-clears live timers and fires onDismiss only for non-exiting toasts', () => {
    const cbA = vi.fn()
    const cbB = vi.fn()
    const a = toast('a', { duration: 4000, onDismiss: cbA }) // live timer
    toast('b', { duration: 4000, onDismiss: cbB }) // live timer
    toast.dismiss(a) // a → exiting, cbA fired, leaveTimer scheduled
    toast.remove() // clears all timers; a already exiting (no re-fire), b fires
    expect(_toasts().length).toBe(0)
    expect(cbA).toHaveBeenCalledOnce()
    expect(cbB).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(4000 + LEAVE_DURATION)
    expect(cbA).toHaveBeenCalledOnce()
    expect(cbB).toHaveBeenCalledOnce()
  })

  it('remove(unknown) is a no-op', () => {
    toast('x', { duration: 0 })
    toast.remove('nope')
    expect(_toasts().length).toBe(1)
  })

  it('update resurrects an exiting toast back to visible (cancels the leave)', () => {
    const id = toast('loading', { duration: 4000 })
    toast.dismiss(id) // → exiting, leaveTimer scheduled
    expect(_toasts().find((t) => t.id === id)?.state).toBe('exiting')

    toast.update(id, { message: 'done', type: 'success' })
    const t = _toasts().find((x) => x.id === id)
    expect(t?.state).toBe('visible')
    expect(t?.message).toBe('done')

    // The original leave timer was cancelled — the toast is NOT removed.
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toasts().some((x) => x.id === id)).toBe(true)
  })

  it('_resumeAll does not restart a timer on an exiting toast', () => {
    const id = toast('x', { duration: 4000 })
    vi.advanceTimersByTime(1000) // 3000 remaining
    _pauseAll()
    toast.dismiss(id) // → exiting (remaining still 0 after beginExit resets it)
    _resumeAll() // must skip the exiting toast — no new auto-dismiss timer
    // Only the leave timer removes it; advancing past it clears the toast.
    vi.advanceTimersByTime(LEAVE_DURATION)
    expect(_toasts().length).toBe(0)
  })
})

describe('toast.promise — function-valued success / error messages', () => {
  it('resolves with a function success message', async () => {
    await toast.promise(Promise.resolve({ name: 'ok' }), {
      loading: 'loading…',
      success: (data) => `done: ${(data as { name: string }).name}`,
      error: (err) => `failed: ${String(err)}`,
    })
    expect(_toasts().some((t) => String(t.message).includes('done: ok'))).toBe(true)
  })

  it('rejects with a function error message', async () => {
    await toast
      .promise(Promise.reject(new Error('boom')), {
        loading: 'loading…',
        success: (d) => `ok ${String(d)}`,
        error: (err) => `failed: ${(err as Error).message}`,
      })
      .catch(() => {})
    expect(_toasts().some((t) => String(t.message).includes('failed: boom'))).toBe(true)
  })
})
