// Round-1 audit fix — `<Button disabled={...}>` emit.
//
// Pre-fix: the `disabled` attr was SILENTLY DROPPED on both targets.
// `<Button disabled={true} onPress={...}>` emitted the same code as
// `<Button onPress={...}>` — the button stayed enabled and clickable.
//
// Post-fix:
//   - Swift: appends a `.disabled(<bool-expr>)` modifier (the SwiftUI
//     idiom; `Button` has no `disabled:` init param).
//   - Kotlin: adds an `enabled = <inverse-bool>` constructor arg
//     (Compose's `Button(enabled = …)`; default is true).
//
// Both targets handle three shapes:
//   1. `disabled={true}` — emits the modifier/arg unconditionally.
//   2. `disabled` (bool-shorthand) — parses as literal `true`, same as #1.
//   3. `disabled={signalOrExpr}` — emits the expression read, negated
//      on Kotlin (Pyreon's `disabled` is INVERSE of Compose's `enabled`).
//   4. `disabled={false}` or absent — emits NO modifier/arg (default-enabled).
//
// Bisect-verified by reverting `swiftDisabledModifier` / `kotlinEnabledArg`
// helpers — every literal-true assertion below fails.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

describe('Round-1 audit fix — <Button disabled={...}> emit (Swift + Kotlin)', () => {
  describe('Swift — .disabled(<bool-expr>) modifier appended', () => {
    it('disabled={true} appends .disabled(true)', () => {
      const out = transform(
        `export function App() { return <Button disabled={true} onPress={() => {}}>Save</Button> }`,
        { target: 'swift' },
      ).code
      expect(out).toContain('Button("Save")')
      expect(out).toMatch(/Button\("Save"\)[\s\S]*?\.disabled\(true\)/)
    })

    it('disabled (bool-shorthand) parses as true → .disabled(true)', () => {
      const out = transform(
        `export function App() { return <Button disabled onPress={() => {}}>Save</Button> }`,
        { target: 'swift' },
      ).code
      expect(out).toMatch(/\.disabled\(true\)/)
    })

    it('disabled={false} emits NO modifier (default-enabled)', () => {
      const out = transform(
        `export function App() { return <Button disabled={false} onPress={() => {}}>Save</Button> }`,
        { target: 'swift' },
      ).code
      expect(out).not.toMatch(/\.disabled\(/)
    })

    it('absent disabled — baseline, no modifier', () => {
      const out = transform(
        `export function App() { return <Button onPress={() => {}}>Save</Button> }`,
        { target: 'swift' },
      ).code
      expect(out).not.toMatch(/\.disabled\(/)
    })

    it('disabled={signal} emits .disabled(<signal-read>)', () => {
      const out = transform(
        `
        import { signal } from '@pyreon/reactivity'
        export function App() {
          const isLoading = signal(false)
          return <Button disabled={isLoading} onPress={() => {}}>Save</Button>
        }
        `,
        { target: 'swift' },
      ).code
      // Signal-bound reads in modifier scope match what Show/Transition use
      // (plain identifier on Swift @Observable — no `.value` needed).
      expect(out).toContain('.disabled(isLoading)')
    })
  })

  describe('Kotlin — Button(..., enabled = <inverse-bool>) arg added', () => {
    it('disabled={true} adds enabled = false', () => {
      const out = transform(
        `export function App() { return <Button disabled={true} onPress={() => {}}>Save</Button> }`,
        { target: 'kotlin' },
      ).code
      // Post-#1090: empty `() => {}` body emits `{ }` not `{ "" }`.
      expect(out).toContain('Button(onClick = { }, enabled = false)')
    })

    it('disabled (bool-shorthand) parses as true → enabled = false', () => {
      const out = transform(
        `export function App() { return <Button disabled onPress={() => {}}>Save</Button> }`,
        { target: 'kotlin' },
      ).code
      expect(out).toContain('enabled = false')
    })

    it('disabled={false} emits NO enabled arg (default-enabled)', () => {
      const out = transform(
        `export function App() { return <Button disabled={false} onPress={() => {}}>Save</Button> }`,
        { target: 'kotlin' },
      ).code
      expect(out).not.toContain('enabled = ')
    })

    it('absent disabled — baseline, no enabled arg', () => {
      const out = transform(
        `export function App() { return <Button onPress={() => {}}>Save</Button> }`,
        { target: 'kotlin' },
      ).code
      expect(out).not.toContain('enabled = ')
    })

    it('disabled={signal} emits enabled = !<signal-read> (Compose inverse-of-disabled semantic)', () => {
      const out = transform(
        `
        import { signal } from '@pyreon/reactivity'
        export function App() {
          const isLoading = signal(false)
          return <Button disabled={isLoading} onPress={() => {}}>Save</Button>
        }
        `,
        { target: 'kotlin' },
      ).code
      // Pyreon's `disabled` = Compose's `!enabled`. Signal-bound case
      // negates the expression. Kotlin emits `var x by remember {
      // mutableStateOf(...) }` so signal reads are BARE (the `by`
      // delegate unwraps — no `.value` projection needed in this
      // context; that's distinct from the form/fetch field-read paths
      // which DO use MutableState directly and require `.value`).
      expect(out).toContain('enabled = !isLoading')
      expect(out).not.toContain('enabled = !isLoading.value')
    })
  })
})

// The SAME disabled handling now extends to <Field> + <Toggle>. Pre-fix ONLY
// Button used the shared `swiftDisabledModifier` / `kotlinEnabledArg` helper;
// Field + Toggle read `disabled` via readStaticAttr (static-only), so a DYNAMIC
// `disabled={busy()}` (disable a form control during submit/loading — a very
// common shape) was SILENTLY DROPPED on both targets. All three primitives now
// route through the shared helper.
describe('dynamic disabled extends to <Field> + <Toggle> (were static-only)', () => {
  const FIELD = `
import { signal } from '@pyreon/reactivity'
import { Stack, Field } from '@pyreon/primitives'
export function App() {
  const v = signal<string>('')
  const busy = signal<boolean>(false)
  return <Stack><Field value={v} disabled={busy()} /></Stack>
}`
  const TOGGLE = `
import { signal } from '@pyreon/reactivity'
import { Stack, Toggle } from '@pyreon/primitives'
export function App() {
  const on = signal<boolean>(false)
  const busy = signal<boolean>(false)
  return <Stack><Toggle value={on} disabled={busy()} /></Stack>
}`

  it('Swift: dynamic disabled lowers to .disabled(busy) on Field + Toggle', () => {
    expect(transform(FIELD, { target: 'swift' }).code).toContain('.disabled(busy)')
    expect(transform(TOGGLE, { target: 'swift' }).code).toContain('.disabled(busy)')
  })
  it('Kotlin: dynamic disabled lowers to enabled = !busy on Field + Toggle', () => {
    expect(transform(FIELD, { target: 'kotlin' }).code).toContain('enabled = !busy')
    expect(transform(TOGGLE, { target: 'kotlin' }).code).toContain('enabled = !busy')
  })
  it('static disabled stays byte-identical (Field + Toggle, both targets)', () => {
    const sf = FIELD.replace('disabled={busy()}', 'disabled={true}')
    const st = TOGGLE.replace('disabled={busy()}', 'disabled={true}')
    expect(transform(sf, { target: 'swift' }).code).toContain('.disabled(true)')
    expect(transform(sf, { target: 'kotlin' }).code).toContain('enabled = false')
    expect(transform(st, { target: 'swift' }).code).toContain('.disabled(true)')
    expect(transform(st, { target: 'kotlin' }).code).toContain('enabled = false')
  })

  // Compile proof — the runtime-bool disabled emit typechecks end-to-end.
  it.skipIf(!isSwiftUIAvailable())('iOS: the dynamic-disabled Field + Toggle TYPECHECK against real SwiftUI', () => {
    expect(validateSwiftTypecheck(transform(FIELD, { target: 'swift' }).code).ok).toBe(true)
    expect(validateSwiftTypecheck(transform(TOGGLE, { target: 'swift' }).code).ok).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compile via kotlinc', () => {
    expect(validateKotlin(transform(FIELD, { target: 'kotlin' }).code).ok).toBe(true)
    expect(validateKotlin(transform(TOGGLE, { target: 'kotlin' }).code).ok).toBe(true)
  })
})

// `disabled={a() === b}` — an OPERATOR expression under Compose's `enabled = !…`
// inversion. `!` binds tighter than `==` / `&&` / `||` / `?:`, so the unwrapped
// form `enabled = !tab == ""` applies `!` to a String and kotlinc rejects it
// (`unresolved reference 'not' for operator '!'`). Swift never inverts, so the
// same source compiled on iOS and failed only on Android.
describe('disabled={<operator expression>} — Kotlin parenthesises the inversion', () => {
  const app = (disabled: string) => `
import { signal } from '@pyreon/reactivity'
import { Stack, Button, Field, Toggle, Press, Text } from '@pyreon/primitives'
export function App() {
  const tab = signal('')
  const busy = signal(false)
  const on = signal(false)
  const n = signal(0)
  return (
    <Stack>
      <Button onPress={() => tab.set('a')} disabled={${disabled}}>Go</Button>
      <Field value={tab} disabled={${disabled}} />
      <Toggle value={on} disabled={${disabled}} />
      <Press onPress={() => n.set(1)} disabled={${disabled}}><Text>p</Text></Press>
    </Stack>
  )
}`

  it.each([
    ["tab() === ''", 'enabled = !(tab == "")'],
    ['busy() || n() > 2', 'enabled = !(busy || n > 2L)'],
    ['!busy()', 'enabled = !(!busy)'],
  ])('disabled={%s} → %s on every primitive', (expr, expected) => {
    const code = transform(app(expr), { target: 'kotlin' }).code
    expect(code.split(expected).length - 1, code).toBe(4)
    // Swift needs no parens — `.disabled(…)` takes the expression whole.
    expect(transform(app(expr), { target: 'swift' }).code).not.toContain('.disabled((')
  })

  it('a bare signal read stays unparenthesised (byte-identical to before)', () => {
    expect(transform(app('busy()'), { target: 'kotlin' }).code).toContain('enabled = !busy')
    expect(transform(app('busy()'), { target: 'kotlin' }).code).not.toContain('enabled = !(busy)')
  })

  it.skipIf(!isKotlincAvailable())(
    'the operator forms compile with kotlinc',
    () => {
      for (const expr of ["tab() === ''", 'busy() || n() > 2']) {
        const res = validateKotlin(transform(app(expr), { target: 'kotlin' }).code)
        expect(res.ok, `${expr}: ${res.error ?? ''}`).toBe(true)
      }
    },
    180_000,
  )
})
