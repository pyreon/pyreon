// `Object.keys(...)` on native — lowering + degrade-and-warn.
//
// JS runtime object reflection has NO native analog: a Swift struct / Kotlin
// data class carries no runtime key enumeration (you'd need `Mirror`). Before
// this lowering, ANY `Object.keys(x)` / `Object.values(x)` / `Object.entries(x)`
// fell through to the generic emit → `Object.keys(x)`, which is "cannot find
// 'Object' in scope" on both targets — SILENTLY uncompilable (no warning),
// the classic "fails outside the subset" hole.
//
// Two halves, both closed here:
//   1. POSITIVE — `Object.keys(<object-literal-typed expr>)`: a synthesized
//      struct's field names ARE statically known, so the call lowers to a
//      plain string-array literal (`["a","b"]` / `listOf("a","b")`). An inline
//      `Object.keys({ a: 1, b: 2 })` reads its keys straight off the ExprIR
//      (self-contained); a signal/computed of a struct shape resolves via
//      `inferType` (activates once object→struct *type* inference lands —
//      proven directly by the `rewriteObjectKeys` unit test below).
//   2. DEGRADE-AND-WARN — every other `Object.<method>(...)` (`.values` /
//      `.entries`, heterogeneous → `[Any]`; `Object.keys` on a non-struct
//      arg; `.assign` / `.fromEntries`): emit a TYPED empty array/list (always
//      compiles, even in an `Any` computed context — unlike a bare `[]` which
//      Swift can't type-infer) + a loud warning. Compilable-and-warned beats
//      silently-uncompilable.
//
// Bisect-load-bearing: revert the lowering and `Object.keys({...})` emits the
// invalid `Object.keys(...)` → the swiftc-typecheck + kotlinc gates fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { emptyInferenceCtx, rewriteObjectKeys } from '../infer-type'
import type { ExprIR } from '../types'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwift,
  validateSwiftTypecheck,
} from '../validate'

const SRC = `import { computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const keyCount = computed(() => Object.keys({ alpha: 1, beta: 2, gamma: 3 }).length)
  const valCount = computed(() => Object.values({ x: 1, y: 2 }).length)
  return (<Stack><Text>{keyCount()}</Text><Text>{valCount()}</Text></Stack>)
}`

describe('Object.keys on native — lowering + degrade-and-warn', () => {
  it('Swift: Object.keys(inline literal) → static [String]; Object.values degrades to a typed empty array', () => {
    const out = transform(SRC, { target: 'swift' })
    // POSITIVE: the three keys lower to a literal string array (declaration order).
    expect(out.code).toContain('["alpha", "beta", "gamma"]')
    // `.length` maps to Swift `.count`.
    expect(out.code).toContain('["alpha", "beta", "gamma"].count')
    // DEGRADE: Object.values → typed empty (not the invalid `Object.values(...)`).
    expect(out.code).toContain('[Any]()')
    expect(out.code).not.toContain('Object.keys')
    expect(out.code).not.toContain('Object.values')
    // The degrade is LOUD.
    expect(out.warnings.some((w) => w.includes('Object.values'))).toBe(true)
  })

  it('Kotlin: Object.keys(inline literal) → listOf(...); Object.values degrades to emptyList<Any>()', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('listOf("alpha", "beta", "gamma")')
    expect(out.code).toContain('emptyList<Any>()')
    expect(out.code).not.toContain('Object.keys')
    expect(out.code).not.toContain('Object.values')
    expect(out.warnings.some((w) => w.includes('Object.values'))).toBe(true)
  })

  // The signal/computed-of-struct path. On main a `signal({...})` still infers
  // as `Any` (object→struct *type* inference is a separate, stacked change), so
  // this can't be proven end-to-end through `transform` yet — but the lowering
  // itself is exercised directly with a hand-built ctx, so it's guaranteed to
  // activate the moment the signal resolves to an object type.
  it('rewriteObjectKeys: a struct-typed arg lowers to the static key array', () => {
    const ctx = emptyInferenceCtx()
    ctx.signals.set('cfg', {
      kind: 'object',
      fields: [
        { name: 'a', type: { kind: 'number' } },
        { name: 'b', type: { kind: 'string' } },
      ],
    })
    // Object.keys(cfg())
    const expr: ExprIR = {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Object' }, property: 'keys' },
      args: [{ kind: 'call', callee: { kind: 'identifier', name: 'cfg' }, args: [] }],
    }
    const rw = rewriteObjectKeys(expr, ctx)
    expect(rw).toEqual({
      kind: 'array',
      elements: [
        { kind: 'literal', value: 'a' },
        { kind: 'literal', value: 'b' },
      ],
    })
  })

  it('rewriteObjectKeys: returns null for Object.values / non-Object / wrong arity (→ generic path)', () => {
    const ctx = emptyInferenceCtx()
    const objArg: ExprIR = { kind: 'object', fields: [{ name: 'a', value: { kind: 'literal', value: 1 } }] }
    const values: ExprIR = {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Object' }, property: 'values' },
      args: [objArg],
    }
    expect(rewriteObjectKeys(values, ctx)).toBeNull()
    const notObject: ExprIR = {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Foo' }, property: 'keys' },
      args: [objArg],
    }
    expect(rewriteObjectKeys(notObject, ctx)).toBeNull()
    const wrongArity: ExprIR = {
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Object' }, property: 'keys' },
      args: [],
    }
    expect(rewriteObjectKeys(wrongArity, ctx)).toBeNull()
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const r = validateSwift(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: without the lowering, `Object.keys({...})` emits the
  // invalid `Object.keys(...)` → swiftc TYPE error ("cannot find 'Object' in
  // scope"), which `-parse` misses but `-typecheck` vs real SwiftUI catches.
  it.skipIf(!isSwiftUIAvailable())('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles via kotlinc', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
