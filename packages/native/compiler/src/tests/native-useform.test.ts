// Phase 4.2 — `useForm()` native emit. In its own test file (not
// canonical-primitives.test.ts) so it doesn't append-conflict with the
// in-flight router/data emit PRs that also extend that file.
//
// `const form = useForm({ initialValues })` → a PyreonForm reactive
// container seeded with the literal string defaults. Swift emits an
// `@State private var form = PyreonForm(initialValues: [...])`; Kotlin a
// `remember { PyreonForm(mapOf(...)) }`. Field reads map to @Observable
// properties (Swift) / Compose `MutableState` `.value` reads (Kotlin) —
// except `isValid`, a derived `Bool` getter that reads plainly on both.
// `onSubmit` / `validators` are web-only function logic and are ignored
// on native (submission flows through the container's begin/endSubmit API).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 4.2 — useForm() native emit', () => {
  it('Swift: @State PyreonForm seeded with literal initialValues', () => {
    const out = transform(
      `
      export function LoginForm() {
        const form = useForm({ initialValues: { email: 'a@b.com', password: '' } })
        return <Show when={() => form.isSubmitting}><Text>Saving</Text></Show>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain(
      '@State private var form = PyreonForm(initialValues: ["email": "a@b.com", "password": ""])',
    )
    // Swift field reads are plain @Observable property reads — no `.value`.
    expect(out).toContain('form.isSubmitting')
    expect(out).not.toContain('form.isSubmitting.value')
  })

  it('Kotlin: remember { PyreonForm(mapOf(...)) } seeded with initialValues', () => {
    const out = transform(
      `
      export function LoginForm() {
        const form = useForm({ initialValues: { email: 'a@b.com' } })
        return <Show when={() => form.isSubmitting}><Text>Saving</Text></Show>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val form = remember { PyreonForm(initialValues = mapOf("email" to "a@b.com")) }')
  })

  it('Kotlin: MutableState field reads append .value (isSubmitting / values / errors)', () => {
    const out = transform(
      `
      export function StatusForm() {
        const form = useForm()
        return <Show when={() => form.isSubmitting}><Text>busy</Text></Show>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('form.isSubmitting.value')
  })

  it('Kotlin: isValid is a derived getter — read WITHOUT .value', () => {
    const out = transform(
      `
      export function ValidGate() {
        const form = useForm()
        return <Show when={() => form.isValid}><Text>ok</Text></Show>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('form.isValid')
    expect(out).not.toContain('form.isValid.value')
  })

  it('bare useForm() emits a default-constructed container (no seed args)', () => {
    const swift = transform(
      `export function Blank() { const form = useForm(); return <Text>x</Text> }`,
      { target: 'swift' },
    ).code
    expect(swift).toContain('@State private var form = PyreonForm()')

    const kotlin = transform(
      `export function Blank() { const form = useForm(); return <Text>x</Text> }`,
      { target: 'kotlin' },
    ).code
    expect(kotlin).toContain('val form = remember { PyreonForm() }')
  })

  it('non-string initialValues entries are dropped (PyreonForm is [String: String])', () => {
    const out = transform(
      `
      export function Mixed() {
        const form = useForm({ initialValues: { name: 'Ada', age: 30, active: true } })
        return <Text>x</Text>
      }
      `,
      { target: 'swift' },
    ).code
    // Only the string-valued entry survives; numeric / boolean defaults drop.
    expect(out).toContain('PyreonForm(initialValues: ["name": "Ada"])')
    expect(out).not.toContain('30')
    expect(out).not.toContain('active')
  })
})
