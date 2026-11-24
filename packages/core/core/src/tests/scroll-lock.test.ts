// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { _scrollLockTargetCount, lockScroll } from '../scroll-lock'

afterEach(() => {
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  document.documentElement.style.overflow = ''
})

describe('lockScroll — the one shared scroll lock', () => {
  it('locks <body> and <html>, and the last release restores the saved values', () => {
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'scroll'
    const a = lockScroll()
    const b = lockScroll()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    a()
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('scroll')
    expect(_scrollLockTargetCount()).toBe(0)
  })

  it('a release function releases its own hold once', () => {
    const a = lockScroll()
    const b = lockScroll()
    a()
    a()
    expect(document.body.style.overflow).toBe('hidden')
    b()
    expect(document.body.style.overflow).toBe('')
  })

  it('pads <body> by the scrollbar width while locked', () => {
    const inner = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: document.documentElement.clientWidth + 15 })
    try {
      const release = lockScroll()
      expect(document.body.style.paddingRight).toBe('15px')
      release()
      expect(document.body.style.paddingRight).toBe('')
    } finally {
      if (inner) Object.defineProperty(window, 'innerWidth', inner)
    }
  })

  it('locks an element target independently of the page, counted per element', () => {
    const el = document.createElement('div')
    el.style.overflow = 'auto'
    const a = lockScroll(el)
    const b = lockScroll(el)
    expect(el.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('')
    a()
    expect(el.style.overflow).toBe('hidden')
    b()
    expect(el.style.overflow).toBe('auto')
    // No entry outlives its last hold: an unlocked element is not retained.
    expect(_scrollLockTargetCount()).toBe(0)
  })
})
