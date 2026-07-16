import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppState } from '../useAppState'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}
function setFocus(has: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(has)
}

describe('useAppState', () => {
  afterEach(() => {
    setVisibility('visible')
    vi.restoreAllMocks()
  })

  it('reports "active" when visible and focused', () => {
    setVisibility('visible')
    setFocus(true)
    const state = useAppState()
    expect(state()).toBe('active')
  })

  it('reports "background" when the document is hidden', () => {
    setFocus(true)
    const state = useAppState()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(state()).toBe('background')
  })

  it('reports "inactive" when visible but not focused', () => {
    setVisibility('visible')
    setFocus(true)
    const state = useAppState()
    setFocus(false)
    window.dispatchEvent(new Event('blur'))
    expect(state()).toBe('inactive')
  })

  it('returns to "active" when focus is regained', () => {
    setVisibility('visible')
    setFocus(false)
    const state = useAppState()
    expect(state()).toBe('inactive')
    setFocus(true)
    window.dispatchEvent(new Event('focus'))
    expect(state()).toBe('active')
  })

  it('handles multiple lifecycle cycles', () => {
    setVisibility('visible')
    setFocus(true)
    const state = useAppState()
    expect(state()).toBe('active')

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(state()).toBe('background')

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(state()).toBe('active')
  })
})
