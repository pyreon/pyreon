// `<Toggle value={…} onChange={…}>` lowers to a SwiftUI `Toggle(_, isOn:)` /
// Compose `Switch(checked=, onCheckedChange=)`. The canonical prop is `value`
// (not `checked`); the value-is-a-bare-signal + value-is-a-member shapes already
// worked. The ACCESSOR-value shape `value={() => on()}` reached the controlled
// emit un-unwrapped, so it produced a closure/lambda where a Bool is expected —
// the same class as the <Field> value fix:
//
//   Swift  → Toggle("", isOn: Binding(get: { { on } }, …))  — DOUBLE closure
//            (the get returns `() -> Bool`, not `Bool`).
//   Kotlin → Switch(checked = { on }, …)                    — a `() -> Boolean`
//            where a `Boolean` is expected.
//
// Fix: unwrap the accessor arrow in the Toggle controlled-value emit (both
// backends). Mirrors the Field fix; `unwrapAccessorArrow` already existed.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (jsx: string) => `import { Stack, Toggle } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const on = signal(true)
  return (<Stack>${jsx}</Stack>)
}`
const swift = (jsx: string) => transform(app(jsx), { target: 'swift' }).code
const kotlin = (jsx: string) => transform(app(jsx), { target: 'kotlin' }).code

describe('<Toggle> accessor-value unwrap (SwiftUI isOn / Compose Switch)', () => {
  it('accessor value lowers to a single-read Binding / bare checked, not a closure', () => {
    const jsx = '<Toggle value={() => on()} onChange={(v) => on.set(v)} />'
    const sw = swift(jsx)
    expect(sw).toContain('isOn: Binding(')
    expect(sw).toMatch(/get: \{ on \}/)
    expect(sw).not.toMatch(/get: \{ \{ on \} \}/)
    const kt = kotlin(jsx)
    expect(kt).toContain('Switch(checked = on, onCheckedChange =')
    expect(kt).not.toMatch(/checked = \{ on \}/)
  })

  it('bare-signal value is unchanged (no regression)', () => {
    const jsx = '<Toggle value={on} onChange={(v) => on.set(v)} />'
    expect(swift(jsx)).toContain('Toggle("", isOn: $on)')
    expect(kotlin(jsx)).toContain('Switch(checked = on, onCheckedChange =')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: accessor Toggle type-checks against the stub', () => {
    const res = validateSwiftWithStubs(swift('<Toggle value={() => on()} onChange={(v) => on.set(v)} />'))
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: accessor Toggle compiles on kotlinc', () => {
    const res = validateKotlin(kotlin('<Toggle value={() => on()} onChange={(v) => on.set(v)} />'))
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
