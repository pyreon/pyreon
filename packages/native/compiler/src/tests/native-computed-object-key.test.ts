// Computed object keys `{ [expr]: v }` — silent MIS-EMIT → NAMED warning.
//
// A computed-key property has `computed: true` and its `key` is the key
// EXPRESSION, not a static name. Pre-fix the ObjectExpression parser matched
// an identifier-keyed computed prop via `p.key?.name` and used the VARIABLE
// NAME as the struct field: `{ [k]: 1 }` (k a var) emitted `__Obj0(k: 1)`, and
// a downstream `o.a` / `o[k]` read missed the field — a clean-PARSE mis-emit
// (`swiftc -parse` accepts it; only `-typecheck`/device catches the wrong
// field). A native struct/data-class needs static field names, so a computed
// key has no faithful lowering → now a NAMED warning (never the silent wrong
// field). Static keys, string-literal-free object literals, and object spreads
// are untouched.
//
// Bisect-verified by reverting the `p.computed === true` guard — the computed
// key silently re-emits the variable name as the field.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('computed object keys — NAMED warning (was a silent wrong-field mis-emit)', () => {
  it('warns NAMED on both targets for `{ [k]: v }` (never the silent wrong field)', () => {
    const src = `export function App() { const k = "a"; const o = { [k]: 1 }; return <Text>{String(o)}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect(
        (out.warnings ?? []).some((w) => w.includes('Computed object keys')),
        `${target}: ${JSON.stringify(out.warnings)}`,
      ).toBe(true)
      // the silent wrong field `k: 1` must NOT be emitted
      expect(out.code).not.toMatch(/\bk:\s*1\b/)
      expect(out.code).not.toMatch(/\bk\s*=\s*1\b/)
    }
  })

  it('static keys are untouched — no warning, fields emit', () => {
    const src = `export function App() { const o = { a: 1, b: 2 }; return <Text>{String(o.a)}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect((out.warnings ?? []).some((w) => w.includes('Computed object keys'))).toBe(false)
    }
  })

  it('object spreads are untouched — no computed-key warning', () => {
    const src = `export function App() { const t = { a: 1 }; const u = { ...t, b: 2 }; return <Text>{String(u.b)}</Text> }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect((out.warnings ?? []).some((w) => w.includes('Computed object keys'))).toBe(false)
    }
  })
})
