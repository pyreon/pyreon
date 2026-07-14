import { signal } from '@pyreon/reactivity'
import { DELEGATED_EVENTS, delegatedPropName, setupDelegation } from '../delegate'
import {
  applyAttrProp,
  applyProp,
  applyProps,
  applySelectValueProp,
  sanitizeHtml,
  setSanitizer,
} from '../props'

// ─── applyProps ──────────────────────────────────────────────────────────────

describe('applyProps', () => {
  test('skips key, ref, and children props', () => {
    const el = document.createElement('div')
    const cleanup = applyProps(el, {
      key: 'k1',
      ref: { current: null },
      children: 'text',
      id: 'test',
    })
    expect(el.getAttribute('id')).toBe('test')
    // key, ref, children should not appear as attributes
    expect(el.hasAttribute('key')).toBe(false)
    expect(el.hasAttribute('ref')).toBe(false)
    expect(el.hasAttribute('children')).toBe(false)
    cleanup?.()
  })

  test('returns null when no props produce cleanup', () => {
    const el = document.createElement('div')
    const cleanup = applyProps(el, { id: 'static', title: 'hello' })
    expect(cleanup).toBeNull()
  })

  test('returns single cleanup when one prop needs it', () => {
    const el = document.createElement('div')
    const cleanup = applyProps(el, { onClick: () => {} })
    expect(cleanup).not.toBeNull()
    expect(typeof cleanup).toBe('function')
    cleanup?.()
  })

  test('returns chained cleanup when multiple props need cleanup', () => {
    const el = document.createElement('div')
    const s1 = signal('a')
    const s2 = signal('b')
    const cleanup = applyProps(el, {
      onClick: () => {},
      class: s1,
      title: s2,
    })
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  test('chains 3+ cleanups into array-based cleanup', () => {
    const el = document.createElement('div')
    const cleanup = applyProps(el, {
      onClick: () => {},
      onInput: () => {},
      class: signal('x'),
    })
    expect(typeof cleanup).toBe('function')
    cleanup?.()
  })
})

// ─── applyProp — style ────────────────────────────────────────────────────────

describe('applyProp — style', () => {
  test('applies style as string via cssText', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', 'color: red; font-size: 14px')
    expect(el.style.cssText).toContain('color')
  })

  test('applies style as object with camelCase properties', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { fontSize: '14px', color: 'blue' })
    // Check that setProperty was called (kebab-case conversion)
    expect(el.style.getPropertyValue('font-size') || el.style.fontSize).toBeTruthy()
  })

  test('applies style with CSS custom properties (--var)', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { '--main-color': 'red' })
    expect(el.style.getPropertyValue('--main-color')).toBe('red')
  })

  test('ignores null/undefined style', () => {
    const el = document.createElement('div')
    // null style removes the attribute
    applyProp(el, 'style', null)
    expect(el.hasAttribute('style')).toBe(false)
  })
})

// ─── applyProp — class ───────────────────────────────────────────────────────

describe('applyProp — class', () => {
  test('applies class as string', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', 'foo bar')
    expect(el.getAttribute('class')).toBe('foo bar')
  })

  test('applies class as array', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', ['foo', 'bar'])
    expect(el.getAttribute('class')).toBe('foo bar')
  })

  test('applies class as object (conditionals)', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', { active: true, disabled: false, highlight: true })
    const cls = el.getAttribute('class') ?? ''
    expect(cls).toContain('active')
    expect(cls).toContain('highlight')
    expect(cls).not.toContain('disabled')
  })

  test('applies className as alias for class', () => {
    const el = document.createElement('div')
    applyProp(el, 'className', 'my-class')
    expect(el.getAttribute('class')).toBe('my-class')
  })

  test('sets empty class attribute when value resolves to empty', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', '')
    expect(el.getAttribute('class')).toBe('')
  })
})

// ─── applyProp — events ──────────────────────────────────────────────────────

