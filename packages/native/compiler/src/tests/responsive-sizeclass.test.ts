// Responsive on native — by COMPOSITION (size classes), not CSS breakpoints.
//
// CSS pixel breakpoints (`[xs, sm, md, lg]`) have no clean native mapping, but
// native DOES have a 2-bucket width class: SwiftUI `@Environment(\.horizontalSizeClass)`
// (compact/regular), Compose `LocalConfiguration.current.screenWidthDp`. The
// `useSizeClass()` hook lowers both to a reactive `"compact"`/`"regular"` string,
// so a rocketstyle DYNAMIC dimension flip keyed on it —
// `state={size === 'regular' ? 'expanded' : 'mobile'}` — gives a real
// mobile-vs-expanded responsive layout that re-flows on rotation / split-screen.
//
// Also locks the stub fix: the validate-kotlin gate was missing
// `LocalConfiguration`, so ANY useSizeClass Kotlin emit failed kotlinc.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const PANEL = `import { Stack, Text } from '@pyreon/primitives'
const Panel = rocketstyle()({ name: 'Panel', component: Stack })
  .states({ mobile: { padding: '12px' }, expanded: { padding: '32px' } })
export function App() {
  const size = useSizeClass()
  return (<Panel state={size === 'regular' ? 'expanded' : 'mobile'}><Text>Hi</Text></Panel>)
}`

describe('responsive — useSizeClass + dynamic dimension composition', () => {
  it('lowers a size-class responsive flip to a conditional padding (Swift)', () => {
    const { code } = transform(PANEL, { target: 'swift' })
    expect(code).toContain('@Environment(\\.horizontalSizeClass) private var pyreonSizeClass')
    expect(code).toContain('.padding(((size == "regular") ? 32 : 12))')
  })

  it('lowers the same via LocalConfiguration.screenWidthDp (Kotlin)', () => {
    const { code } = transform(PANEL, { target: 'kotlin' })
    expect(code).toContain('LocalConfiguration.current.screenWidthDp >= 600')
    expect(code).toContain('.padding((if (size == "regular") 32 else 12).dp)')
  })
})

describe('responsive — toolchain gates (real SDKs)', () => {
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the responsive composition typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(PANEL, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the responsive composition compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(PANEL, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')(
    'a bare useSizeClass() Kotlin emit compiles — the LocalConfiguration stub is present',
    () => {
      // Isolates the stub fix: previously the validate-kotlin stub omitted
      // LocalConfiguration, so this failed with `unresolved reference`.
      const src = `import { Text } from '@pyreon/primitives'
export function App() { const s = useSizeClass(); return (<Text>{s}</Text>) }`
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error).toBe(true)
    },
  )
})
