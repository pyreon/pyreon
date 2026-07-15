import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLinking } from '../useLinking'

const originalOpen = window.open

afterEach(() => {
  Object.defineProperty(window, 'open', {
    value: originalOpen,
    writable: true,
    configurable: true,
  })
})

describe('useLinking', () => {
  it('openUrl() hands the URL to window.open with the noopener security posture', () => {
    const open = vi.fn()
    Object.defineProperty(window, 'open', {
      value: open,
      writable: true,
      configurable: true,
    })
    useLinking().openUrl('https://pyreon.dev')
    expect(open).toHaveBeenCalledWith('https://pyreon.dev', '_blank', 'noopener,noreferrer')
  })

  it('is a silent no-op when window.open is unavailable', () => {
    Object.defineProperty(window, 'open', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    expect(() => useLinking().openUrl('https://pyreon.dev')).not.toThrow()
  })
})
