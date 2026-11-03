// `@pyreon/rocketstyle` native frontend — the PRESSED state (`active:` block).
//
// A rocketstyle theme's `active: { … }` used to fall into the generic
// "non-literal value, dropped" path, so a button with press feedback on the web
// had none on iOS or Android. It now resolves to a style ternary keyed on the
// reserved PRESSED_STATE_IDENT, and the Button / Press emitters bind that name
// to the platform's own press state:
//
//   iOS      `.buttonStyle(PyreonPressStyle { label, __pyPressed in label… })`
//            — `configuration.isPressed`, which clears on scroll-cancel and
//            needs no gesture of its own.
//   Android  `PyreonPressState { __pyPressed, __pySrc -> … }` — a hoisted
//            MutableInteractionSource handed to the clickable / Button, with
//            `collectIsPressedAsState()`.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const DEFS = `import { Press, Button, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const Chip = rocketstyle()({ name: 'Chip', component: Press })
  .theme(() => ({ padding: '8px', backgroundColor: '#e5e7eb', active: { backgroundColor: '#9ca3af' } }))
  .states({
    primary: { backgroundColor: '#2563eb', active: { backgroundColor: '#1d4ed8' } },
    danger: { backgroundColor: '#dc2626' },
  })
const Act = rocketstyle()({ name: 'Act', component: Button })
  .theme(() => ({ backgroundColor: '#e5e7eb', active: { opacity: 0.5 } }))
const Plain = rocketstyle()({ name: 'Plain', component: Press })
  .theme(() => ({ padding: '8px', backgroundColor: '#e5e7eb' }))`
const app = (jsx: string) =>
  `${DEFS}\nfunction App() {\n  const on = signal(false)\n  return (<Stack>${jsx}</Stack>)\n}`

const CHIP = `<Chip state="primary" onPress={() => {}} data-testid="chip"><Text>x</Text></Chip>`
const ACT = `<Act onPress={() => {}}>Go</Act>`

describe('pressed state — iOS', () => {
  it('binds the style inside a PyreonPressStyle; the identifier stays on the button', () => {
    const { code, warnings } = swift(app(CHIP))
    expect(code).toContain('.buttonStyle(PyreonPressStyle { label, __pyPressed in label')
    // The dimension's own active block wins over the base's while pressed.
    expect(code).toContain('((__pyPressed) ? Color(.sRGB, red: 0.114')
    expect(code).toContain(': Color(.sRGB, red: 0.145') // #2563eb un-pressed
    expect(code).toMatch(/\}\)\.accessibilityIdentifier\("chip"\)/)
    expect(code).not.toContain('.buttonStyle(.plain)')
    expect(warnings.join('\n')).not.toMatch(/dropped/)
  })

  it('a Button base takes the same ButtonStyle', () => {
    const { code } = swift(app(ACT))
    expect(code).toContain('Button("Go") { }.buttonStyle(PyreonPressStyle { label, __pyPressed in label')
  })
})

describe('pressed state — Android', () => {
  it('wraps the Press in PyreonPressState and hands the clickable its source', () => {
    const { code } = kotlin(app(CHIP))
    expect(code).toContain('PyreonPressState { __pyPressed, __pySrc ->')
    expect(code).toContain('if (__pyPressed) Color(0xFF1D4ED8) else Color(0xFF2563EB)')
    expect(code).toContain('.clickable(interactionSource = __pySrc, indication = null, onClick =')
  })

  it('a Button base receives the interaction source', () => {
    const { code } = kotlin(app(ACT))
    expect(code).toContain('PyreonPressState { __pyPressed, __pySrc ->')
    expect(code).toContain('interactionSource = __pySrc)')
  })
})

describe('pressed state — resolution', () => {
  it('a property set only while pressed flips back to its CSS initial value', () => {
    // Without the initial value the connector, which needs the property on both
    // sides, emitted the PRESSED value statically: the button was always 0.5.
    expect(swift(app(ACT)).code).toContain('.opacity(((__pyPressed) ? 0.5 : 1))')
    expect(kotlin(app(ACT)).code).toContain('.alpha((if (__pyPressed) 0.5f else 1f))')
  })

  it('a pressed-only property with no fixed initial value is dropped by name', () => {
    const src = app(`<Tint onPress={() => {}}><Text>t</Text></Tint>`).replace(
      'function App()',
      `const Tint = rocketstyle()({ name: 'Tint', component: Press })
  .theme(() => ({ padding: '8px', active: { color: '#ff0000' } }))
function App()`,
    )
    const { warnings } = swift(src)
    expect(warnings.join('\n')).toMatch(/'color' is set only in the active\/pressed style/)
  })

  it('a dynamic dimension nests the pressed ternary inside each branch', () => {
    const { code } = kotlin(
      app(`<Chip state={on() ? 'primary' : 'danger'} onPress={() => {}}><Text>x</Text></Chip>`),
    )
    // primary: its own active colour; danger: no active of its own, so the
    // base's active block applies.
    expect(code).toContain('if (__pyPressed) Color(0xFF1D4ED8) else Color(0xFF2563EB)')
    expect(code).toContain('if (__pyPressed) Color(0xFF9CA3AF) else Color(0xFFDC2626)')
  })

  it('a component without an active block emits exactly what it always did', () => {
    for (const t of ['swift', 'kotlin'] as const) {
      const { code } = transform(app(`<Plain onPress={() => {}}><Text>p</Text></Plain>`), {
        target: t,
      })
      expect(code).not.toMatch(/PyreonPress|__pyPressed/)
    }
  })

  it('hover / focus are named, not dropped as "non-literal"', () => {
    const src = DEFS.replace(
      "active: { opacity: 0.5 }",
      "active: { opacity: 0.5 }, hover: { opacity: 0.9 }",
    )
    const { warnings } = swift(`${src}\nfunction App() { return (<Act onPress={() => {}}>Go</Act>) }`)
    const w = warnings.join('\n')
    expect(w).toMatch(/the hover state style has no native lowering/)
    expect(w).not.toMatch(/non-literal value/)
  })

  it('an active block on a non-pressable base is dropped by name', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
const Card = rocketstyle()({ name: 'Card', component: Stack })
  .theme(() => ({ padding: '8px', active: { opacity: 0.5 } }))
function App() { return (<Card><Text>c</Text></Card>) }`
    const { code, warnings } = kotlin(src)
    expect(warnings.join('\n')).toMatch(/only lowers on a pressable base \(Button or Press\)/)
    expect(code).not.toMatch(/__pyPressed/)
  })
})

describe('pressed state — compiles', () => {
  const ALL = app(
    `${CHIP}${ACT}<Chip state={on() ? 'primary' : 'danger'} disabled={on()} onPress={() => {}} onLongPress={() => {}}><Text>y</Text></Chip>`,
  )

  it.skipIf(!isSwiftcAvailable())('the emitted Swift type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(swift(ALL).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const res = validateKotlin(kotlin(ALL).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
