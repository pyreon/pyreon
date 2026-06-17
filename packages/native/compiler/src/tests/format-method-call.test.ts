// `Number.toFixed(d)` + `String.toUpperCase()` / `toLowerCase()`
// method-call emit. These fell through PMTC's generic call emit and were
// output VERBATIM — invalid on native, with no warning:
//   Swift:  n.toFixed(2)        // no such method
//           "x".toUpperCase()   // it's .uppercased()
// They're core to analytical-table rendering (currency/percent
// formatting, header casing). Now lowered through the TS-method switch.
// toFixed v1 = literal digit count (the common `toFixed(2)` shape);
// dynamic counts fall through.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const N = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
export function C() {
  const n = signal(1234.5)
  const s = signal('region')
  const out = computed(() => ${expr})
  return out
}`

describe('toFixed / toUpperCase / toLowerCase method-call emit', () => {
  describe('Swift', () => {
    it('toFixed(2) → String(format: "%.2f", n)', () => {
      const out = transform(N('n().toFixed(2)'), { target: 'swift' }).code
      expect(out).toContain('String(format: "%.2f", n)')
      expect(out).not.toContain('.toFixed(')
    })
    it('toFixed() (no arg) → "%.0f"', () => {
      const out = transform(N('n().toFixed()'), { target: 'swift' }).code
      expect(out).toContain('String(format: "%.0f", n)')
    })
    it('toUpperCase() → .uppercased()', () => {
      const out = transform(N("s().toUpperCase()"), { target: 'swift' }).code
      expect(out).toContain('.uppercased()')
      expect(out).not.toContain('.toUpperCase()')
    })
    it('toLowerCase() → .lowercased()', () => {
      const out = transform(N("s().toLowerCase()"), { target: 'swift' }).code
      expect(out).toContain('.lowercased()')
    })
  })

  describe('Kotlin', () => {
    it('toFixed(2) → "%.2f".format(n)', () => {
      const out = transform(N('n().toFixed(2)'), { target: 'kotlin' }).code
      expect(out).toContain('"%.2f".format(n)')
      expect(out).not.toContain('.toFixed(')
    })
    it('toUpperCase() → .uppercase()', () => {
      const out = transform(N("s().toUpperCase()"), { target: 'kotlin' }).code
      expect(out).toContain('.uppercase()')
      expect(out).not.toContain('.toUpperCase()')
    })
    it('toLowerCase() → .lowercase()', () => {
      const out = transform(N("s().toLowerCase()"), { target: 'kotlin' }).code
      expect(out).toContain('.lowercase()')
    })
  })
})
