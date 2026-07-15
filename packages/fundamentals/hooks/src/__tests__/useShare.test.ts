import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShare } from '../useShare'

function mockShare(impl: (...args: unknown[]) => Promise<void> = () => Promise.resolve()) {
  const fn = vi.fn(impl)
  Object.defineProperty(navigator, 'share', {
    value: fn,
    writable: true,
    configurable: true,
  })
  return fn
}

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).share
})

describe('useShare', () => {
  it('text() shares plain text', () => {
    const share = mockShare()
    useShare().text('hello')
    expect(share).toHaveBeenCalledWith({ text: 'hello' })
  })

  it('url() shares a URL', () => {
    const share = mockShare()
    useShare().url('https://pyreon.dev')
    expect(share).toHaveBeenCalledWith({ url: 'https://pyreon.dev' })
  })

  it('textUrl() shares text with an accompanying URL', () => {
    const share = mockShare()
    useShare().textUrl('docs', 'https://pyreon.dev')
    expect(share).toHaveBeenCalledWith({ text: 'docs', url: 'https://pyreon.dev' })
  })

  it('canShare() reflects Web Share API availability', () => {
    mockShare()
    expect(useShare().canShare()).toBe(true)
    delete (navigator as unknown as Record<string, unknown>).share
    expect(useShare().canShare()).toBe(false)
  })

  it('is a silent no-op when navigator.share is unavailable (desktop Safari)', () => {
    delete (navigator as unknown as Record<string, unknown>).share
    const s = useShare()
    expect(() => {
      s.text('a')
      s.url('b')
      s.textUrl('a', 'b')
    }).not.toThrow()
  })

  it('swallows a share-sheet cancel (rejected promise is not an error)', async () => {
    mockShare(() => Promise.reject(new Error('user cancelled')))
    useShare().text('hello')
    // Flush the rejection through the microtask queue — an unhandled
    // rejection here would fail the test run.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
