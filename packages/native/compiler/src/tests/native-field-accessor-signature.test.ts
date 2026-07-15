// `<Field>` lowers to a native TextField (SwiftUI) / Compose TextField. Three
// shapes were emitting uncompilable native code because an accessor arrow
// (`() => x()`) reached the value/placeholder emit un-unwrapped, and because the
// Kotlin controlled-field path only accepted `onChangeText` (not web `onChange`):
//
//   1. `<Field value={draft} placeholder={() => hint()} onChangeText={…} />`
//      → Swift `TextField({ hint }, …)` / Kotlin `placeholder = { Text({ hint }) }`
//      — a closure where the title/placeholder wants a String (compile error).
//   2. `<Field value={() => v()} onChange={…} />`
//      → Swift `Binding(get: { { v } }, …)` (double closure — get returns
//      `() -> String`, not `String`).
//   3. `<Field value={draft} onChange={…} />` on Kotlin — the controlled path
//      matched only `changetext`, so web `onChange` fell to a literal
//      `Field(...)` (unresolved) — compiled a controlled TextField on iOS but
//      broke on Android from ONE shared source.
//
// Fix: unwrap the accessor arrow in the placeholder + controlled-value emit
// (both backends) and accept `change` as well as `changetext` on Kotlin (Swift
// already did). The existing locked tests use the CALL forms (`value={draft()}`,
// `placeholder={hint()}`) which already worked; these lock the ARROW + web-
// `onChange` shapes.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (jsx: string) => `import { Stack, Field } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const draft = signal('')
  const hint = signal('Name')
  return (<Stack>${jsx}</Stack>)
}`

const swift = (jsx: string) => transform(app(jsx), { target: 'swift' }).code
const kotlin = (jsx: string) => transform(app(jsx), { target: 'kotlin' }).code
const fieldLine = (code: string) =>
  code.split('\n').find((l) => /TextField|Binding|Field\(/.test(l)) ?? ''

describe('<Field> accessor-arrow value/placeholder + Kotlin onChange parity', () => {
  it('accessor placeholder lowers to the value, not a closure', () => {
    const jsx = '<Field value={draft} placeholder={() => hint()} onChangeText={(v) => draft.set(v)} />'
    expect(fieldLine(swift(jsx))).toContain('TextField(hint, text: $draft)')
    expect(fieldLine(swift(jsx))).not.toMatch(/\{ hint \}/)
    expect(kotlin(jsx)).toContain('placeholder = { Text(hint) }')
    expect(kotlin(jsx)).not.toMatch(/Text\(\{ hint \}\)/)
  })

  it('accessor value (controlled) lowers to a single-read Binding, not a double closure', () => {
    const jsx = '<Field value={() => draft()} onChange={(v) => draft.set(v)} />'
    const sw = swift(jsx)
    expect(sw).toContain('Binding(')
    expect(sw).toMatch(/get: \{ draft \}/)
    expect(sw).not.toMatch(/get: \{ \{ draft \} \}/)
    // Kotlin: web onChange must reach the controlled TextField (parity fix).
    // `\bField\(` matches a standalone literal `Field(` but NOT `TextField(`
    // (no word boundary between `Text` and `Field`).
    expect(kotlin(jsx)).toContain('TextField(value = draft')
    expect(kotlin(jsx)).not.toMatch(/\bField\(/)
  })

  it('web onChange reaches the Kotlin controlled TextField (was a literal Field on Android)', () => {
    // A CALL-form value (`draft()`, not the bare signal `draft`) routes through
    // the CONTROLLED path, where the onChange-name match is load-bearing: without
    // the `change` alias, Kotlin fell to a literal `Field(...)`. (A bare-signal
    // value is handled by a separate path regardless of the handler name, so it
    // would NOT isolate this fix.)
    const jsx = '<Field value={draft()} onChange={(v) => draft.set(v)} />'
    expect(kotlin(jsx)).toContain('TextField(value = draft, onValueChange =')
    expect(kotlin(jsx)).not.toMatch(/\bField\(/)
    // Swift already accepted `change` — a control that this shape lowers there too
    expect(swift(jsx)).toContain('Binding(')
  })

  it('call forms are unchanged (no regression vs the locked tests)', () => {
    const jsx = '<Field value={draft} placeholder={hint()} onChangeText={(v) => draft.set(v)} />'
    expect(fieldLine(swift(jsx))).toContain('TextField(hint, text: $draft)')
    expect(kotlin(jsx)).toContain('placeholder = { Text(hint) }')
  })

  // Compile-PROOF on the real toolchains (both present locally; skip-gated in CI
  // cells that lack them, run in the Validate emitted Swift+Kotlin job).
  it.skipIf(!isSwiftcAvailable())('Swift: the fixed Field shapes type-check against the stub', () => {
    for (const jsx of [
      '<Field value={draft} placeholder={() => hint()} onChangeText={(v) => draft.set(v)} />',
      '<Field value={() => draft()} onChange={(v) => draft.set(v)} />',
    ]) {
      const res = validateSwiftWithStubs(swift(jsx))
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: the fixed Field shapes compile on kotlinc', () => {
    for (const jsx of [
      '<Field value={draft} placeholder={() => hint()} onChangeText={(v) => draft.set(v)} />',
      '<Field value={draft} onChange={(v) => draft.set(v)} />',
    ]) {
      const res = validateKotlin(kotlin(jsx))
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })
})