describe('applyProp — events', () => {
  test('adds non-delegated event listener and returns cleanup', () => {
    const el = document.createElement('div')
    const handler = vi.fn()
    // onScroll is non-delegated (scroll doesn't bubble)
    const cleanup = applyProp(el, 'onScroll', handler)
    expect(cleanup).not.toBeNull()
    // Dispatch scroll event — non-delegated events use addEventListener directly
    el.dispatchEvent(new Event('scroll'))
    expect(handler).toHaveBeenCalled()
    cleanup?.()
  })

  test('adds delegated event via expando property', () => {
    const el = document.createElement('div')
    const handler = vi.fn()
    const cleanup = applyProp(el, 'onClick', handler)
    expect(cleanup).not.toBeNull()
    // Check that the delegated expando property is set
    const prop = delegatedPropName('click')
    expect(typeof (el as unknown as Record<string, unknown>)[prop]).toBe('function')
    cleanup?.()
    // After cleanup, expando should be undefined
    expect((el as unknown as Record<string, unknown>)[prop]).toBeUndefined()
  })

  test('warns on non-function event handler in dev mode', () => {
    const el = document.createElement('div')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = applyProp(el, 'onClick', 'not-a-function')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-function'))
    expect(cleanup).toBeNull()
    warnSpy.mockRestore()
  })

  test('cleanup removes non-delegated event listener', () => {
    const el = document.createElement('div')
    const handler = vi.fn()
    const cleanup = applyProp(el, 'onScroll', handler)
    cleanup?.()
    el.dispatchEvent(new Event('scroll'))
    expect(handler).not.toHaveBeenCalled()
  })

  test('onFocusIn routes to the delegated `focusin` slot and fires from a descendant', () => {
    // `onFocusIn` must lower-case to `focusin` (NOT `focusIn`), and focusin is
    // a DELEGATED bubbling event — so a handler on a container fires when focus
    // moves to any descendant. Proves the routing (applyProp → focusin expando)
    // AND the delegation dispatch end-to-end.
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)
    const parent = document.createElement('section')
    const child = document.createElement('button')
    parent.append(child)
    container.append(parent)

    const handler = vi.fn()
    const cleanup = applyProp(parent, 'onFocusIn', handler)
    // routed to the focusin delegation slot, not addEventListener('focusIn')
    expect(
      (parent as unknown as Record<string, unknown>)[delegatedPropName('focusin')],
    ).toBeTypeOf('function')

    child.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup?.()
    expect(
      (parent as unknown as Record<string, unknown>)[delegatedPropName('focusin')],
    ).toBeUndefined()
    container.remove()
  })

  test('onFocusOut routes to the delegated `focusout` slot and fires from a descendant', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)
    const parent = document.createElement('section')
    const child = document.createElement('button')
    parent.append(child)
    container.append(parent)

    const handler = vi.fn()
    const cleanup = applyProp(parent, 'onFocusOut', handler)
    expect(
      (parent as unknown as Record<string, unknown>)[delegatedPropName('focusout')],
    ).toBeTypeOf('function')

    child.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
    cleanup?.()
    container.remove()
  })
})

// ─── applyProp — reactive (function) values ──────────────────────────────────

describe('applyProp — reactive values', () => {
  test('wraps function value in renderEffect', () => {
    const el = document.createElement('div')
    const s = signal('hello')
    const cleanup = applyProp(el, 'title', () => s())
    expect(el.getAttribute('title')).toBe('hello')
    s.set('world')
    expect(el.getAttribute('title')).toBe('world')
    cleanup?.()
  })

  test('stops tracking after disposal', () => {
    const el = document.createElement('div')
    const s = signal('a')
    const cleanup = applyProp(el, 'title', () => s())
    cleanup?.()
    s.set('b')
    expect(el.getAttribute('title')).toBe('a')
  })
})

// ─── applyProp — static values ───────────────────────────────────────────────

