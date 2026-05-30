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
import { transform } from '../index'

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
