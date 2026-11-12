/**
 * `useUrlState(key, default, options)` on iOS / Android (#4364). The native
 * bindings implement one behaviour (immediate, replacing writes; the comma
 * list format; the codec inferred from the default), and the options that ask
 * for something else were dropped with NO warning, so a `deserialize` that
 * upper-cases the value read differently on the web and natively. Each such
 * option is now reported by name; options that match native behaviour are
 * not, and the binding still lowers.
 *
 * Bisect-verified: without `reportIgnoredOptions` the "reported" specs see an
 * empty warning list.
 */
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const src = (call: string) => `import { useUrlState } from '@pyreon/url-state'
export function App() {
  const q = ${call}
  return <Text>{q()}</Text>
}`
const warnings = (call: string, target: 'swift' | 'kotlin') =>
  transform(src(call), { target }).warnings.filter((w) => String(w).includes('useUrlState'))

describe('useUrlState options on native', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: the issue's options are reported by name, and the binding still lowers`, () => {
      const call = `useUrlState('q', 'all', { debounce: 300, clearOnDefault: false, deserialize: (r: string) => r.toUpperCase() })`
      const out = transform(src(call), { target })
      const w = out.warnings.filter((x) => String(x).includes('useUrlState')).join('\n')
      expect(w).toContain('`debounce`')
      expect(w).toContain('`deserialize`')
      expect(w).not.toContain('clearOnDefault')
      expect(out.code).toContain('"q"')
      expect(out.code).toMatch(/PyreonUrlState\(/)
    })

    it(`${target}: replace: false, arrayFormat: 'repeat', serialize and onChange are reported`, () => {
      const w = warnings(
        `useUrlState('q', 'a', { replace: false, arrayFormat: 'repeat', serialize: (v: string) => v, onChange: () => {} })`,
        target,
      ).join('\n')
      for (const name of ['replace', 'arrayFormat', 'serialize', 'onChange']) expect(w).toContain(`\`${name}\``)
    })

    it(`${target}: options that match native behaviour are not reported`, () => {
      expect(
        warnings(`useUrlState('q', 'a', { replace: true, debounce: 0, arrayFormat: 'comma', clearOnDefault: true })`, target),
      ).toEqual([])
      expect(warnings(`useUrlState('q', 'a')`, target)).toEqual([])
    })

    it(`${target}: options that are not an inline object are reported`, () => {
      expect(warnings(`useUrlState('q', 'a', someOptions)`, target).join('\n')).toContain('not an inline object')
    })
  }
})
