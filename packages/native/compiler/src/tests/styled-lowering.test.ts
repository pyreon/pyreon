// `styled(Prim)`css`` component lowering.
//
// A `const Box = styled(Stack)`…`` wrapping a CANONICAL @pyreon/primitives
// component lowers each `<Box>` use-site to `<Prim>` with the captured static
// CSS injected as a synthetic `style` attr — so the whole inline-style connector
// (styleToNativeModifiers) lowers it unchanged. This is the first step of the
// component-level native-lowering arc (the plumbing rocketstyle builds on).
//
// Layers: EMIT assertions (bisect-load-bearing — disabling the rewrite drops the
// modifiers) + toolchain GATES (the emitted native compiles on both real
// toolchains).

import { describe, expect, it, vi } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

vi.setConfig({ testTimeout: 90_000 })

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const BOX = `import { Stack, Text } from '@pyreon/primitives'
const Box = styled(Stack)\`
  background: #2563eb;
  padding: 16px;
  border-radius: 8px;
\`
function App() { return (<Box><Text>Hi</Text></Box>) }`

describe('styled(Prim) component lowering — emit', () => {
  it('rewrites <Box> to a native VStack with the captured CSS as modifiers (Swift)', () => {
    const { code } = swift(BOX)
    // <Box> became a VStack (the wrapped Stack), NOT an unresolved `Box(…)`.
    expect(code).toContain('VStack')
    expect(code).not.toMatch(/\bBox\(/)
    // kebab→camel: border-radius → cornerRadius; background → the color.
    expect(code).toContain('.padding(16)')
    expect(code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
    expect(code).toContain('.cornerRadius(8)')
  })

  it('rewrites <Box> to a native Column with the captured CSS (Compose)', () => {
    const { code } = kotlin(BOX)
    expect(code).toContain('Column(')
    expect(code).not.toMatch(/\bBox\(/)
    expect(code).toContain('.clip(RoundedCornerShape(8.dp))')
    expect(code).toContain('.background(Color(0xFF2563EB))')
    expect(code).toContain('.padding(16.dp)')
  })

  it('preserves use-site children + attrs while injecting the style', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const Row = styled(Stack)\`background: #ffffff;\`
function App() { return (<Row gap="md"><Text>a</Text><Text>b</Text></Row>) }`
    const { code } = swift(src)
    // gap arg + both children survive; the background modifier is added.
    expect(code).toContain('spacing:')
    expect(code).toContain('Text("a")')
    expect(code).toContain('Text("b")')
    expect(code).toContain('.background(')
  })

  it('warns + does NOT lower styled() wrapping a non-primitive (styled("div"))', () => {
    const src = `import { Stack } from '@pyreon/primitives'
const Card = styled('div')\`background: red;\`
function App() { return (<Stack><Card/></Stack>) }`
    expect(transform(src, { target: 'swift' }).warnings.join('\n')).toMatch(
      /styled\('div'\).*only styled\(\) wrapping a CANONICAL/,
    )
  })

  it('RESOLVES a theme-token interpolation (`${(p) => p.theme.color.primary}`) to its value', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const T = styled(Stack)\`padding: 16px; background: \${(p) => p.theme.color.primary};\`
function App() { return (<T><Text>x</Text></T>) }`
    const { code, warnings } = swift(src)
    // The static padding lowers; the theme-token background resolves (default primary #2563eb).
    expect(code).toContain('.padding(16)')
    expect(code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
    expect(warnings.join('\n')).not.toMatch(/not yet\s+lowered/)
  })

  it('warns + drops a non-token interpolation (a runtime expression)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const T = styled(Stack)\`padding: 16px; color: \${(p) => p.someRuntimeValue};\`
function App() { return (<T><Text>x</Text></T>) }`
    const { code, warnings } = swift(src)
    expect(code).toContain('.padding(16)')
    expect(warnings.join('\n')).toMatch(/isn't a resolvable theme token/)
  })
})

describe('styled(Prim) — toolchain gates', () => {
  it.skipIf(!isSwiftUIAvailable())('the lowered styled component typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(BOX).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the lowered styled component compiles (Compose stubs)', () => {
    const res = validateKotlin(kotlin(BOX).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
