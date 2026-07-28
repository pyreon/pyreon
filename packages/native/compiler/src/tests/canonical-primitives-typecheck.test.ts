// The framework's most fundamental multiplatform claim, checked end to end.
//
// "All 15 canonical primitives map to both targets" is the headline of the
// PMTC story — the emit VOCABULARY the whole four-layer shared-code model rests
// on. It was locked at the emit-string level (`canonical-primitives.test.ts`
// asserts the SwiftUI/Compose names) and by fixtures that exercise SOME of
// them, but nothing compiled all fifteen and asked whether the result
// type-checks on both platforms.
//
// That distinction has mattered repeatedly in this compiler: an emit can be
// perfectly reasonable-looking and uncompilable. `useDatabase` emitted Swift
// without argument labels for months; `db.insert` lowered a record to a tuple;
// four of the eight documented control-flow components reproduce their tag
// verbatim. Each looked fine as a string.
//
// This asserts the strong form: every primitive, both targets, type-checked
// against the stub surface, no warnings. It passes today — it is a regression
// guard for a working contract, not a ratchet over known debt.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/** One minimal, REALISTIC usage per primitive — props included, because a
 *  bare tag can lower while its documented props are dropped. */
const USAGES: ReadonlyArray<readonly [string, string]> = [
  ['Stack', '<Stack><Text>x</Text></Stack>'],
  ['Inline', '<Inline><Text>x</Text></Inline>'],
  ['Layer', '<Layer><Text>x</Text></Layer>'],
  ['Scroll', '<Scroll><Text>x</Text></Scroll>'],
  ['Spacer', '<Stack><Spacer /></Stack>'],
  ['Text', '<Text>x</Text>'],
  ['Heading', '<Heading level={1}>h</Heading>'],
  ['Image', '<Image src="https://example.com/a.png" alt="a" />'],
  ['Icon', '<Icon name="star" />'],
  ['Button', '<Button onPress={() => {}}>b</Button>'],
  ['Press', '<Press onPress={() => {}}><Text>p</Text></Press>'],
  ['Link', '<Link to="/x"><Text>l</Text></Link>'],
  ['Field', '<Field value="" onChangeText={() => {}} />'],
  ['Toggle', '<Toggle value={true} onChange={() => {}} />'],
  ['Modal', '<Modal open={true} onClose={() => {}}><Text>m</Text></Modal>'],
]

const ALL = USAGES.map(([n]) => n).join(', ')
const app = (jsx: string) =>
  `import { ${ALL} } from '@pyreon/primitives'\nexport function C(){ return (<Stack>${jsx}</Stack>) }`

describe('every canonical primitive compiles on both targets', () => {
  it('covers all 15 — the count is the claim', () => {
    // A silently-shrinking list would make the suite pass by testing less.
    expect(USAGES).toHaveLength(15)
  })

  for (const [name, jsx] of USAGES) {
    it(`${name}: emits without warnings on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(app(jsx), { target }).warnings ?? [], `${name}/${target}`).toEqual([])
      }
    })

    it.skipIf(!isSwiftcAvailable())(`${name}: the emitted Swift type-checks`, () => {
      const res = validateSwiftWithStubs(transform(app(jsx), { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${name}: the emitted Kotlin type-checks`, () => {
      const res = validateKotlin(transform(app(jsx), { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }
})
