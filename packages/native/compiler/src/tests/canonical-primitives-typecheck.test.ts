// The framework's most fundamental multiplatform claim, checked end to end.
//
// "Every canonical primitive maps to both targets" is the headline of the
// PMTC story — the emit VOCABULARY the whole four-layer shared-code model rests
// on. It was locked at the emit-string level (`canonical-primitives.test.ts`
// asserts the SwiftUI/Compose names) and by fixtures that exercise SOME of
// them, but nothing compiled every one of them and asked whether the result
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
import { CANONICAL_PRIMITIVES } from '../canonical-primitives'
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
  ['Audio', '<Audio src="https://example.com/a.mp3" />'],
  ['Video', '<Video src="https://example.com/a.mp4" />'],
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
  it('covers EVERY canonical primitive — the list is the claim', () => {
    // A silently-shrinking list would make the suite pass by testing less.
    // Keyed on the compiler's own Set (itself drift-locked against the
    // package exports), not a literal count: this spec used to pin 15 while
    // the package shipped 17, so `<Video>` and `<Audio>` were never compiled
    // here and the pinned number said everything was covered.
    expect(USAGES.map(([n]) => n).sort()).toEqual([...CANONICAL_PRIMITIVES].sort())
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
