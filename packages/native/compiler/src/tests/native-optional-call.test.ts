// Optional CALL `fn?.()` — the last optional-chaining shape to lower.
//
// Optional MEMBER (`a?.b`) and optional INDEX (`a?.[i]`) already lower
// (native-optional-chaining / native-optional-index). Optional CALL — invoking
// a function-typed field/prop only when it is non-nil — used to warn-fall-back
// (the located "index/call" diagnostic). It now lowers faithfully:
//
//   Swift  → `fn?(args)`         (optional-call syntax; the optional-function
//                                 field type `(() -> Void)?` already
//                                 parenthesizes, so `fn?()` is valid)
//   Kotlin → `fn?.invoke(args)`  (nullable functional type — `?.invoke` is the
//                                 only way to call it; a bare `fn()` is a type
//                                 error on a nullable `(() -> Unit)?`)
//
// The callee is a MEMBER (a function-typed prop/field), so the Swift emit
// short-circuits in the generic MEMBER-call branch BEFORE the bare-identifier
// tail — that branch dropped the `?` (emitting `onDone()` / `fmt(5)`, which
// invokes a nil closure at runtime). The fix mirrors the tail's optional-call
// lowering in the member branch. Kotlin routes both callee shapes through one
// tail, so it was already correct — this locks the Swift parity.
//
// Bisect-load-bearing: (1) drop the Swift member-branch optional check →
// `onDone?()`/`fmt?(5)` specs fail with the `?` missing; (2) drop the Kotlin
// generic-tail optional check → the `?.invoke` specs fail; (3) neuter the
// parse `optional` threading → both targets warn ("index/call") + drop the `?`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

// A function-typed OPTIONAL prop invoked from a Button handler.
const HANDLER = `import { Stack, Button } from '@pyreon/primitives'
type P = { onDone?: () => void }
export function Card(props: P) {
  return <Stack gap="sm"><Button onPress={() => props.onDone?.()}>go</Button></Stack>
}`

// A function-typed OPTIONAL prop invoked (with an arg) as a computed value.
const VALUE = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type P = { fmt?: (n: number) => string }
export function Card(props: P) {
  const label = computed(() => props.fmt?.(5) ?? "none")
  return <Stack gap="sm"><Text>{label()}</Text></Stack>
}`

describe('optional CALL `fn?.()` — lowers on both targets (the last optional shape)', () => {
  it('Swift: `props.onDone?.()` in a handler → `onDone?()` (member-call branch carries the `?`)', () => {
    const rs = transform(HANDLER, { target: 'swift' })
    expect(rs.code).toContain('onDone?()')
    expect(rs.code).not.toContain('{ onDone() }')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: the same handler → `onDone?.invoke()`', () => {
    const rk = transform(HANDLER, { target: 'kotlin' })
    expect(rk.code).toContain('onDone?.invoke()')
    expect(rk.warnings).toHaveLength(0)
  })
  it('Swift: `props.fmt?.(5)` as a value → `fmt?(5)` (arg threaded through the `?`)', () => {
    const rs = transform(VALUE, { target: 'swift' })
    expect(rs.code).toContain('fmt?(5)')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: the same value → `fmt?.invoke(5)`', () => {
    const rk = transform(VALUE, { target: 'kotlin' })
    expect(rk.code).toContain('fmt?.invoke(5)')
    expect(rk.warnings).toHaveLength(0)
  })
  it('neither target emits the old "index/call" warn-fallback for optional call', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      for (const src of [HANDLER, VALUE]) {
        const r = transform(src, { target })
        expect(r.warnings.some((w) => w.includes('index/call'))).toBe(false)
      }
    }
  })

  // Compile proofs — the lowered optional-call typechecks end-to-end.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the optional-call handler + value TYPECHECK against real SwiftUI',
    () => {
      const rh = validateSwiftTypecheck(transform(HANDLER, { target: 'swift' }).code)
      expect(rh.ok, rh.error ?? '').toBe(true)
      const rv = validateSwiftTypecheck(transform(VALUE, { target: 'swift' }).code)
      expect(rv.ok, rv.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const rh = validateKotlin(transform(HANDLER, { target: 'kotlin' }).code)
    expect(rh.ok, rh.error ?? '').toBe(true)
    const rv = validateKotlin(transform(VALUE, { target: 'kotlin' }).code)
    expect(rv.ok, rv.error ?? '').toBe(true)
  })
})
