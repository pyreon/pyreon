// Zero-silent-drops (P1) — optional COMPUTED access `a?.[i]` (the safe-index
// idiom), both targets.
//
// `a?.[i]` was chain-bailed by the parser (`chainHasUnsupportedOptional`) to
// the `""` fallback + a generic warning — and worse, a chained shape like
// `find(...)?.tags?.[0] ?? "none"` COMPILED with a semantically wrong value
// (`"" ?? "none"` → always ""). JS semantics: `a?.[i]` returns undefined
// out-of-bounds (and nil-propagates an optional receiver), so it lowers to
// the guarded native idioms:
//   Swift  → `(a.indices.contains(i) ? a[i] : nil)` — both operands are
//            named twice, so both must be RE-READABLE (scalar literals now
//            count) and the receiver NON-optional; other shapes emit the
//            nil-propagating/unguarded subscript + a NAMED warning (OOB
//            traps — the warning says so).
//   Kotlin → `getOrNull(i)` (stdlib, single-eval — every shape composes:
//            chained receivers need no guard; optional-link receivers get
//            the safe call `?.getOrNull` via the SYNTACTIC
//            `exprHasOptionalLink` check — the type layer doesn't wrap
//            optional-member results in a union, so a type-based check
//            under-detects).
// The inference types the optional form `element | undefined`, so a chained
// `?? fallback` collapses to the non-optional type (#1957). `fn?.()`
// (optional CALL) keeps the explicit-guard warning — out of scope here.
//
// Bisect-load-bearing: (1) neuter the parse optional-flag carry → the form
// falls back to the chain-bail `""` and every lowering spec fails; (2)
// neuter the Swift guarded emit → the Swift idiom specs fail while Kotlin
// passes; (3) neuter the Kotlin getOrNull emit → the mirror; (4) neuter the
// inference union → the `Int` annotation spec degrades.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const A = (body: string, read = 'String(out())') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

const LIT = A(`  const out = computed(() => nums()?.[0] ?? 0)`)
const SIG = A(`  const idx = signal<number>(1)
  const out = computed(() => nums()?.[idx()] ?? 0)`)

describe('P1 — optional index a?.[i] (safe-index idiom)', () => {
  it('Swift: `nums()?.[0] ?? 0` lowers to the guarded idiom, warning-free, typed Int', () => {
    const rs = transform(LIT, { target: 'swift' })
    expect(rs.code).toContain('(nums.indices.contains(0) ? nums[0] : nil)')
    expect(rs.code).toContain('var out: Int {')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: the same lowers to single-eval `getOrNull(0)`', () => {
    const rk = transform(LIT, { target: 'kotlin' })
    expect(rk.code).toContain('nums.getOrNull(0) ?: 0')
    expect(rk.warnings).toHaveLength(0)
  })
  it('a BARE `nums()?.[0]` (no ??) annotates Int? — isolates the union inference (a chained ?? would mask it)', () => {
    const rs = transform(A(`  const out = computed(() => nums()?.[0])`, 'String(out() ?? -1)'), {
      target: 'swift',
    })
    expect(rs.code).toContain('var out: Int? {')
  })
  it('a signal-read index qualifies as re-readable on Swift', () => {
    expect(transform(SIG, { target: 'swift' }).code).toContain(
      '(nums.indices.contains(idx) ? nums[idx] : nil)',
    )
  })
  it('Kotlin: an optional-link receiver chain composes fully (`sel?.tags?.getOrNull(0)`)', () => {
    const rk = transform(
      `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; tags: string[] }
export function App(){
  const items = signal<T[]>([{ id: 1, tags: ["a"] }])
  const sel = computed(() => items().find((t: T) => t.id === 1))
  const out = computed(() => sel()?.tags?.[0] ?? "none")
  return (<Stack><Text>{out()}</Text></Stack>)
}`,
      { target: 'kotlin' },
    )
    expect(rk.code).toContain('sel?.tags?.getOrNull(0)')
    expect(rk.warnings).toHaveLength(0)
  })
  it('Swift: an optional-link receiver falls back to the nil-propagating subscript + NAMED warning', () => {
    const rs = transform(
      `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; tags: string[] }
export function App(){
  const items = signal<T[]>([{ id: 1, tags: ["a"] }])
  const sel = computed(() => items().find((t: T) => t.id === 1))
  const out = computed(() => sel()?.tags?.[0] ?? "none")
  return (<Stack><Text>{out()}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(rs.code).toContain('sel?.tags[0]')
    expect(rs.warnings.some((w) => w.includes('safe-index'))).toBe(true)
  })
  it('guard: a chained (non-re-readable) receiver warns NAMED on Swift; Kotlin stays clean', () => {
    const src = A(`  const out = computed(() => nums().filter((x: number) => x > 0)?.[0] ?? 0)`)
    const rs = transform(src, { target: 'swift' })
    expect(rs.warnings.some((w) => w.includes('safe-index'))).toBe(true)
    const rk = transform(src, { target: 'kotlin' })
    expect(rk.code).toContain('.getOrNull(0)')
    expect(rk.warnings).toHaveLength(0)
  })
  it('controls: plain `a[0]` unchanged; optional CALL `fn?.()` now lowers too (no warning)', () => {
    const plain = transform(A(`  const out = computed(() => nums()[0])`), { target: 'swift' })
    expect(plain.code).toContain('var out: Int { nums[0] }')
    expect(plain.warnings).toHaveLength(0)
    // Optional CALL used to warn-fall-back (the explicit-guard "index/call"
    // diagnostic) — the contrasting control to optional-index's lowering. It
    // now ALSO lowers (Swift `fn?()`; the dedicated contract is
    // native-optional-call.test.ts), so no optional shape warns anymore.
    const call = transform(
      `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type P = { onDone?: () => void }
export function App(p: P){
  const onTap = () => { p.onDone?.() }
  return (<Stack><Button onPress={onTap}>go</Button></Stack>)
}`,
      { target: 'swift' },
    )
    expect(call.warnings.some((w) => w.includes('index/call'))).toBe(false)
    expect(call.code).toContain('onDone?()')
  })

  // Compile proof — literal + signal-index + string-array shapes end-to-end.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const tags = signal<string[]>(["a", "b"])
  const idx = signal<number>(1)
  const first = computed(() => nums()?.[0] ?? 0)
  const at = computed(() => nums()?.[idx()] ?? -1)
  const tag = computed(() => tags()?.[idx()] ?? "x")
  const out = computed(() => String(first()) + " " + String(at()) + " " + tag())
  return (<Stack><Text>{out()}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: the safe-index component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(proof, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(proof, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
