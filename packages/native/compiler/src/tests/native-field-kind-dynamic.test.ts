// `<Field kind>` — dynamic (show/hide-password toggle) lowering.
//
// `kind="password"` renders a masked field (Swift `SecureField`, Compose
// `visualTransformation = PasswordVisualTransformation()`); any other kind
// renders plain. Pre-fix the canonical `<Field>` emit read `kind` STATIC-only,
// so the DYNAMIC show/hide-password toggle `kind={reveal() ? "text" :
// "password"}` — a ubiquitous form shape — SILENTLY fell back to the plain
// field on BOTH targets: the password rendered in CLEARTEXT regardless of the
// toggle. A SECURITY-relevant silent-drop (worse than a dropped modifier).
//
// UNLIKE Swift's other dynamic props, `kind` switches the VIEW TYPE
// (SecureField vs TextField are distinct types), so a bare ternary of the two
// won't typecheck ("mismatching types"). The branches are erased through
// `AnyView` so the conditional is one well-typed expression the modifier chain
// (`.disabled(…)`, layout) still binds to (parenthesised). Compose keeps ONE
// `TextField` and toggles the `visualTransformation` PARAMETER, so it lowers to
// a plain runtime `if`. A ternary of two literal kinds where one branch is
// "password" lowers; a fully-dynamic (non-ternary) kind → a NAMED warning.
//
// This ALSO closes a latent STATIC-password device-build bug: no example had
// used `kind="password"`, so `PasswordVisualTransformation` (in
// androidx.compose.ui.text.input, NOT the unconditional import set) shipped
// unimported — masked by the kotlinc validate stub. The CLI now conditionally
// imports it + `VisualTransformation` (see cli/build.ts + build.test.ts).
//
// Bisect-verified by reverting swiftFieldViewExpr / kotlinFieldVisualTransformation
// to the readStatic-only form — every dynamic assertion fails (the toggle
// collapses to a plain field).

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
  const reveal = signal<boolean>(false)
  const busy = signal<boolean>(false)
  return (
    <Stack>
      <Field value={draft} kind="password" placeholder="Password" />
      <Field value={draft} kind={reveal() ? "text" : "password"} placeholder="Password" disabled={busy()} />
    </Stack>
  )
}`

describe('Field dynamic kind — show/hide-password toggle (ternary), static byte-identical', () => {
  it('Swift: static password → SecureField; dynamic kind → an AnyView-erased conditional', () => {
    const out = transform(APP, { target: 'swift' }).code
    // static password → SecureField, byte-identical
    expect(out).toContain('SecureField("Password", text: $draft)')
    // dynamic toggle → AnyView(TextField) : AnyView(SecureField) — reveal true
    // shows the plain field, false masks it
    expect(out).toContain(
      '(reveal ? AnyView(TextField("Password", text: $draft)) : AnyView(SecureField("Password", text: $draft)))',
    )
    // the modifier chain binds to the parenthesised ternary
    expect(out).toMatch(/\)\)\)\s*\n?\s*\.disabled\(busy\)/)
  })

  it('Kotlin: static password → PasswordVisualTransformation(); dynamic → a runtime if', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('visualTransformation = PasswordVisualTransformation()')
    expect(out).toContain(
      'visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation()',
    )
  })

  it('no warnings for the supported (static + ternary) shapes', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(APP, { target }).warnings ?? []).toHaveLength(0)
    }
  })

  it('a fully-dynamic (non-ternary) kind warns NAMED on both targets (never silent)', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Field } from '@pyreon/primitives'
export function App() {
  const draft = signal<string>('')
  const k = signal<string>('password')
  return <Stack><Field value={draft} kind={k()} /></Stack>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect((out.warnings ?? []).some((w) => w.includes('<Field kind={…}>'))).toBe(true)
    }
  })

  // Compile proof — the dynamic-kind emit typechecks end-to-end (the AnyView
  // ternary on Swift; the VisualTransformation.None conditional on Kotlin, which
  // needs the stub's base-type fix + the CLI conditional import for the device).
  it.skipIf(!isSwiftUIAvailable())('iOS: the dynamic-kind Field TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
