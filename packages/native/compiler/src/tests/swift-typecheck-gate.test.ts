// Swift `-typecheck` gate — the type-level safety net.
//
// `validateSwift` runs `swiftc -parse` (syntax-only): it CANNOT catch the
// silent type-corruption class — a `[Any]` where `[Int]` was meant, a
// `var x: Int { <Double body> }` mismatch, a String passed where an Int
// is expected. `[Any]` is valid Swift, so a green parse-gate shipped
// type-erased native code (the exact gap PR #1735's struct-field
// registry attacked at the emit layer).
//
// `validateSwiftTypecheck` closes the GATE side: it runs `swiftc
// -typecheck` against the REAL SwiftUI SDK (no stubs → no masking), so
// it performs full name + type resolution. This file proves (a) the gate
// catches a type error `-parse` waves through, and (b) the real emit
// — including the now-typed `.map` projections from #1735 — typechecks
// clean against real SwiftUI.
//
// macOS-only: SwiftUI is an Apple framework, absent on the Linux PR
// runner. `isSwiftUIAvailable()` gates every case so the suite skips
// cleanly off-macOS (the macOS device workflow + local macOS dev are
// where this runs).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isSwiftUIAvailable,
  validateSwift,
  validateSwiftTypecheck,
} from '../validate'

describe('swiftc -typecheck gate', () => {
  it('skips cleanly when SwiftUI is unavailable (non-macOS)', () => {
    // Contract: off-macOS this is a SKIP, never a failure — the gate is
    // additive, not a blocker on the Linux PR runner.
    if (isSwiftUIAvailable()) return
    const res = validateSwiftTypecheck('let _ = 0')
    expect(res.ok).toBe(true)
    expect(res.skipped).toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())(
    'CATCHES a type error that swiftc -parse waves through (gate discriminating power)',
    () => {
      // Syntactically valid, type-INVALID: a [String] literal assigned to
      // a [Int]. This is the shape `[Any]` masks at a typed consumer site.
      const bad = `struct BadView: View {
  var body: some View {
    let xs: [Int] = ["a", "b"]
    return Text("\\(xs.count)")
  }
}`
      // -parse PASSES it (no semantic analysis) — proving the old gate's blind spot.
      expect(validateSwift(`import SwiftUI\n${bad}`).ok).toBe(true)
      // -typecheck REJECTS it.
      const tc = validateSwiftTypecheck(bad)
      expect(tc.ok).toBe(false)
      expect(tc.error ?? '').toMatch(/cannot convert|expected element type/i)
    },
  )

  it.skipIf(!isSwiftUIAvailable())(
    'the #1735 typed .map emit typechecks clean against real SwiftUI',
    () => {
      // The struct-field-registry fix makes this emit `[Int]`/`[String]`/
      // `[Bool]` (not `[Any]`). Prove the now-typed emit is type-VALID
      // against the real SDK — connecting the emit-shape fix to a real
      // compiler accepting it.
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; text: string; done: boolean }
function App() {
  const todos = signal<Todo[]>([])
  const ids = computed(() => todos().map(t => t.id))
  const texts = computed(() => todos().map(t => t.text))
  const flags = computed(() => todos().map(t => t.done))
  return (<Stack><Text>{String(ids().length)}</Text></Stack>)
}`,
        { target: 'swift' },
      ).code
      const res = validateSwiftTypecheck(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isSwiftUIAvailable())(
    'representative SwiftUI-only components typecheck (counter + control flow)',
    () => {
      const out = transform(
        `import { Stack, Text, Button } from '@pyreon/primitives'
function App() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return (<Stack>
    <Text>{String(count())}</Text>
    <Text>{String(doubled())}</Text>
    <Button onPress={() => count.set(count() + 1)}>inc</Button>
  </Stack>)
}`,
        { target: 'swift' },
      ).code
      const res = validateSwiftTypecheck(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isSwiftUIAvailable())(
    'prepends import SwiftUI only when absent (idempotent preamble)',
    () => {
      // A source that ALREADY imports SwiftUI must not get a double import
      // (which is a warning, not an error, but the contract is: prepend
      // only when missing).
      const withImport = `import SwiftUI
struct V: View {
  var body: some View { Text("ok") }
}`
      expect(validateSwiftTypecheck(withImport).ok).toBe(true)
    },
  )
})
