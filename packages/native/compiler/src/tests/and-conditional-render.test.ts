// Gap fix — `{cond && <JSX/>}` conditional render (the dominant React/Solid
// idiom) used to emit a raw `cond && View` — a type error in a SwiftUI
// `@ViewBuilder` (`Bool && View`) and a Compose `@Composable` block
// (`Boolean && Unit`). Both targets now lower it to the SAME `if (cond) {
// view }` form `<Show>` emits. Parens are seen through so
// `{cond && (a ? <X/> : <Y/>)}` lowers too. Value-only `&&` (no view on
// the RHS) is unchanged (stringified into a Text interpolation as before).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function C() {
  const v = signal(true)
  const n = signal(0)
  return (<Stack>
    {v() && <Text>shown</Text>}
    {n() > 0 && <Text>positive</Text>}
    {v() && (n() > 5 ? <Text>big</Text> : <Text>small</Text>)}
    <Text>always</Text>
  </Stack>)
}`

describe('`{cond && <JSX/>}` conditional render → `if cond { view }`', () => {
  it('Swift: lowers to `if cond { view }`, never raw `Bool && View`', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('if v {')
    expect(out).toContain('Text("shown")')
    expect(out).toContain('if n > 0 {')
    // The whole point: no raw `&&` of a view survives.
    expect(out).not.toContain('v && Text')
    expect(out).not.toContain('&& Text("shown")')
    // Nested paren-ternary lowers under the `if` (not stringified).
    expect(out).not.toContain('Text("\\(v &&')
    expect(out).toContain('n > 5 ? Text("big") : Text("small")')
  })

  it('Kotlin: lowers to `if (cond) { view }`, never raw `Boolean && Unit`', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('if (v) {')
    expect(out).toContain('Text(text = "shown")')
    expect(out).toContain('if (n > 0) {')
    expect(out).not.toContain('v && Text')
    expect(out).not.toContain('&& Text(text = "shown")')
    expect(out).not.toContain('"${v &&')
  })

  it('value-only `&&` (no view RHS) is unchanged — still a value child', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function C() {
  const a = signal('x')
  const b = signal('y')
  return (<Stack><Text>{a() && b()}</Text></Stack>)
}`
    const sw = transform(src, { target: 'swift' }).code
    // No `if` lowering for a value-only && — it's a Text child expression.
    expect(sw).not.toMatch(/if a \{/)
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
