// Auth-rehydration arc — the natural session-rehydrate shape an author
// writes with the documented PyreonAuth ⊕ PyreonSecureStorage composition:
//
//   onMount(() => {
//     const token = secrets.read('session-user')
//     if (token) { auth.signInSucceeded({ name: token }) }
//   })
//
// Probe-found (real swiftc + kotlinc, not the emit alone): `secrets.read`
// returns `String?` on BOTH runtimes, but inference had no model for
// service METHOD RETURNS (`SERVICE_OPTIONAL_FIELDS` types member reads
// only) — so `token` seeded as unknown, `classifyOptionalCondition` never
// fired, and `if (token)` emitted a bare optional as the condition:
// swiftc "optional type 'String?' cannot be used as a boolean"; kotlinc
// "condition type mismatch" PLUS "argument type mismatch" on the body's
// `User(name = token)`. The fix is two-part and both parts are asserted:
//   1. `SERVICE_METHOD_RETURNS` types `secureStorage.read` → string|null.
//   2. Swift lowers the bare-identifier PRESENT condition to the BINDING
//      `if let token {` (nil-test alone leaves the body reading String?),
//      with the then-body emitted under the NARROWED local type. Kotlin
//      keeps `!= null` — smart cast narrows a val local by language rule.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { onMount } from '@pyreon/core'
import { useAuth, useSecureStorage } from '@pyreon/hooks'
import { Button, Stack, Text } from '@pyreon/primitives'

type User = { name: string }

export function App() {
  const auth = useAuth<User>()
  const secrets = useSecureStorage()
  onMount(() => {
    const token = secrets.read('session-user')
    if (token) {
      auth.signInSucceeded({ name: token })
    }
  })
  return (
    <Stack data-testid="auth-page">
      <Text>Auth: {auth.isAuthenticated ? 'in' : 'out'}</Text>
      <Button onPress={() => { secrets.write('session-user', 'vit'); auth.signInSucceeded({ name: 'vit' }) }}>In</Button>
      <Button onPress={() => { secrets.remove('session-user'); auth.signOut() }}>Out</Button>
    </Stack>
  )
}`

describe('session rehydrate — service method-return typing + optional-if lowering', () => {
  it('Swift: the token read lowers to an `if let` binding and the body uses the unwrapped value', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('if let token {')
    expect(out.code).toContain('auth.signInSucceeded(User(name: token))')
    // The broken emit — a bare optional as the condition.
    expect(out.code).not.toContain('if token {')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin: the token read lowers to a null-check (smart cast covers the body)', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('if (token != null) {')
    expect(out.code).toContain('auth.signInSucceeded(User(name = token))')
    expect(out.code).not.toContain('if (token) {')
    expect(out.warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
