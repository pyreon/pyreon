// @vitest-environment node
// On the server the toast store is a PROCESS-WIDE module singleton. A toast()
// called while rendering one request used to land in that shared store and
// show up in the next request's render — one user's message in another
// user's page. The server path is now a no-op with a dev warning.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _reset, _toasts, toast } from '../toast'

afterEach(() => {
  vi.restoreAllMocks()
  _reset()
})

describe('toast() on the server', () => {
  it('does not write to the process-wide store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    toast('request A only')
    toast.success('also A')
    void toast.promise(Promise.resolve(1), { loading: 'l', success: 's', error: 'e' })
    expect(_toasts()).toEqual([])
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[Pyreon]'))).toBe(true)
  })
})