describe('applyProp — static values', () => {
  test('sets string attribute', () => {
    const el = document.createElement('div')
    applyProp(el, 'data-testid', 'hello')
    expect(el.getAttribute('data-testid')).toBe('hello')
  })

  test('removes attribute when value is null', () => {
    const el = document.createElement('div')
    el.setAttribute('data-x', 'val')
    applyProp(el, 'data-x', null)
    expect(el.hasAttribute('data-x')).toBe(false)
  })

  test('removes attribute when value is undefined', () => {
    const el = document.createElement('div')
    el.setAttribute('data-x', 'val')
    applyProp(el, 'data-x', undefined)
    expect(el.hasAttribute('data-x')).toBe(false)
  })

  test('sets boolean true as empty attribute', () => {
    const el = document.createElement('input') as HTMLInputElement
    applyProp(el, 'disabled', true)
    expect(el.hasAttribute('disabled')).toBe(true)
    expect(el.getAttribute('disabled')).toBe('')
  })

  test('removes attribute for boolean false', () => {
    const el = document.createElement('input') as HTMLInputElement
    el.setAttribute('disabled', '')
    applyProp(el, 'disabled', false)
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  test('sets DOM property directly when key exists on element', () => {
    const el = document.createElement('input') as HTMLInputElement
    applyProp(el, 'value', 'hello')
    expect(el.value).toBe('hello')
  })

  test('falls back to setAttribute for unknown attributes', () => {
    const el = document.createElement('div')
    applyProp(el, 'data-custom', 42)
    expect(el.getAttribute('data-custom')).toBe('42')
  })
})

// ─── applyProp — innerHTML / dangerouslySetInnerHTML ─────────────────────────

describe('applyProp — innerHTML', () => {
  test('innerHTML is sanitized', () => {
    const el = document.createElement('div')
    applyProp(el, 'innerHTML', '<b>bold</b><script>alert("xss")</script>')
    // Script tag should be stripped by sanitizer
    expect(el.innerHTML).toContain('<b>bold</b>')
    expect(el.innerHTML).not.toContain('<script>')
  })

  test('dangerouslySetInnerHTML bypasses sanitization (no warning — name is the warning, like React)', () => {
    const el = document.createElement('div')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyProp(el, 'dangerouslySetInnerHTML', { __html: '<em>raw</em>' })
    expect(el.innerHTML).toBe('<em>raw</em>')
    // No warning — the name "dangerouslySetInnerHTML" is the warning.
    // React doesn't log here, neither do we. Previously this warned on
    // every prop application, flooding the console on every re-render.
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test('reactive innerHTML accessor — function value is called, not stringified', async () => {
    // Regression: the JSX compiler emits `innerHTML={getIcon(props.x ? "a" : "b")}`
    // as a `() => …` accessor. Without function-value handling here, the
    // closure was set as literal text — `() => getIcon(...)` rendered
    // verbatim instead of the SVG.
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('div')
    const which = signal<'a' | 'b'>('a')
    const cleanup = applyProp(el, 'innerHTML', () => `<span data-x="${which()}">x</span>`)
    expect(el.querySelector('[data-x="a"]')).not.toBeNull()
    expect(el.innerHTML).not.toContain('=>')
    which.set('b')
    expect(el.querySelector('[data-x="b"]')).not.toBeNull()
    cleanup?.()
  })

  test('reactive dangerouslySetInnerHTML accessor — function value is called, not stringified', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('div')
    const html = signal('<em>one</em>')
    const cleanup = applyProp(el, 'dangerouslySetInnerHTML', () => ({ __html: html() }))
    expect(el.innerHTML).toBe('<em>one</em>')
    html.set('<em>two</em>')
    expect(el.innerHTML).toBe('<em>two</em>')
    cleanup?.()
  })

  test('dev warning fires if a function reaches applyStaticProp directly (defensive guard)', () => {
    // applyStaticProp is internal — reachable only if a future special-case
    // branch in applyProp bypasses the reactive-wrap dance. The dev guard
    // catches that regression at first render.
    const el = document.createElement('div')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Indirect: trigger by routing a function through `applyProp` for a
    // key that DOESN'T have a special case — exercises the reactive path,
    // which calls the accessor + passes the result. The accessor itself
    // returning a function would surface the warning.
    applyProp(el, 'innerHTML', () => () => '<em>nested</em>')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('applyStaticProp received a function for "innerHTML"'),
    )
    warnSpy.mockRestore()
  })
})

// Comprehensive sweep: every string-typed sink must handle reactive
// (function) values. The original bug was specific to innerHTML, but the
// structural fix should cover ALL sinks the same way. These tests assert
// that.
describe('applyProp — reactive function values across all sink kinds', () => {
  test('reactive href accessor on <a>', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('a')
    const path = signal('/one')
    const cleanup = applyProp(el, 'href', () => path())
    expect(el.getAttribute('href')).toBe('/one')
    path.set('/two')
    expect(el.getAttribute('href')).toBe('/two')
    cleanup?.()
  })

  test('reactive src accessor on <img>', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('img')
    const url = signal('/a.png')
    const cleanup = applyProp(el, 'src', () => url())
    // <img> exposes `src` as a normalized absolute URL — assert via getAttribute
    expect(el.getAttribute('src')).toBe('/a.png')
    url.set('/b.png')
    expect(el.getAttribute('src')).toBe('/b.png')
    cleanup?.()
  })

  test('reactive value accessor on <input>', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('input')
    const val = signal('alpha')
    const cleanup = applyProp(el, 'value', () => val())
    expect((el as HTMLInputElement).value).toBe('alpha')
    val.set('beta')
    expect((el as HTMLInputElement).value).toBe('beta')
    cleanup?.()
  })

  test('reactive title accessor (data attribute pattern)', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('div')
    const tip = signal('hello')
    const cleanup = applyProp(el, 'title', () => tip())
    expect(el.getAttribute('title')).toBe('hello')
    tip.set('world')
    expect(el.getAttribute('title')).toBe('world')
    cleanup?.()
  })

  test('reactive class accessor (string form)', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('div')
    const cls = signal('one')
    const cleanup = applyProp(el, 'class', () => cls())
    expect(el.className).toBe('one')
    cls.set('two')
    expect(el.className).toBe('two')
    cleanup?.()
  })

  test('reactive style accessor (object form)', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const el = document.createElement('div')
    const color = signal('red')
    const cleanup = applyProp(el, 'style', () => ({ color: color() }))
    expect(el.style.color).toBe('red')
    color.set('blue')
    expect(el.style.color).toBe('blue')
    cleanup?.()
  })
})

