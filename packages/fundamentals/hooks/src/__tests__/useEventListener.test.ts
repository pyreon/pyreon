import { describe, expect, it, vi } from 'vitest'
import { useEventListener } from '../useEventListener'

describe('useEventListener', () => {
  it('attaches event listener to window by default', () => {
    const handler = vi.fn()
    const spy = vi.spyOn(window, 'addEventListener')

    useEventListener('click', handler)

    expect(spy).toHaveBeenCalledWith('click', expect.any(Function), undefined)
    spy.mockRestore()
  })

  it('attaches event listener to custom target', () => {
    const handler = vi.fn()
    const el = document.createElement('div')
    const spy = vi.spyOn(el, 'addEventListener')

    useEventListener('click', handler, undefined, () => el)

    expect(spy).toHaveBeenCalledWith('click', expect.any(Function), undefined)
    spy.mockRestore()
  })

  it('passes options to addEventListener', () => {
    const handler = vi.fn()
    const spy = vi.spyOn(window, 'addEventListener')

    useEventListener('scroll', handler, { passive: true })

    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    spy.mockRestore()
  })

  it('handler receives event', () => {
    const handler = vi.fn()
    useEventListener('click', handler)

    window.dispatchEvent(new Event('click'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('handler receives keydown events', () => {
    const handler = vi.fn()
    useEventListener('keydown', handler)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].key).toBe('Escape')
  })
})
