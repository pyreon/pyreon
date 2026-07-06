// `<Field placeholder>` — dynamic (signal / ternary) lowering.
//
// Pre-fix the canonical `<Field>` emit read `placeholder` via
// readStaticAttr / readStaticAttrKotlin (STATIC-only), so a dynamic
// `placeholder={hint()}` (a reactive hint that changes with state — e.g. a
// validation prompt) was SILENTLY DROPPED: Swift fell back to `""`, Kotlin
// omitted the `placeholder =` arg entirely. The input renders no placeholder
// with zero warnings — the same silent-drop class as Icon color (#2032),
// Image dims (#2042), and Field/Toggle disabled (#2044).
//
// UNLIKE the compile-time token props (color / align / level — a fully-dynamic
// value can't map to a token so it WARNS), a placeholder is a RUNTIME String:
// SwiftUI's `TextField(_:text:)` accepts a LocalizedStringKey (literal) OR a
// StringProtocol (runtime String); Compose's `Text(text: String)` takes any
// runtime String. So ANY dynamic value lowers to the raw expression (Swift
// `TextField(hint, …)`, Compose `Text(hint)`) — no warning, ternary AND
// signal-read both lower (mirrors the Image-dims runtime-numeric path).
//
// Bisect-verified by reverting swiftFieldPlaceholder / kotlinFieldPlaceholder
// to the readStatic-only form — every dynamic assertion below fails (the
// placeholder drops to `""` / is omitted).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const APP = `
import { signal } from '@pyreon/reactivity'
import { Stack, Field } from '@pyreon/primitives'
export function App() {
  const draft = signal<string>('')
  const hint = signal<string>('type here')
  const compact = signal<boolean>(false)
  return (
    <Stack>
      <Field value={draft} placeholder="Static hint" />
      <Field value={draft} placeholder={hint()} />
      <Field value={draft} placeholder={compact() ? "short" : "a longer placeholder"} />
    </Stack>
  )
}`

describe('Field dynamic placeholder — runtime-string lowering (signal + ternary), static byte-identical', () => {
  it('Swift: dynamic placeholder lowers to the bare expr; static keeps its quoted literal', () => {
    const out = transform(APP, { target: 'swift' }).code
    // static → quoted literal, byte-identical to the pre-fix shape
    expect(out).toContain('TextField("Static hint", text: $draft)')
    // dynamic signal read → bare identifier (Swift @Observable, no `.value`)
    expect(out).toContain('TextField(hint, text: $draft)')
    // ternary of two literals → a native String conditional
    expect(out).toContain('TextField(compact ? "short" : "a longer placeholder", text: $draft)')
  })

  it('Kotlin: dynamic placeholder lowers to Text(<expr>); static keeps Text("literal")', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('placeholder = { Text("Static hint") }')
    expect(out).toContain('placeholder = { Text(hint) }')
    expect(out).toContain('placeholder = { Text(if (compact) "short" else "a longer placeholder") }')
  })

  it('no warnings on either target — a placeholder is a runtime String, never a compile-time token', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(APP, { target }).warnings ?? []).toHaveLength(0)
    }
  })

  // Compile proof — the dynamic-placeholder emit typechecks end-to-end.
  it.skipIf(!isSwiftUIAvailable())('iOS: the dynamic-placeholder Field TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
