import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { applyStyleProp } from '../props'

// Real-Chromium lock for the STRING style skip-if-equal guard. The guard's
// skip condition compares the LIVE `el.style.cssText` against the value the
// framework's own last write serialized to — a property that depends on the
// real engine's normalization being deterministic (same declarations → same
// serialization). happy-dom's stub is forgiving; this suite proves the guard
// skips AND self-corrects against Chromium's actual serializer, where the
// readback genuinely differs from the input (`color:red;` → `color: red;`).

describe('applyStyleProp string skip-if-equal (real browser)', () => {
  it('skips the cssText write on a byte-identical re-emit (readback is normalized ≠ input)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    try {
      // Deliberately un-normalized input: Chromium's cssText readback will
      // NOT equal it, which is exactly why the guard caches the pair.
      const input = 'color:red;font-size:14px'
      applyStyleProp(el, input)
      expect(el.style.cssText).not.toBe(input) // premise: readback normalized
      const afterFirst = el.style.cssText

      // Shadow the prototype accessor per-instance to count setter calls.
      let proto: object | null = Object.getPrototypeOf(el.style)
      let desc: PropertyDescriptor | undefined
      while (proto !== null) {
        desc = Object.getOwnPropertyDescriptor(proto, 'cssText')
        if (desc) break
        proto = Object.getPrototypeOf(proto)
      }
      const { get, set } = desc!
      let writes = 0
      Object.defineProperty(el.style, 'cssText', {
        configurable: true,
        get() {
          return get!.call(this)
        },
        set(v: string) {
          writes++
          set!.call(this, v)
        },
      })

      applyStyleProp(el, input)
      expect(writes).toBe(0)
      expect(el.style.cssText).toBe(afterFirst)

      // External mutation between identical emits → the readback half of the
      // guard invalidates the skip and the framework value wins again.
      delete (el.style as unknown as Record<string, unknown>).cssText
      el.style.color = 'purple'
      applyStyleProp(el, input)
      expect(el.style.color).toBe('red')
    } finally {
      el.remove()
    }
  })

  it('reactive same-string re-emits keep the rendered style live and correct end-to-end', async () => {
    const tick = signal(0)
    const { container, unmount } = mountInBrowser(
      h('div', {
        id: 'sss',
        style: () => {
          tick()
          return 'color: rgb(255, 0, 0); font-size: 14px'
        },
      }, 'x'),
    )
    const el = container.querySelector<HTMLDivElement>('#sss')!
    expect(el.style.color).toBe('rgb(255, 0, 0)')

    tick.set(1)
    await flush()
    tick.set(2)
    await flush()

    expect(el.style.color).toBe('rgb(255, 0, 0)')
    expect(el.style.fontSize).toBe('14px')
    unmount()
  })
})
