/**
 * Regression + contract lock for the STRING style skip-if-equal guard in
 * `applyStyleProp` (the sibling of `applyClassProp`'s getAttribute compare).
 *
 * Before the guard, EVERY reactive style-string re-emit reassigned
 * `el.style.cssText` — a full declaration parse + style invalidation even
 * when the string was byte-identical. `el.style.cssText` readback is
 * NORMALIZED by the engine (never equal to the input), so the guard caches
 * the last-WRITTEN pair { raw input, normalized readback } and skips only
 * when the input is unchanged AND the live declaration still serializes to
 * what that write produced — which is what keeps an EXTERNAL style mutation
 * between identical emits from going stale (mirrors applyClassProp's
 * live-DOM-compare philosophy).
 *
 * Bisect-verified: reverting the guard (unconditional `el.style.cssText =
 * value`) fails the "exactly one write" specs with 2 writes counted.
 */
import { query } from '@pyreon/test-utils'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { applyStyleProp } from '../props'
import { mount } from '../index'

/**
 * Count `cssText` SETTER invocations on one element's style declaration.
 * The accessor lives on the CSSStyleDeclaration prototype (happy-dom and
 * real browsers alike) — shadow it per-instance with a counting forwarder
 * so reads (the guard's readback compare) still hit the real getter.
 */
function spyCssTextWrites(el: HTMLElement): { count: () => number; restore: () => void } {
  const style = el.style
  let proto: object | null = Object.getPrototypeOf(style)
  let desc: PropertyDescriptor | undefined
  while (proto !== null) {
    desc = Object.getOwnPropertyDescriptor(proto, 'cssText')
    if (desc) break
    proto = Object.getPrototypeOf(proto)
  }
  if (!desc || !desc.set || !desc.get) {
    throw new Error('cssText accessor not found on CSSStyleDeclaration prototype chain')
  }
  const { get, set } = desc
  let writes = 0
  Object.defineProperty(style, 'cssText', {
    configurable: true,
    get() {
      return get.call(this)
    },
    set(v: string) {
      writes++
      set.call(this, v)
    },
  })
  return {
    count: () => writes,
    restore: () => {
      delete (style as unknown as Record<string, unknown>).cssText
    },
  }
}

describe('applyStyleProp — string skip-if-equal (direct calls)', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    el = document.createElement('div')
    document.body.appendChild(el)
  })

  afterEach(() => {
    el.remove()
  })

  it('writes cssText exactly ONCE for two identical string emits', () => {
    const spy = spyCssTextWrites(el)
    applyStyleProp(el, 'color: red; font-size: 14px')
    applyStyleProp(el, 'color: red; font-size: 14px')
    expect(spy.count()).toBe(1)
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('14px')
    spy.restore()
  })

  it('writes again when the string CHANGES', () => {
    const spy = spyCssTextWrites(el)
    applyStyleProp(el, 'color: red')
    applyStyleProp(el, 'color: blue')
    expect(spy.count()).toBe(2)
    expect(el.style.color).toBe('blue')
    spy.restore()
  })

  it('re-writes an identical string after an EXTERNAL style mutation (guard is live-DOM-verified, not write-only)', () => {
    applyStyleProp(el, 'color: red')
    // Something outside the framework mutates the declaration between
    // identical emits — e.g. an animation lib or manual devtools-style poke.
    el.style.color = 'purple'
    expect(el.style.color).toBe('purple')

    const spy = spyCssTextWrites(el)
    applyStyleProp(el, 'color: red')
    // A write-only expando cache would skip here and leave 'purple' stale.
    // The readback half of the guard detects the divergence and rewrites.
    expect(spy.count()).toBe(1)
    expect(el.style.color).toBe('red')
    spy.restore()
  })

  it('re-writes an identical string after an intervening OBJECT-mode style (stale cache self-corrects via readback)', () => {
    applyStyleProp(el, 'color: red')
    // Object path is deliberately untouched by the guard — it changes the
    // declaration without clearing the string cache; the readback compare
    // is what invalidates the skip.
    applyStyleProp(el, { color: 'green', margin: '2px' })
    expect(el.style.color).toBe('green')

    const spy = spyCssTextWrites(el)
    applyStyleProp(el, 'color: red')
    expect(spy.count()).toBe(1)
    expect(el.style.color).toBe('red')
    // cssText replaced everything — object-mode margin is gone.
    expect(el.style.margin).toBe('')
    spy.restore()
  })

  it('empty string still clears on first emit; identical empty re-emit skips', () => {
    applyStyleProp(el, 'color: red')
    const spy = spyCssTextWrites(el)
    applyStyleProp(el, '')
    expect(el.style.color).toBe('')
    applyStyleProp(el, '')
    expect(spy.count()).toBe(1)
    spy.restore()
  })
})

describe('applyStyleProp — string skip-if-equal (reactive h() mount)', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('a reactive style thunk re-emitting the SAME string performs exactly one cssText write', () => {
    const tick = signal(0)
    mount(
      h('div', {
        style: () => {
          tick() // subscribe — re-runs on every tick, output unchanged
          return 'color: red; font-size: 14px'
        },
      }),
      container,
    )
    const el = query<HTMLDivElement>(container, 'div')
    const spy = spyCssTextWrites(el)
    // spy attached AFTER mount — the initial write already happened; every
    // re-emit below is byte-identical, so ZERO further writes are expected.
    tick.set(1)
    tick.set(2)
    tick.set(3)
    expect(spy.count()).toBe(0)
    expect(el.style.color).toBe('red')
    spy.restore()
  })

  it('a reactive style thunk emitting a DIFFERENT string still writes', () => {
    const color = signal('red')
    mount(h('div', { style: () => `color: ${color()}` }), container)
    const el = query<HTMLDivElement>(container, 'div')
    const spy = spyCssTextWrites(el)
    color.set('blue')
    expect(spy.count()).toBe(1)
    expect(el.style.color).toBe('blue')
    spy.restore()
  })
})
