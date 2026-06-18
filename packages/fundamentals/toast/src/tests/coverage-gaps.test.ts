// Targeted coverage for toast's residual branches.
import { afterEach, describe, expect, it } from 'vitest'
import { _pauseAll, _reset, _resumeAll, _toasts, MAX_TOASTS, toast } from '../toast'

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
    const id = toast('sticky', { duration: 0 })
    toast.dismiss(id) // timer === undefined → the `if (timer !== undefined)` false arm
    expect(_toasts().some((t) => t.id === id)).toBe(false)
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
