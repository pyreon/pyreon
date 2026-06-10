// RX-1 — `@pyreon/rx` namespace lowering regression-lock.
//
// PMTC previously silently dropped any `rx.METHOD(...)` call from emit
// because its parser only recognised top-level identifier callees (see
// PR #1317's `tier2-rx-silent-drop.test.ts` regression-lock). This PR
// adds `tryRxNamespaceLowering` in parse.ts which rewrites `const x =
// rx.METHOD(signal, ...)` into a `computed` IR with the equivalent
// native-collection-method call body — same shape the compiler already
// emits for hand-written `const x = computed(() => signal().METHOD(...))`.
//
// What this test asserts:
//   1. The lowering FIRES (not silent-drop) — the binding name is
//      present in the emit, and the underlying source signal is read.
//   2. The native method name appears verbatim in the emitted body
//      (proves the lowering routes through the same emit pipeline used
//      for hand-written `.filter` / `.map` / `.reversed` calls).
//   3. Unsupported rx methods (`rx.sortBy`, `rx.count`, …) STILL produce
//      the silent-drop bug — by design; they're explicit follow-ups
//      tracked in the per-method lowering table in
//      docs/src/content/docs/multiplatform-libraries.md. A bisect-verified warning
//      surfaces so the user knows what to do.
//
// Bisect-verified: removing the `tryRxNamespaceLowering(...)` call
// from `tryExtractDecl` in parse.ts causes all "lowering fires" specs
// here to fail with the same message shape as #1317's silent-drop
// regression test.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SOURCE = `
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

interface Todo { id: number; title: string; done: boolean; priority: number }

export function RxLowerProbe() {
  const todos = signal<Todo[]>([])
  const active = rx.filter(todos, (t: Todo) => !t.done)
  const priorities = rx.map(active, (t: Todo) => t.priority)
  const reversed = rx.reverse(active)
  return null
}
`

describe('RX-1 — rx namespace lowering', () => {
  describe('Swift target', () => {
    it('emits a computed property per rx.* binding (not silent-drop)', () => {
      const result = transform(SOURCE, { target: 'swift' })
      // The three rx-derived bindings must appear as Swift computed
      // properties. Pre-fix none of these were in the emit.
      expect(result.code).toContain('var active')
      expect(result.code).toContain('var priorities')
      expect(result.code).toContain('var reversed')
    })

    it('lowers rx.filter to .filter on the source signal', () => {
      const result = transform(SOURCE, { target: 'swift' })
      // The emit reads `todos` (Swift @State unwraps the signal call)
      // and invokes `.filter` with the original predicate.
      expect(result.code).toMatch(/todos\.filter\(\{ t in !t\.done \}\)/)
    })

    it('lowers rx.map to .map on the source binding', () => {
      const result = transform(SOURCE, { target: 'swift' })
      expect(result.code).toMatch(/active\.map\(\{ t in t\.priority \}\)/)
    })

    it('lowers rx.reverse to .reversed() (immutable variant)', () => {
      const result = transform(SOURCE, { target: 'swift' })
      // `.reverse()` mutates; `.reversed()` returns a new array. We
      // pick `.reversed()` because rx.reverse is a non-mutating
      // signal transform.
      expect(result.code).toContain('active.reversed()')
      expect(result.code).not.toMatch(/active\.reverse\(\)/)
    })
  })

  describe('Kotlin target', () => {
    it('emits a derivedStateOf per rx.* binding (not silent-drop)', () => {
      const result = transform(SOURCE, { target: 'kotlin' })
      // Kotlin computed bindings render as `val X by remember {
      // derivedStateOf { ... } }` — the binding name AND a
      // `derivedStateOf` block must appear.
      expect(result.code).toContain('val active')
      expect(result.code).toContain('val priorities')
      expect(result.code).toContain('val reversed')
      const derivedStateOfCount = (result.code.match(/derivedStateOf/g) ?? []).length
      // 3 rx-lowered bindings → 3 derivedStateOf blocks (plus 0 hand-
      // written computeds in this fixture).
      expect(derivedStateOfCount).toBe(3)
    })

    it('lowers rx.filter to .filter on the source binding', () => {
      const result = transform(SOURCE, { target: 'kotlin' })
      expect(result.code).toMatch(/todos\.filter\(\{ t -> !t\.done \}\)/)
    })

    it('lowers rx.map to .map on the source binding', () => {
      const result = transform(SOURCE, { target: 'kotlin' })
      expect(result.code).toMatch(/active\.map\(\{ t -> t\.priority \}\)/)
    })

    it('lowers rx.reverse to .reversed() (immutable variant)', () => {
      const result = transform(SOURCE, { target: 'kotlin' })
      expect(result.code).toContain('active.reversed()')
      // Kotlin's mutating `reverse()` is on MutableList; we want the
      // List<T>.reversed() returning a new list.
      expect(result.code).not.toMatch(/active\.reverse\(\)/)
    })
  })

  describe('out-of-set rx methods (silent-drop with warning)', () => {
    // The v1 supported set is rx.filter / rx.map / rx.reverse. Other
    // methods still fall through to the original silent-drop bug,
    // BUT the parser now emits a directed warning naming the missing
    // method — the user knows exactly what's not yet supported instead
    // of getting no signal.
    // Use rx.partition — still Strategy B (needs tuple emit / runtime
    // port). count / take / sum / etc. all moved into the v1 set in
    // the full Strategy-A landing.
    const UNSUPPORTED = `
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const parts = rx.partition(xs, (n) => n > 0)
  return null
}
`
    it('warns about rx.partition (not yet lowered)', () => {
      const result = transform(UNSUPPORTED, { target: 'swift' })
      expect(
        (result.warnings ?? []).some((w) =>
          /rx\.partition is not yet lowered/.test(w),
        ),
      ).toBe(true)
    })

    it('still drops the binding (the original bug shape, until the follow-up lands)', () => {
      const result = transform(UNSUPPORTED, { target: 'swift' })
      // The `parts` binding is absent — same as the pre-RX-1 silent-drop
      // bug. The warning IS the signal; the emit is the same as before.
      expect(result.code).not.toMatch(/\bvar parts\b|\blet parts\b/)
    })
  })

  describe('supported rx methods produce no warnings', () => {
    it('no warning for rx.filter / rx.map / rx.reverse', () => {
      const swift = transform(SOURCE, { target: 'swift' })
      const kotlin = transform(SOURCE, { target: 'kotlin' })
      expect(swift.warnings).toEqual([])
      expect(kotlin.warnings).toEqual([])
    })
  })
})
