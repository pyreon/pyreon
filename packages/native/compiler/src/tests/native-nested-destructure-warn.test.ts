// Zero-silent-drops (P1): a NON-simple destructure in a function body — nested
// (`const {a:{b}} = o()`), object-rest (`const {a, ...r} = o()`), array-rest
// (`const [a, ...r] = xs()`), or default (`const {a = 1} = o()`) — used to be
// SILENTLY dropped: `parseStatement` returns null for a pattern id with no
// `.name`, so the bindings never declared and every later reference emitted as
// an UNBOUND identifier (`private var x: Any { b }` where `b` was never
// declared) — invalid Swift/Kotlin, and NO warning told the author.
//
// Now it fails LOUDLY with a named diagnostic pointing at the escape hatch
// (bind fields explicitly). FLAT `const {x, y} = …` / `const [a, b] = …` still
// lower (the all-simple expansions), so this only closes the silent-drop for
// the shapes that genuinely can't.
//
// Bisect-load-bearing: revert the warn block → the four "now warns" specs fail
// (no diagnostic) while the two flat specs stay green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const wrap = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){\n${body}\n  return (<Stack><Text>x</Text></Stack>)\n}`

const warns = (body: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(wrap(body), { target }).warnings

const RE = /Nested \/ rest \/ default destructuring in a function body is not lowered/

describe('P1 — non-simple body destructure fails loudly (was a silent drop)', () => {
  it('nested object destructure `const {a:{b}} = o()` warns (named, with escape hatch)', () => {
    const w = warns(`const o=signal({a:{b:1}}); const x=computed(()=>{const {a:{b}}=o();return b})`)
    expect(w.some((m) => RE.test(m))).toBe(true)
    expect(w.some((m) => m.includes('bind the fields explicitly'))).toBe(true)
  })

  it('object-rest `const {a, ...r} = o()` warns', () => {
    expect(warns(`const o=signal({a:1,b:2}); const x=computed(()=>{const {a,...r}=o();return a})`).some((m) => RE.test(m))).toBe(true)
  })

  it('array-rest `const [a, ...r] = xs()` warns', () => {
    expect(warns(`const xs=signal([1,2,3]); const x=computed(()=>{const [a,...r]=xs();return a})`).some((m) => RE.test(m))).toBe(true)
  })

  it('default-value `const {a = 1} = o()` warns', () => {
    expect(warns(`const o=signal({a:1}); const x=computed(()=>{const {a=1}=o();return a})`).some((m) => RE.test(m))).toBe(true)
  })

  it('Kotlin target warns identically (both targets fail loud)', () => {
    expect(warns(`const o=signal({a:{b:1}}); const x=computed(()=>{const {a:{b}}=o();return b})`, 'kotlin').some((m) => RE.test(m))).toBe(true)
  })

  // The supported shapes MUST stay silent (they lower correctly) — guards
  // against the warn block over-firing.
  it('flat object destructure `const {x, y} = o()` does NOT warn (still lowers)', () => {
    expect(warns(`const o=signal({x:1,y:2}); const s=computed(()=>{const {x,y}=o();return x+y})`).some((m) => RE.test(m))).toBe(false)
  })

  it('flat array destructure `const [a, b] = xs()` does NOT warn (still lowers)', () => {
    expect(warns(`const xs=signal([1,2]); const s=computed(()=>{const [a,b]=xs();return a+b})`).some((m) => RE.test(m))).toBe(false)
  })
})
