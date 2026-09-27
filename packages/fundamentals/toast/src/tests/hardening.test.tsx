/** @jsxImportSource @pyreon/core */
// Regression locks for the 2026-09 @pyreon/toast hardening pass. Each spec was
// written against the broken code first and bisect-verified (see the PR).
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toastStyles } from '../styles'
import { _reset, _toasts, toast } from '../toast'
import { Toaster } from '../toaster'

beforeEach(() => _reset())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _reset()
})

describe('duration beyond what setTimeout can hold', () => {
  // setTimeout stores its delay as a signed 32-bit int. Infinity and anything
  // above 2^31-1 overflow to ~1ms, so "never auto-dismiss" dismissed at once.
  for (const duration of [Number.POSITIVE_INFINITY, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    it(`duration ${duration} is persistent, not dismissed after ~1ms`, () => {
      vi.useFakeTimers()
      toast('stay', { duration })
      vi.advanceTimersByTime(10)
      expect(_toasts()[0]?.state).not.toBe('exiting')
      vi.advanceTimersByTime(60_000)
      expect(_toasts()).toHaveLength(1)
    })
  }

  it('NaN / negative durations are persistent too', () => {
    vi.useFakeTimers()
    toast('a', { duration: Number.NaN })
    toast('b', { duration: -5 })
    vi.advanceTimersByTime(60_000)
    expect(_toasts()).toHaveLength(2)
  })
})

describe('action button', () => {
  it('onClick receives the toast id and a dismiss() bound to it', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(Toaster, null), host)
    const onClick = vi.fn()
    const id = toast('Deleted', { action: { label: 'Undo', onClick } })
    const btn = document.querySelector<HTMLButtonElement>('.pyreon-toast__action')!
    btn.click()
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id }))
    onClick.mock.calls[0]![0].dismiss()
    expect(_toasts()[0]?.state).toBe('exiting')
    dispose()
    host.remove()
  })
})

describe('more than one <Toaster>', () => {
  it('warns in dev — every toast would render once per Toaster', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    const d1 = mount(h(Toaster, null), a)
    const d2 = mount(h(Toaster, null), b)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('<Toaster>'))).toBe(true)
    d2()
    d1()
    a.remove()
    b.remove()
  })

  it('an unmounted Toaster restores the default duration it set', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(Toaster, { duration: 1000 }), host)
    toast('x')
    expect(_toasts()[0]?.duration).toBe(1000)
    dispose()
    toast('y')
    expect(_toasts()[1]?.duration).toBe(4000)
    host.remove()
  })
})

describe('styles', () => {
  it('honours prefers-reduced-motion', () => {
    expect(toastStyles).toContain('prefers-reduced-motion: reduce')
  })
})

describe('Toaster teardown', () => {
  it('unmounting a root-mounted Toaster removes its portal host and visibility listener', () => {
    const before = document.body.childElementCount
    const remove = vi.spyOn(document, 'removeEventListener')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(Toaster, null), host)
    dispose()
    host.remove()
    expect(document.body.childElementCount).toBe(before)
    expect(remove.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true)
  })
})