// ─── applyProp — URL safety ──────────────────────────────────────────────────

describe('applyProp — URL safety', () => {
  test('blocks javascript: in href', () => {
    const el = document.createElement('a')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyProp(el, 'href', 'javascript:alert(1)')
    expect(el.hasAttribute('href')).toBe(false)
    warnSpy.mockRestore()
  })

  test('blocks data: in src', () => {
    const el = document.createElement('img')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyProp(el, 'src', 'data:text/html,<script>alert(1)</script>')
    expect(el.hasAttribute('src')).toBe(false)
    warnSpy.mockRestore()
  })

  test('allows safe URLs', () => {
    const el = document.createElement('a')
    applyProp(el, 'href', 'https://example.com')
    expect(el.getAttribute('href')).toBe('https://example.com')
  })
})

// ─── sanitizeHtml ────────────────────────────────────────────────────────────

describe('sanitizeHtml', () => {
  test('strips script tags', () => {
    const result = sanitizeHtml('<div>hello</div><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('hello')
  })

  test('strips event handler attributes', () => {
    const result = sanitizeHtml('<div onclick="alert(1)">text</div>')
    expect(result).not.toContain('onclick')
    expect(result).toContain('text')
  })

  test('strips javascript: URLs from href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain('javascript:')
  })

  test('allows safe HTML tags', () => {
    const result = sanitizeHtml('<b>bold</b> <em>italic</em> <p>paragraph</p>')
    expect(result).toContain('<b>bold</b>')
    expect(result).toContain('<em>italic</em>')
    expect(result).toContain('<p>paragraph</p>')
  })

  test('uses custom sanitizer when set', () => {
    const custom = vi.fn((html: string) => html.replace(/<[^>]+>/g, ''))
    setSanitizer(custom)
    const result = sanitizeHtml('<div>test</div>')
    expect(custom).toHaveBeenCalledWith('<div>test</div>')
    expect(result).toBe('test')
    setSanitizer(null)
  })
})

// ─── delegate.ts ─────────────────────────────────────────────────────────────

