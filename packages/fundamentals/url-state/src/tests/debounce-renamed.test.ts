/**
 * `debounce` was renamed `debounceMs`. TypeScript rejects the old key in an
 * object literal, but a JavaScript caller, or a non-literal options object,
 * would otherwise get undebounced URL writes with no error at all. The old
 * key now draws a dev warning that names the replacement.
 *
 * Bisect-verified: without the `'debounce' in options` check in
 * `createUrlSignal`, the first spec sees no warning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UrlStateOptions } from '../types'
import { setUrlRouter } from '../url'
import { useUrlState } from '../use-url-state'

beforeEach(() => {
  history.replaceState(null, '', '/')
  setUrlRouter(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const renamedWarnings = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('debounceMs'))

describe('the removed `debounce` option', () => {
  it('single-param mode: warns once, naming `debounceMs`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = { debounce: 300 } as unknown as UrlStateOptions<string>
    useUrlState('q', '', legacy)
    const msgs = renamedWarnings(warn)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/^\[Pyreon\] url-state: useUrlState\("q"\)/)
    expect(msgs[0]).toContain('`debounce`')
    expect(msgs[0]).toContain('Rename it to `debounceMs`')
  })

  it('schema mode: warns for the old key too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = { debounce: 300 } as unknown as UrlStateOptions
    useUrlState({ page: 1 }, legacy)
    expect(renamedWarnings(warn)).toHaveLength(1)
  })

  it('does not warn for `debounceMs` or no options', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    useUrlState('q', '', { debounceMs: 300 })
    useUrlState('r', '')
    expect(renamedWarnings(warn)).toEqual([])
  })
})
