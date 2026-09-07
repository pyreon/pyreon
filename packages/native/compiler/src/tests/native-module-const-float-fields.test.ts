// A struct field's Int/Double is refined from the evidence beside it. The pass
// covered a SIGNAL initializer (`signal<B[]>([{ l: 0.5 }])`) and not the
// module-level spelling — `const BARS: B[] = [{ l: 0.5 }]` next to `interface
// B { l: number }`, which is how fixture data is written in nearly every doc —
// so `l` stayed an Int and kotlinc rejected the literal. One spelling of the
// same evidence, the class this repo keeps re-learning; both now refine.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
interface B { day: string; o: number; l: number }
const BARS: B[] = [{ day: 'Mon', o: 1, l: 0.5 }, { day: 'Tue', o: 2, l: 1.5 }]
export function Rows() {
  return <Stack><Text>{BARS.length}</Text></Stack>
}`

describe('struct float refinement — a module-level const initializer is evidence too', () => {
  it('refines the field on both targets; the integer field beside it stays Int', () => {
    const s = transform(SRC, { target: 'swift' })
    expect(s.code).toContain('var l: Double')
    expect(s.code).toContain('var o: Int')
    const k = transform(SRC, { target: 'kotlin' })
    expect(k.code).toContain('var l: Double')
    expect(k.code).toContain('var o: Int')
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the module (it rejected the Double literal against an Int field before)', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
