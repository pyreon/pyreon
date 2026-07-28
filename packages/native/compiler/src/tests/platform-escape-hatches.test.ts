// The escape hatches are load-bearing for every warning that recommends them.
//
// Two warnings added in this arc — for hooks with no native lowering, and for
// control-flow components with none — tell the author to "use it behind a
// `<Web>` escape hatch". That advice is only worth giving if `<Web>` genuinely
// excludes its children from the native emit. If it ever stopped, the guidance
// would silently become wrong, and wrong guidance in a compiler warning is
// worse than no guidance: it sends people down a path that cannot work while
// looking authoritative.
//
// So the contract gets its own test rather than being assumed by the warnings
// that cite it. Verified before those warnings shipped, not after.
//
// The contract, per the four-layer model's L4:
//
//   <Web>            children compile for WEB only — absent from both natives
//   <NativeIOS>      children compile for iOS only — absent from Kotlin
//   <NativeAndroid>  children compile for Android only — absent from Swift
//
// Content OUTSIDE a hatch is shared and must survive on every target, which is
// the half a "does it exclude?" test forgets: a hatch that excluded everything
// would pass an exclusion-only assertion.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (hatch: string, inner: string) =>
  `import { ${hatch}, Stack, Text } from '@pyreon/primitives'
export function C(){
  return (<Stack><${hatch}><Text>${inner}</Text></${hatch}><Text>shared</Text></Stack>)
}`

const swift = (src: string) => transform(src, { target: 'swift' }).code
const kotlin = (src: string) => transform(src, { target: 'kotlin' }).code

describe('platform escape hatches', () => {
  describe('<Web> — the hatch the compiler warnings recommend', () => {
    const src = app('Web', 'web only')

    it('EXCLUDES its children from both native targets', () => {
      expect(swift(src)).not.toContain('web only')
      expect(kotlin(src)).not.toContain('web only')
    })

    it('keeps the SHARED sibling on both — it excludes the hatch, not the tree', () => {
      expect(swift(src)).toContain('shared')
      expect(kotlin(src)).toContain('shared')
    })

    it('emits no warnings — using the documented hatch is not a diagnostic', () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(src, { target }).warnings ?? [], target).toEqual([])
      }
    })
  })

  describe('<NativeIOS> / <NativeAndroid>', () => {
    it('include their children on their OWN target only', () => {
      const ios = app('NativeIOS', 'ios only')
      expect(swift(ios)).toContain('ios only')
      expect(kotlin(ios)).not.toContain('ios only')

      const android = app('NativeAndroid', 'android only')
      expect(kotlin(android)).toContain('android only')
      expect(swift(android)).not.toContain('android only')
    })

    it('keep the shared sibling on both targets', () => {
      for (const hatch of ['NativeIOS', 'NativeAndroid']) {
        const src = app(hatch, 'platform only')
        expect(swift(src), hatch).toContain('shared')
        expect(kotlin(src), hatch).toContain('shared')
      }
    })
  })

  // Excluding content is only useful if what REMAINS still builds — an emit
  // that dropped the children but left a dangling wrapper would satisfy every
  // string assertion above and fail the moment anyone compiled it.
  for (const hatch of ['Web', 'NativeIOS', 'NativeAndroid']) {
    it.skipIf(!isSwiftcAvailable())(`${hatch}: what remains type-checks on Swift`, () => {
      const res = validateSwiftWithStubs(swift(app(hatch, 'inner')))
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${hatch}: what remains type-checks on Kotlin`, () => {
      const res = validateKotlin(kotlin(app(hatch, 'inner')))
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }
})
