/**
 * Real-test branch-coverage hardening for @pyreon/runtime-dom.
 * Targets honest gaps in props.ts and devtools.ts paths.
 * NO v8-ignore annotations.
 */
import { describe, expect, it, vi } from 'vitest'
import { applyProp } from '../props'

describe('applyProp — event handler edge cases', () => {
  it('onClick with a function returns a cleanup (delegation-aware)', () => {
    const el = document.createElement('button')
    const cleanup = applyProp(el, 'onClick', () => {})
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  it('onClick with undefined is silently dropped (no warning, no listener)', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('button')
    const cleanup = applyProp(el, 'onClick', undefined)
    expect(cleanup).toBeNull()
    expect(warnMock).not.toHaveBeenCalled()
    warnMock.mockRestore()
  })

  it('onClick with null is silently dropped (no warning)', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('button')
    applyProp(el, 'onClick', null)
    expect(warnMock).not.toHaveBeenCalled()
    warnMock.mockRestore()
  })

  it('onClick with a string warns about non-function value (line 237)', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('button')
    const cleanup = applyProp(el, 'onClick', 'not-a-function')
    expect(cleanup).toBeNull()
    expect(warnMock).toHaveBeenCalled()
    const msg = warnMock.mock.calls[0]?.[0] as string
    expect(msg).toMatch(/non-function/)
    warnMock.mockRestore()
  })

  it('multi-word events (onPointerDown) return a non-null cleanup', () => {
    const el = document.createElement('div')
    const cleanup = applyProp(el, 'onPointerDown', () => {})
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  it('non-delegated events (onScroll) attach + fire directly', () => {
    const el = document.createElement('div')
    let fired = 0
    const cleanup = applyProp(el, 'onScroll', () => {
      fired++
    })
    el.dispatchEvent(new Event('scroll'))
    expect(fired).toBe(1)
    cleanup?.()
  })
})

// ─── applyProp — innerHTML / dangerouslySetInnerHTML ────────────────────────

describe('applyProp — innerHTML branches', () => {
  it('innerHTML with a string sanitizes and applies', () => {
    const el = document.createElement('div')
    applyProp(el, 'innerHTML', '<strong>safe</strong>')
    expect(el.innerHTML).toContain('safe')
  })

  it('innerHTML with undefined applies empty string', () => {
    const el = document.createElement('div')
    el.innerHTML = 'will-be-cleared'
    applyProp(el, 'innerHTML', undefined)
    expect(el.innerHTML).toBe('')
  })

  it('dangerouslySetInnerHTML with __html applies raw', () => {
    const el = document.createElement('div')
    applyProp(el, 'dangerouslySetInnerHTML', { __html: '<b>raw</b>' })
    expect(el.innerHTML).toContain('raw')
  })

  it('dangerouslySetInnerHTML with null applies empty string (line 329 fallback)', () => {
    const el = document.createElement('div')
    el.innerHTML = 'will-be-cleared'
    applyProp(el, 'dangerouslySetInnerHTML', null)
    expect(el.innerHTML).toBe('')
  })

  it('dangerouslySetInnerHTML with undefined applies empty string', () => {
    const el = document.createElement('div')
    el.innerHTML = 'will-be-cleared'
    applyProp(el, 'dangerouslySetInnerHTML', undefined)
    expect(el.innerHTML).toBe('')
  })
})

// ─── applyProp — class / style normalizations ────────────────────────────────

describe('applyProp — class + style', () => {
  it('class with a string applies as-is', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', 'a b c')
    expect(el.getAttribute('class')).toBe('a b c')
  })

  it('class with an array resolves via cx', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', ['a', null, 'b', false, 'c'])
    const cls = el.getAttribute('class') || ''
    expect(cls).toContain('a')
    expect(cls).toContain('b')
    expect(cls).toContain('c')
  })

  it('className alias works like class', () => {
    const el = document.createElement('div')
    applyProp(el, 'className', 'x y')
    expect(el.getAttribute('class')).toBe('x y')
  })

  it('style with a string sets cssText', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', 'color: red; font-size: 10px')
    expect(el.style.cssText).toContain('red')
  })

  it('style with object sets individual properties', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { color: 'blue', fontSize: '14px' })
    expect(el.style.color).toBe('blue')
  })

  it('style with object then style removed clears stale keys (line 443 prev present)', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { color: 'blue', fontSize: '14px' })
    expect(el.style.color).toBe('blue')
    // Now apply null - the prev keys should be removed
    applyProp(el, 'style', null)
    expect(el.style.color).toBe('')
  })

  it('style with object then a smaller object removes stale keys', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { color: 'blue', fontSize: '14px' })
    applyProp(el, 'style', { color: 'green' })
    expect(el.style.color).toBe('green')
    expect(el.style.fontSize).toBe('')
  })

  it('style with CSS custom property (--var) preserves the leading --', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { '--brand-color': 'red' })
    expect(el.style.getPropertyValue('--brand-color')).toBe('red')
  })
})

// ─── applyProp — URL-safety guard ───────────────────────────────────────────

describe('applyProp — URL safety', () => {
  it('blocks javascript: URLs in href and warns', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('a')
    applyProp(el, 'href', 'javascript:alert(1)')
    expect(el.getAttribute('href')).toBeNull()
    expect(warnMock).toHaveBeenCalled()
    warnMock.mockRestore()
  })

  it('allows http: URLs in href', () => {
    const el = document.createElement('a')
    applyProp(el, 'href', 'http://example.com')
    expect(el.getAttribute('href')).toBe('http://example.com')
  })

  it('allows safe data:image/png URIs on img src', () => {
    const el = document.createElement('img')
    applyProp(el, 'src', 'data:image/png;base64,iVBORw0KGgo=')
    expect(el.getAttribute('src')).toContain('data:image/png')
  })

  it('blocks data:text/html in href and warns', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('a')
    applyProp(el, 'href', 'data:text/html,<script>alert(1)</script>')
    expect(el.getAttribute('href')).toBeNull()
    expect(warnMock).toHaveBeenCalled()
    warnMock.mockRestore()
  })
})

// ─── applyProp — boolean + null + custom-elements ────────────────────────────

describe('applyProp — boolean / null / custom-element paths', () => {
  it('boolean true sets an empty attribute', () => {
    const el = document.createElement('button')
    applyProp(el, 'disabled', true)
    expect(el.hasAttribute('disabled')).toBe(true)
  })

  it('boolean false removes the attribute', () => {
    const el = document.createElement('button')
    el.setAttribute('disabled', '')
    applyProp(el, 'disabled', false)
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  it('null removes the attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('data-x', '1')
    applyProp(el, 'data-x', null)
    expect(el.hasAttribute('data-x')).toBe(false)
  })

  it('property assignment when key in el', () => {
    const el = document.createElement('input')
    applyProp(el, 'value', 'hello')
    expect(el.value).toBe('hello')
  })

  it('custom element property assignment (tag contains hyphen, line 531)', () => {
    const el = document.createElement('my-element')
    applyProp(el, 'customProp', 'val')
    expect((el as unknown as { customProp: string }).customProp).toBe('val')
  })

  it('SVG element always uses setAttribute', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    applyProp(el, 'width', 100)
    expect(el.getAttribute('width')).toBe('100')
  })
})
