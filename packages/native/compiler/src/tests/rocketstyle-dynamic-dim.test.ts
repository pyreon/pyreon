// `@pyreon/rocketstyle` native frontend — DYNAMIC dimension resolution.
//
// A `<Btn state={active() ? 'primary' : 'danger'}>` (a runtime dimension flip)
// resolves to a TERNARY of two style objects (base ∪ static-dims ∪ each branch's
// set), handed to the connector's dynamic path (`emitDynamic`) so each shared
// property lowers to a REACTIVE conditional-value modifier — the native
// equivalent of a runtime state flip. This is what makes native rocketstyle
// components reactive rather than static-only.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

// A signal-driven Btn with state (primary/danger) + size (small/large) dims.
const BTN = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .theme(() => ({ padding: '12px', borderRadius: '8px' }))
  .states({ primary: { backgroundColor: '#2563eb' }, danger: { backgroundColor: '#dc2626' } })
  .sizes({ small: { padding: '8px' }, large: { padding: '16px' } })
function App() {
  const active = signal(false)
  return (RENDER)
}`
const render = (jsx: string) => BTN.replace('RENDER', jsx)

describe('rocketstyle dynamic dimension — emit', () => {
  it('a dynamic state flip lowers to a conditional-value background (Swift)', () => {
    const { code, warnings } = swift(render(`<Btn state={active() ? 'primary' : 'danger'}><Text>x</Text></Btn>`))
    // The reactive state flip → a conditional background modifier.
    expect(code).toContain('.background(((active) ? Color(.sRGB, red: 0.145')
    expect(code).toContain(': Color(.sRGB, red: 0.863') // #dc2626 else-branch
    expect(warnings.join('\n')).not.toMatch(/dropped|not yet lowered/)
  })

  it('a dynamic state flip lowers to an if/else background (Kotlin)', () => {
    const { code } = kotlin(render(`<Btn state={active() ? 'primary' : 'danger'}><Text>x</Text></Btn>`))
    expect(code).toContain('.background((if (active) Color(0xFF2563EB) else Color(0xFFDC2626)))')
  })

  it('merges a STATIC dim into BOTH branches of the dynamic flip', () => {
    // size="large" (padding 16) is static → present in both branches; the theme
    // cornerRadius 8 likewise. Only backgroundColor differs by the dynamic flip.
    const { code } = swift(render(`<Btn state={active() ? 'primary' : 'danger'} size="large"><Text>x</Text></Btn>`))
    expect(code).toContain('.padding(((active) ? 16 : 16))') // static size in both
    expect(code).toContain('.cornerRadius(((active) ? 8 : 8))') // static theme in both
    expect(code).toContain('.background(((active) ?') // dynamic state flip
  })

  it('a static-only use-site still resolves to a plain (non-conditional) object', () => {
    const { code } = swift(render(`<Btn state="primary" size="large"><Text>x</Text></Btn>`))
    expect(code).toContain('.background(Color(.sRGB, red: 0.145') // no ternary
    expect(code).not.toContain('? Color')
  })

  it('warns + drops a ternary whose branches are not both declared dimension values', () => {
    const { warnings } = swift(render(`<Btn state={active() ? 'primary' : 'nope'}><Text>x</Text></Btn>`))
    expect(warnings.join('\n')).toMatch(/must be a ternary of TWO DECLARED state values/)
  })

  it('warns on ≥2 dynamic dims + falls back to the first branch (static)', () => {
    const { code, warnings } = swift(
      render(`<Btn state={active() ? 'primary' : 'danger'} size={active() ? 'small' : 'large'}><Text>x</Text></Btn>`),
    )
    expect(warnings.join('\n')).toMatch(/more than one dynamic dimension prop/)
    // Fallback: first branches (primary + small) resolved statically — no ternary.
    expect(code).toContain('.background(Color(.sRGB, red: 0.145') // primary, static
    expect(code).not.toContain('? Color')
  })
})

describe('rocketstyle dynamic dimension — toolchain gates', () => {
  const SRC = render(`<Btn state={active() ? 'primary' : 'danger'} size="large"><Text>Click</Text></Btn>`)
  it.skipIf(!isSwiftUIAvailable())('the reactive rocketstyle flip typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(swift(SRC).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the reactive rocketstyle flip compiles (real kotlinc)', () => {
    const res = validateKotlin(kotlin(SRC).code)
    expect(res.ok, res.error).toBe(true)
  })
})
