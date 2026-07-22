// `@pyreon/ui-core` native — `<PyreonUI>` is a transparent provider.
//
// On the web PyreonUI sets up the theme/mode context. On native the theme is
// compile-time-resolved (theme-native parses `defineTheme`) and dark mode is a
// system read (useColorScheme → @Environment(\.colorScheme)), so the provider
// carries no runtime context — it just renders its children (a `Group` on
// SwiftUI / `Column` on Compose). This lets a whole ui-system app root — the
// provider + defineTheme + Element layout + rocketstyle components — lower.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

// A full ui-system app root — provider + theme + Element layout + a card.
const APP = `import { PyreonUI } from '@pyreon/ui-core'
import { Element, Text } from '@pyreon/elements'
const theme = defineTheme({ color: { surface: '#ffffff' }, spacing: { md: 16 }, radius: { md: 8 } })
const Card = rocketstyle()({ name: 'Card', component: Element })
  .theme(() => ({ padding: t.spacing.md, backgroundColor: t.color.surface, borderRadius: t.radius.md }))
export function App() {
  return (
    <PyreonUI theme={theme}>
      <Element direction='rows' alignX='center' gap='md'>
        <Card><Text>Hi</Text></Card>
      </Element>
    </PyreonUI>
  )
}`

describe('ui-core-native — PyreonUI transparent provider', () => {
  it('renders children transparently as a Group (Swift)', () => {
    const { code, warnings } = swift(APP)
    expect(code).toContain('Group {')
    expect(code).toContain('VStack(alignment: .center, spacing: 12)') // the Element inside
    expect(code).toContain('.padding(16)') // the card inside the provider
    expect(warnings.join('\n')).not.toMatch(/WEB-ONLY|unresolved|not.*native/)
  })

  it('renders children transparently as a Column (Kotlin)', () => {
    const { code } = kotlin(APP)
    expect(code).toContain('Column {') // the provider passthrough
    expect(code).toContain('horizontalAlignment = Alignment.CenterHorizontally') // Element inside
    expect(code).toContain('.padding(16.dp)') // the card
  })
})

describe('ui-core-native — toolchain gates (real SDKs)', () => {
  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the full ui-system app root typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(APP).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the full ui-system app root compiles (real kotlinc)', () => {
    const res = validateKotlin(kotlin(APP).code)
    expect(res.ok, res.error).toBe(true)
  })
})
