// Regression locks for three Swift-emit bugs found by a post-v0.34.0 audit that
// PARSE clean (the per-PR `swiftc -parse` gate) but FAIL `swiftc -typecheck`:
//
//   A (#1712): `.map(w => w.length)` over a `string[]` inferred the element as
//      `unknown` → the map result became `[Any]` → rejected when consumed.
//   B (#1812/#1814): `.slice()` on an OPTIONAL receiver (from `.find()`,
//      `T | undefined`) was not lowered — the raw `.slice` survived → "value of
//      type 'String' has no member 'slice'".
//   C (#1829): `Number(boolean)` emitted `Double(<Bool>)`, which Swift has no
//      initializer for → "cannot convert value of type 'Bool'".
//
// Each has a CI-runnable emit-SHAPE assertion (no toolchain) + a macOS-only
// `swiftc -typecheck` assertion against the real SwiftUI SDK.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const wrap = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'\nimport { signal, computed } from '@pyreon/reactivity'\nfunction App() {\n${body}\nreturn <Stack><Text>{out()}</Text></Stack>\n}`

const emit = (body: string) => transform(wrap(body), { target: 'swift' }).code
const typechecks = (body: string) =>
  validateSwiftTypecheck(
    'import SwiftUI\nstruct User { let id: String; let name: String }\n' + emit(body),
  )

describe('Swift emit -typecheck fixes (post-v0.34.0 audit)', () => {
  describe('A — string `.length` inside `.map` infers number (not `[Any]`)', () => {
    const body = `const words = signal<string[]>(["a","bb"])\nconst out = computed(() => words().map(w => w.length))`
    it('emits `[Int]`, never `[Any]`', () => {
      const swift = emit(body)
      expect(swift).toContain('[Int]')
      expect(swift).not.toContain('[Any]')
    })
    it.skipIf(!isSwiftUIAvailable())('type-checks on real swiftc', () => {
      const r = typechecks(body)
      if (!r.ok && !r.skipped) throw new Error(r.error)
    })
  })

  describe('B — `.slice()` on a `.find()` optional receiver is lowered', () => {
    const body = `const xs = signal<string[]>(["aaaa"])\nconst f = computed(() => xs().find(x => x.length > 3))\nconst out = computed(() => f()?.slice(0,2) ?? "")`
    it('lowers via optional `.map { String($0.dropFirst… }`, not raw `.slice`', () => {
      const swift = emit(body)
      expect(swift).toContain('.map { String(')
      expect(swift).not.toMatch(/\?\.slice\(/)
    })
    it.skipIf(!isSwiftUIAvailable())('type-checks on real swiftc', () => {
      const r = typechecks(body)
      if (!r.ok && !r.skipped) throw new Error(r.error)
    })
  })

  describe('C — `Number(boolean)` emits a ternary, not `Double(Bool)`', () => {
    const body = `const b = signal(true)\nconst out = computed(() => Number(b()))`
    it('emits `(b ? 1 : 0)`, never `Double(b`', () => {
      const swift = emit(body)
      expect(swift).toContain('? 1 : 0')
      expect(swift).not.toMatch(/Double\(b\b/)
    })
    it.skipIf(!isSwiftUIAvailable())('type-checks on real swiftc', () => {
      const r = typechecks(body)
      if (!r.ok && !r.skipped) throw new Error(r.error)
    })
  })
})
