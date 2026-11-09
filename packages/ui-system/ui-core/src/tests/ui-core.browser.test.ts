import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cssVariablesPrePaintScript } from '../cssVariablesPrePaint'

// Real-Chromium smoke for @pyreon/ui-core.
//
// The pre-paint script is the one piece of ui-core that is a contract with the BROWSER rather than with the framework:
// it runs as an inline <script> before first paint and reads real `localStorage` and a real `matchMedia`. happy-dom
// stubs both, so the node suite proves the string, not that Chromium accepts and executes it.

const run = (script: string): void => {
  new Function(script)()
}

describe('@pyreon/ui-core cssVariablesPrePaintScript in a real browser', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('writes the mode Chromium resolves from prefers-color-scheme when nothing is stored', () => {
    run(cssVariablesPrePaintScript())
    const system = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'
    expect(document.documentElement.getAttribute('data-theme')).toBe(system)
  })

  it('a stored toggle wins over the system preference', () => {
    localStorage.setItem('zero-theme', 'dark')
    run(cssVariablesPrePaintScript())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    localStorage.setItem('zero-theme', 'light')
    run(cssVariablesPrePaintScript())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('ignores a stored value that is not light or dark', () => {
    localStorage.setItem('zero-theme', 'purple')
    run(cssVariablesPrePaintScript())
    const system = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'
    expect(document.documentElement.getAttribute('data-theme')).toBe(system)
  })

  it('honours a custom attribute and storage key', () => {
    localStorage.setItem('my-key', 'dark')
    run(cssVariablesPrePaintScript({ attribute: 'data-mode', storageKey: 'my-key' }))
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')
    document.documentElement.removeAttribute('data-mode')
  })

  it('never throws when storage is unavailable', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    try {
      expect(() => run(cssVariablesPrePaintScript())).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', real)
    }
  })
})
