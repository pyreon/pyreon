// A mobile-first responsive ARRAY (`padding: [8, 16, 24]`) is @pyreon/unistyle's
// core idiom. It cannot lower: native has no media queries — iOS and Android
// resolve two size classes (compact / regular at 600dp), not N breakpoints, so
// an N-element array has no lossless mapping.
//
// Dropping it is correct. Dropping it under the GENERIC "not literal" message
// was not: it told the author to "use a literal" when they HAD written
// literals — an array of them — and never mentioned responsiveness or the
// pattern that does work.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (style: string) => `
  import { Stack, Text } from '@pyreon/primitives'
  export function C() {
    const someVar = 4
    const wide = true
    return (<Stack ${style}><Text>x</Text></Stack>)
  }
  `

describe('responsive style arrays get their own diagnostic', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: names the size-class model rather than "use a literal"`, () => {
      const w = (transform(app('style={{ padding: [8, 16, 24] }}'), { target }).warnings ?? []).join('\n')
      expect(w).toContain('RESPONSIVE ARRAY')
      expect(w).toContain('size classes')
      // The actionable half: the pattern that actually lowers.
      expect(w).toContain('useSizeClass')
      // And NOT the misleading advice.
      expect(w).not.toContain('are not literal')
    })
  }

  it('a genuinely dynamic value keeps the ORIGINAL message', () => {
    // The split must not swallow the case it was carved out of.
    const w = (transform(app('style={{ padding: someVar }}'), { target: 'swift' }).warnings ?? []).join('\n')
    expect(w).toContain('are not literal')
    expect(w).not.toContain('RESPONSIVE ARRAY')
  })

  it('the RECOMMENDED pattern actually lowers, on both targets', () => {
    // A diagnostic that recommends a broken workaround is worse than none —
    // so the advice is asserted, not assumed.
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(app('style={wide ? { padding: 16 } : { padding: 8 }}'), { target })
      expect(out.warnings ?? [], target).toEqual([])
      expect(out.code).toMatch(/padding/i)
    }
  })
})