describe('delegate', () => {
  test('DELEGATED_EVENTS contains common bubbling events', () => {
    expect(DELEGATED_EVENTS.has('click')).toBe(true)
    expect(DELEGATED_EVENTS.has('input')).toBe(true)
    expect(DELEGATED_EVENTS.has('keydown')).toBe(true)
    expect(DELEGATED_EVENTS.has('submit')).toBe(true)
  })

  test('DELEGATED_EVENTS does not contain non-bubbling events', () => {
    expect(DELEGATED_EVENTS.has('focus')).toBe(false)
    expect(DELEGATED_EVENTS.has('blur')).toBe(false)
    expect(DELEGATED_EVENTS.has('mouseenter')).toBe(false)
    expect(DELEGATED_EVENTS.has('mouseleave')).toBe(false)
    expect(DELEGATED_EVENTS.has('load')).toBe(false)
    expect(DELEGATED_EVENTS.has('scroll')).toBe(false)
  })

  test('delegatedPropName returns __ev_{eventName}', () => {
    expect(delegatedPropName('click')).toBe('__ev_click')
    expect(delegatedPropName('input')).toBe('__ev_input')
  })

  test('setupDelegation installs listeners and dispatches to expandos', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)

    const child = document.createElement('button')
    container.appendChild(child)

    const handler = vi.fn()
    const prop = delegatedPropName('click')
    ;(child as unknown as Record<string, unknown>)[prop] = handler

    child.click()
    expect(handler).toHaveBeenCalled()

    container.remove()
  })

  test('setupDelegation is idempotent (safe to call twice)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    // Should not throw when called twice
    setupDelegation(container)
    setupDelegation(container)

    const child = document.createElement('span')
    container.appendChild(child)

    let callCount = 0
    const prop = delegatedPropName('click')
    ;(child as unknown as Record<string, unknown>)[prop] = () => {
      callCount++
    }

    child.click()
    // Should only fire once (not duplicated by double setup)
    expect(callCount).toBe(1)

    container.remove()
  })

  test('delegation walks up the DOM tree (ancestor handlers fire)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)

    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    container.appendChild(parent)

    const parentHandler = vi.fn()
    const childHandler = vi.fn()
    const prop = delegatedPropName('click')
    ;(parent as unknown as Record<string, unknown>)[prop] = parentHandler
    ;(child as unknown as Record<string, unknown>)[prop] = childHandler

    child.click()
    expect(childHandler).toHaveBeenCalled()
    expect(parentHandler).toHaveBeenCalled()

    container.remove()
  })

  test('delegation respects stopPropagation', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)

    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    container.appendChild(parent)

    const parentHandler = vi.fn()
    const childHandler = vi.fn((e: Event) => e.stopPropagation())
    const prop = delegatedPropName('click')
    ;(parent as unknown as Record<string, unknown>)[prop] = parentHandler
    ;(child as unknown as Record<string, unknown>)[prop] = childHandler

    child.click()
    expect(childHandler).toHaveBeenCalled()
    expect(parentHandler).not.toHaveBeenCalled()

    container.remove()
  })

  test('delegation skips non-function expando values', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setupDelegation(container)

    const child = document.createElement('span')
    container.appendChild(child)

    const prop = delegatedPropName('click')
    ;(child as unknown as Record<string, unknown>)[prop] = 'not-a-function'

    // Should not throw
    expect(() => child.click()).not.toThrow()

    container.remove()
  })
})

describe('applyProp — boolean ARIA state attributes render as strings', () => {
  // ARIA state/property attrs are string enums; a boolean must become the
  // literal "true"/"false", NOT presence-only "" (which assistive tech does
  // not read as the state). See anti-patterns.md "Boolean ARIA-STATE …".
  it('renders boolean aria-checked as "true"/"false" (not presence-only "")', () => {
    const el = document.createElement('button')
    applyProp(el, 'aria-checked', true)
    expect(el.getAttribute('aria-checked')).toBe('true')
    applyProp(el, 'aria-checked', false)
    expect(el.getAttribute('aria-checked')).toBe('false')
  })

  it('applies to the other aria-* state attrs', () => {
    const el = document.createElement('div')
    applyProp(el, 'aria-expanded', true)
    expect(el.getAttribute('aria-expanded')).toBe('true')
    applyProp(el, 'aria-selected', false)
    expect(el.getAttribute('aria-selected')).toBe('false')
    applyProp(el, 'aria-disabled', true)
    expect(el.getAttribute('aria-disabled')).toBe('true')
    applyProp(el, 'aria-hidden', true)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    applyProp(el, 'aria-pressed', false)
    expect(el.getAttribute('aria-pressed')).toBe('false')
  })

  it('leaves HTML boolean attributes presence-based (disabled)', () => {
    const el = document.createElement('button')
    applyProp(el, 'disabled', true)
    expect(el.getAttribute('disabled')).toBe('') // presence, not "true"
    applyProp(el, 'disabled', false)
    expect(el.hasAttribute('disabled')).toBe(false) // absent
  })

  it('leaves data-* booleans presence-based (author-defined)', () => {
    const el = document.createElement('div')
    applyProp(el, 'data-active', true)
    expect(el.getAttribute('data-active')).toBe('') // presence
  })

  it('passes string aria values through unchanged (e.g. "mixed")', () => {
    const el = document.createElement('div')
    applyProp(el, 'aria-checked', 'mixed')
    expect(el.getAttribute('aria-checked')).toBe('mixed')
  })
})

