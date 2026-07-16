// M4.5 — async-await lowering (`await hook.method()` in an `async` handler) +
// M3.5 — the first async-result service `useBiometrics` that exercises it.
//
// THE LOWERING. A synchronous event-handler slot (`() -> Void` on iOS,
// `() -> Unit` on Android) can't `await`. So an `async () => { … await … }`
// handler is wrapped in an async scope:
//   Swift:  Button("X") { Task { let ok = await bio.authenticate("r"); … } }
//   Kotlin: onClick = { pyreonAsyncScope.launch { val ok = bio.authenticate("r"); … } }
//           + a composable-top `val pyreonAsyncScope = rememberCoroutineScope()`.
// A Kotlin suspend call carries NO `await` keyword (the coroutine provides the
// context); Swift keeps `await`.
//
// This spec locks the emit SHAPE (the bisect target) AND compiles the emit on
// both real toolchains (swiftc against SwiftUI+PyreonBiometrics stubs, kotlinc
// against the Compose+coroutine stubs) — the "prove it COMPILES, don't just
// string-match" gate (an uncompilable-but-plausible async emit is exactly the
// class the -typecheck gate exists to catch).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// A biometric gate awaited from an async handler — the canonical shape.
const SRC = `import { signal } from '@pyreon/reactivity'
import { useBiometrics } from '@pyreon/hooks'
export function Unlock() {
  const bio = useBiometrics()
  const status = signal('idle')
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={async () => { const ok = await bio.authenticate('Unlock'); status.set(ok ? 'unlocked' : 'denied') }}>Unlock</Button>
    </VStack>
  )
}`

// A single-expression async handler — the `body`-path (vs the `stmts`-path above).
const SRC_SINGLE = `import { useBiometrics } from '@pyreon/hooks'
export function Gate() {
  const bio = useBiometrics()
  return <Button onPress={async () => await bio.authenticate('Gate')}>Go</Button>
}`

// A plain (non-async) handler — the regression guard: it must NOT be wrapped.
const SRC_SYNC = `import { signal } from '@pyreon/reactivity'
export function Plain() {
  const n = signal(0)
  return <Button onPress={() => { n.set(n() + 1) }}>Inc</Button>
}`

describe('M4.5 async-await lowering — Swift', () => {
  it('wraps an async handler body in Task { … } and keeps the await', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Button("Unlock") {')
    expect(out).toContain('Task {')
    expect(out).toContain('let ok = await bio.authenticate("Unlock")')
    // The post-await statement runs INSIDE the Task.
    expect(out).toContain('status = ok ? "unlocked" : "denied"')
  })

  it('single-expression async handler still gets a Task { … } scope', () => {
    const out = transform(SRC_SINGLE, { target: 'swift' }).code
    expect(out).toContain('Task { await bio.authenticate("Gate") }')
  })

  it('a SYNC handler is NOT wrapped in a Task (no false-positive async)', () => {
    const out = transform(SRC_SYNC, { target: 'swift' }).code
    expect(out).not.toContain('Task {')
  })

  it('emits @State private var bio = PyreonBiometrics()', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var bio = PyreonBiometrics()')
  })

  it('emits ZERO warnings', () => {
    expect(transform(SRC, { target: 'swift' }).warnings ?? []).toEqual([])
  })
})

describe('M4.5 async-await lowering — Kotlin', () => {
  it('wraps an async handler in pyreonAsyncScope.launch { … } + hoists the scope', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val pyreonAsyncScope = rememberCoroutineScope()')
    expect(out).toContain('pyreonAsyncScope.launch {')
    // Kotlin suspend calls carry NO `await` keyword.
    expect(out).toContain('val ok = bio.authenticate("Unlock")')
    expect(out).not.toContain('await')
  })

  it('single-expression async handler still gets a launch { … } scope', () => {
    const out = transform(SRC_SINGLE, { target: 'kotlin' }).code
    expect(out).toContain('pyreonAsyncScope.launch { bio.authenticate("Gate") }')
  })

  it('a SYNC handler is NOT wrapped in launch, and no scope is hoisted', () => {
    const out = transform(SRC_SYNC, { target: 'kotlin' }).code
    expect(out).not.toContain('.launch {')
    expect(out).not.toContain('rememberCoroutineScope()')
  })

  it('emits remember { PyreonBiometrics() }', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val bio = remember { PyreonBiometrics() }')
  })

  it('emits ZERO warnings', () => {
    expect(transform(SRC, { target: 'kotlin' }).warnings ?? []).toEqual([])
  })
})

// The load-bearing "it COMPILES" gate — the async emit is well-formed Swift /
// Kotlin, not just plausible-looking text. Skips gracefully on a toolchain-less
// box (mirrors validate-swift-typecheck.test.ts).
describe.skipIf(!isSwiftcAvailable())('M4.5 async emit compiles (swiftc)', () => {
  it('the biometrics async fixture type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe.skipIf(!isKotlincAvailable())('M4.5 async emit compiles (kotlinc)', () => {
  it('the biometrics async fixture type-checks against the stubs', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
