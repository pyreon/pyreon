// `@pyreon/rocketstyle` native frontend — multi-dimensional resolution.
//
// A `const Btn = rocketstyle()({ name, component: Stack }).theme(…).states({…})
//   .sizes({…})` used as `<Btn state="primary" size="large">` resolves — at
// compile time — base ∪ matched-dims into ONE style object (dims override base),
// then reuses the styled(Prim) rewrite → `<Stack style={merged}>` → the
// inline-style connector. The rocketstyle-native frontend produces the shared
// style-object IR; the connector is the shared native backend.

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

const BTN = `import { Stack, Text } from '@pyreon/primitives'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .theme(() => ({ padding: '8px 16px', borderRadius: '8px' }))
  .states({ primary: { backgroundColor: '#2563eb' }, danger: { backgroundColor: '#dc2626' } })
  .sizes({ medium: { padding: '12px' }, large: { padding: '16px' } })
function App() { return (RENDER) }`
const render = (jsx: string) => BTN.replace('RENDER', jsx)

describe('rocketstyle native resolution — emit', () => {
  it('resolves base ∪ state ∪ size with the cascade (dims override base), Swift', () => {
    const { code } = swift(render(`<Btn state="primary" size="large"><Text>x</Text></Btn>`))
    // <Btn> → VStack (the Stack base), NOT an unresolved Btn(…).
    expect(code).toContain('VStack')
    expect(code).not.toMatch(/\bBtn\(/)
    // size=large's padding(16) OVERRODE the base padding(8px 16px).
    expect(code).toContain('.padding(16)')
    // state=primary background + base cornerRadius.
    expect(code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
    expect(code).toContain('.cornerRadius(8)')
  })

  it('resolves on Compose', () => {
    const { code } = kotlin(render(`<Btn state="primary" size="large"><Text>x</Text></Btn>`))
    expect(code).toContain('Column(')
    expect(code).toContain('.padding(16.dp)')
    expect(code).toContain('.background(Color(0xFF2563EB))')
    expect(code).toContain('.clip(RoundedCornerShape(8.dp))')
  })

  it('a different dimension value resolves its own style (state="danger")', () => {
    const { code } = swift(render(`<Btn state="danger"><Text>x</Text></Btn>`))
    // danger red, base padding (8/16 vertical/horizontal), base radius.
    expect(code).toContain('.background(Color(.sRGB, red: 0.863, green: 0.149, blue: 0.149')
    expect(code).toContain('.padding(.vertical, 8).padding(.horizontal, 16)')
  })

  it('a dimension NOT set at the use-site falls to the base only', () => {
    // no state/size → just the base theme.
    const { code } = swift(render(`<Btn><Text>x</Text></Btn>`))
    expect(code).toContain('.padding(.vertical, 8).padding(.horizontal, 16)')
    expect(code).toContain('.cornerRadius(8)')
    expect(code).not.toContain('.background(') // no state → no background
  })

  it('warns + does NOT lower rocketstyle over a NON-canonical base', () => {
    const src = `import { Stack } from '@pyreon/primitives'
const Card = rocketstyle()({ name: 'Card', component: SomeWebComp }).states({ a: { backgroundColor: '#000000' } })
function App() { return (<Stack><Card/></Stack>) }`
    expect(transform(src, { target: 'swift' }).warnings.join('\n')).toMatch(
      /only a CANONICAL @pyreon\/primitives base/,
    )
  })

  it('RESOLVES a theme-token dimension value; warns on an unknown token', () => {
    const known = `import { Stack, Text } from '@pyreon/primitives'
const B = rocketstyle()({ name: 'B', component: Stack }).states({ primary: { backgroundColor: t.color.primary } })
function App() { return (<B state="primary"><Text>x</Text></B>) }`
    const kr = swift(known)
    expect(kr.code).toContain('.background(Color(.sRGB, red: 0.145, green: 0.388, blue: 0.922')
    expect(kr.warnings.join('\n')).not.toMatch(/not yet lowered/)

    const unknown = `import { Stack, Text } from '@pyreon/primitives'
const B = rocketstyle()({ name: 'B', component: Stack }).states({ primary: { backgroundColor: t.color.doesNotExist } })
function App() { return (<B state="primary"><Text>x</Text></B>) }`
    expect(swift(unknown).warnings.join('\n')).toMatch(/theme\s+token \/ expression.*not yet lowered/)
  })
})

describe('rocketstyle native — toolchain gates', () => {
  const SRC = render(`<Btn state="primary" size="large"><Text>Click</Text></Btn>`)
  it.skipIf(!isSwiftUIAvailable())('the resolved rocketstyle component typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(SRC).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the resolved rocketstyle component compiles (Compose stubs)', () => {
    const res = validateKotlin(kotlin(SRC).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