// ─── applyProps — getter-descriptor (reactive-prop) path ─────────────────────
// `makeReactiveProps` turns compiler-emitted `_rp(() => signal())` wrappers into
// GETTER descriptors. `applyProps` must detect the getter and wrap the read in a
// `renderEffect` so the attribute tracks the signal — a plain value read would
// fire the getter once and freeze the value (the descriptor-copy footgun class).
describe('applyProps — reactive getter-descriptor props', () => {
  it('binds a getter-shaped prop reactively (updates on signal change)', () => {
    const title = signal('a')
    const el = document.createElement('div')
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'title', {
      get: () => title(),
      enumerable: true,
      configurable: true,
    })

    const cleanup = applyProps(el, props)
    expect(el.getAttribute('title')).toBe('a') // eager initial run

    title.set('b')
    expect(el.getAttribute('title')).toBe('b') // renderEffect tracked the signal

    cleanup?.()
    title.set('c')
    expect(el.getAttribute('title')).toBe('b') // disposed — no further updates
  })

  it('still applies plain data-descriptor props statically (non-getter branch)', () => {
    const el = document.createElement('div')
    applyProps(el, { id: 'plain', title: 'hi' })
    expect(el.id).toBe('plain')
    expect(el.getAttribute('title')).toBe('hi')
  })
})

// ─── applySelectValueProp — deferred <select value> (PZ-09) ──────────────────
describe('applySelectValueProp', () => {
  function selectWithOptions(...values: string[]): HTMLSelectElement {
    const sel = document.createElement('select')
    for (const v of values) {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      sel.appendChild(opt)
    }
    return sel
  }

  it('applies a static (non-getter) value against the mounted options', () => {
    const sel = selectWithOptions('a', 'b', 'c')
    const cleanup = applySelectValueProp(sel, { value: 'b' })
    expect(sel.value).toBe('b')
    expect(cleanup).toBeNull() // static value → no reactive cleanup
  })

  it('binds a getter-shaped value reactively (re-selects on signal change)', () => {
    const sel = selectWithOptions('a', 'b', 'c')
    const chosen = signal('a')
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'value', {
      get: () => chosen(),
      enumerable: true,
      configurable: true,
    })

    const cleanup = applySelectValueProp(sel, props)
    expect(sel.value).toBe('a') // eager initial run sees the options

    chosen.set('c')
    expect(sel.value).toBe('c') // renderEffect re-applied the value

    cleanup?.()
    chosen.set('b')
    expect(sel.value).toBe('c') // disposed
  })
})

// ─── applyAttrProp (_setAttr) — the compiler template-path attr mirror ───────
// Kept branch-for-branch identical to setStaticProp's value==null / boolean-aria
// / boolean tail so the `_tpl()` fast path and the `h()` path never drift.
describe('applyAttrProp (_setAttr template mirror)', () => {
  it('renders boolean aria-* as the string "true"/"false" (a11y — not presence)', () => {
    const el = document.createElement('div')
    applyAttrProp(el, 'aria-checked', true)
    expect(el.getAttribute('aria-checked')).toBe('true')
    applyAttrProp(el, 'aria-checked', false)
    expect(el.getAttribute('aria-checked')).toBe('false')
  })

  it('keeps HTML boolean attrs presence-based (disabled)', () => {
    const el = document.createElement('button')
    applyAttrProp(el, 'disabled', true)
    expect(el.getAttribute('disabled')).toBe('') // presence
    applyAttrProp(el, 'disabled', false)
    expect(el.hasAttribute('disabled')).toBe(false) // absent
  })

  it('removes the attribute for null/undefined', () => {
    const el = document.createElement('div')
    el.setAttribute('title', 'x')
    applyAttrProp(el, 'title', null)
    expect(el.hasAttribute('title')).toBe(false)
  })

  it('stringifies non-boolean values', () => {
    const el = document.createElement('div')
    applyAttrProp(el, 'data-count', 5)
    expect(el.getAttribute('data-count')).toBe('5')
  })
})
