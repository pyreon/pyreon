/**
 * Candidate 2: signal-method-call auto-promotion in text-child bindings.
 *
 * Detects `<text>{signalRef().method(...staticArgs)}</text>` where the
 * method is a pure Number/String/Boolean prototype method (safelist:
 * toFixed, toString, toUpperCase, slice, padStart, etc.). Emits
 * `_bindDirect(signalRef, (v) => textNode.data = v.method(...args))` —
 * skipping the `withTracking` setup + signal lookup per fire.
 *
 * Same structural shape as `_bindText` for bare signal reads, extended
 * to common formatting patterns (currency, percentages, padding,
 * case conversion).
 *
 * Bails when:
 *   - Receiver isn't a zero-arg call to a known signal
 *   - Method isn't in the pure-primitive safelist
 *   - Args contain reactive reads
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const transform = (code: string) => transformJSX_JS(code, 'test.tsx')

describe('Compiler: signal-method-call auto-promotion in text children', () => {
  describe('promotes Number prototype methods', () => {
    it('toFixed(2)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const count = signal(0)
        export const X = () => <span>{count().toFixed(2)}</span>
      `
      const out = transform(src).code
      expect(out).toMatch(/const __d\d+ = _bindDirect\(count,/)
      expect(out).toMatch(/__t0\.data = v\.toFixed\(2\)/)
    })

    it('toExponential', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const x = signal(0)
        export const X = () => <span>{x().toExponential()}</span>
      `
      const out = transform(src).code
      expect(out).toContain('_bindDirect(x,')
      expect(out).toContain('v.toExponential()')
    })

    it('toPrecision(3)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const x = signal(0)
        export const X = () => <span>{x().toPrecision(3)}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.toPrecision(3)')
    })
  })

  describe('promotes String prototype methods', () => {
    it('toUpperCase', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const name = signal('hi')
        export const X = () => <span>{name().toUpperCase()}</span>
      `
      const out = transform(src).code
      expect(out).toContain('_bindDirect(name,')
      expect(out).toContain('v.toUpperCase()')
    })

    it('slice(0, 5)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const s = signal('hello world')
        export const X = () => <span>{s().slice(0, 5)}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.slice(0, 5)')
    })

    it('padStart(4, "0")', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const n = signal('1')
        export const X = () => <span>{n().padStart(4, "0")}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.padStart(4, "0")')
    })

    it('charAt(0)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const s = signal('hello')
        export const X = () => <span>{s().charAt(0)}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.charAt(0)')
    })
  })

  describe('promotes toString / valueOf (shared methods)', () => {
    it('toString()', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const n = signal(42)
        export const X = () => <span>{n().toString()}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.toString()')
    })

    it('toString(16) (radix arg)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const n = signal(255)
        export const X = () => <span>{n().toString(16)}</span>
      `
      const out = transform(src).code
      expect(out).toContain('v.toString(16)')
    })
  })

  describe('bails when shape is NOT safe', () => {
    it('bails on Array.sort (NOT in safelist — mutates)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const arr = signal([1, 2, 3])
        export const X = () => <span>{arr().sort()}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(arr,')
      expect(out).toContain('bindPolymorphicText(')
    })

    it('bails when receiver is not a known signal', () => {
      const src = `
        const v = 42
        export const X = () => <span>{v.toFixed(2)}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect')
    })

    it('bails when receiver has args (not a zero-arg signal call)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const f = (x) => x + 1
        const c = signal(0)
        export const X = () => <span>{f(c).toFixed(2)}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(f,')
      expect(out).not.toContain('_bindDirect(c,')
    })

    it('bails when method args contain a signal call', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const s = signal('hello world')
        const n = signal(0)
        export const X = () => <span>{s().slice(n())}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(s,')
    })

    it('bails when method is NOT in primitive safelist (Array.map)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const arr = signal([1, 2])
        export const X = () => <span>{arr().map(String)}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(arr,')
    })

    it('bails when method callee is computed (sig()["toFixed"](2))', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const c = signal(0)
        export const X = () => <span>{c()["toFixed"](2)}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(c,')
    })

    it('bails when wrapped in arrow but inner is not a method call', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const c = signal(0)
        export const X = () => <span>{() => c() + 1}</span>
      `
      const out = transform(src).code
      expect(out).not.toContain('_bindDirect(c,')
    })
  })

  describe('integration with other detectors', () => {
    it('selector-ternary takes precedence over method-call detection (different shapes)', () => {
      // This isn't an integration conflict — both detectors target different
      // shapes. Just sanity-check that a selector ternary doesn't accidentally
      // hit the method-call path.
      const src = `
        import { createSelector, signal } from '@pyreon/reactivity'
        const sel = createSelector(signal(null))
        export const X = (k) => <span>{() => sel(k) ? 'a' : 'b'}</span>
      `
      const out = transform(src).code
      expect(out).toContain('sel.subscribe(k,')
      expect(out).not.toContain('_bindDirect(sel,')
    })

    it('bare signal direct-ref takes precedence over method (signal-only form)', () => {
      const src = `
        import { signal } from '@pyreon/reactivity'
        const count = signal(0)
        export const X = () => <span>{count()}</span>
      `
      const out = transform(src).code
      // Plain signal read still uses _bindText (most efficient path)
      expect(out).toContain('_bindText(count,')
      expect(out).not.toContain('_bindDirect(count,')
    })
  })
})
