// `@pyreon/elements` native frontend — Element → Stack.
//
// The 67 @pyreon/ui-components are `rocketstyle` over `el`/`txt`/`list` =
// Element/Text/List from @pyreon/elements. Mapping Element → the canonical
// Stack (with direction/alignX/alignY translated) is what makes a user's own
// ui-system-style components (rocketstyle over Element) lower to iOS/Android.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { elementToStack, isElementsPrimitive } from '../elements-native'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('elements-native — Element → Stack translation', () => {
  it('direction="rows" → a vertical Stack (VStack / Column); alignX → cross align', () => {
    const src = `import { Element, Text } from '@pyreon/elements'
export function App() { return (<Element direction='rows' alignX='center' gap='md'><Text>Hi</Text></Element>) }`
    expect(swift(src).code).toContain('VStack(alignment: .center, spacing: 12)')
    expect(kotlin(src).code).toContain(
      'Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally)',
    )
  })

  it('direction="cols" → a horizontal Stack (HStack / Row); alignY → cross align', () => {
    const src = `import { Element, Text } from '@pyreon/elements'
export function App() { return (<Element direction='cols' alignY='bottom' gap='sm'><Text>Hi</Text></Element>) }`
    expect(swift(src).code).toContain('HStack(alignment: .bottom, spacing: 8)')
    expect(kotlin(src).code).toContain('Row(')
    expect(kotlin(src).code).toContain('Arrangement.spacedBy(8.dp)')
  })

  it('lowers a rocketstyle-over-Element (the ui-components pattern) with theme styling', () => {
    const src = `import { Element, Text } from '@pyreon/elements'
const theme = defineTheme({ color: { surface: '#ffffff' }, spacing: { md: 16 }, radius: { md: 8 } })
const Card = rocketstyle()({ name: 'Card', component: Element })
  .theme(() => ({ padding: t.spacing.md, backgroundColor: t.color.surface, borderRadius: t.radius.md }))
export function App() { return (<Card><Text>Hi</Text></Card>) }`
    const s = swift(src)
    expect(s.code).toContain('.padding(16)')
    expect(s.code).toContain('.background(Color(.sRGB, red: 1.000, green: 1.000, blue: 1.000')
    expect(s.code).toContain('.cornerRadius(8)')
    expect(s.warnings.join('\n')).not.toMatch(/WEB-ONLY|not.*native|unresolved/)
  })

  it('importing @pyreon/elements no longer warns WEB-ONLY (it has a native frontend)', () => {
    const src = `import { Element, Text } from '@pyreon/elements'
export function App() { return (<Element><Text>Hi</Text></Element>) }`
    expect(swift(src).warnings.join('\n')).not.toMatch(/@pyreon\/elements is WEB-ONLY/)
  })

  it('isElementsPrimitive recognizes Element; elementToStack retags to Stack', () => {
    expect(isElementsPrimitive('Element')).toBe(true)
    expect(isElementsPrimitive('Overlay')).toBe(false)
    const e = { kind: 'jsx-element', tag: 'Element', attrs: [], children: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((elementToStack(e as any) as any).tag).toBe('Stack')
  })
})

describe('elements-native — toolchain gates (real SDKs)', () => {
  const SRC = `import { Element, Text } from '@pyreon/elements'
const theme = defineTheme({ color: { surface: '#ffffff' }, spacing: { md: 16 } })
const Card = rocketstyle()({ name: 'Card', component: Element }).theme(() => ({ padding: t.spacing.md, backgroundColor: t.color.surface }))
export function App() { return (<Element direction='rows' alignX='center' gap='md'><Card><Text>Hi</Text></Card></Element>) }`

  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the Element-based layout + card typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(SRC).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')('the Element-based layout + card compiles (real kotlinc)', () => {
    const res = validateKotlin(kotlin(SRC).code)
    expect(res.ok, res.error).toBe(true)
  })
})
