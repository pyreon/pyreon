// Optional chaining (`a?.b`) — subset widening.
//
// Previously the parser bailed on EVERY `ChainExpression` with a "semantics
// differ, use a guard" warning. But optional MEMBER access lowers cleanly:
// Swift and Kotlin both spell it `?.` with the same short-circuit semantics
// as JS. The member emit PROPAGATES `?.` down the chain (`a?.b.c` →
// `a?.b?.c`) — REQUIRED for Kotlin (a plain `.c` on a nullable is a type
// error) and valid for Swift (the redundant `?.` is accepted).
//
//   a?.b        → Swift `a?.b`        / Kotlin `a?.b`
//   a?.b.c      → Swift `a?.b?.c`     / Kotlin `a?.b?.c`   (propagated)
//
// Optional INDEX (`a?.[i]`) and optional CALL (`fn?.()`) diverge per target
// (Swift `a?[i]`/`fn?()` vs Kotlin `a?.get(i)`/`fn?.invoke()`), so the parser
// keeps the explicit-guard warning for those rarer shapes.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck — via a `useFetch` nullable
//    source (`data()?.title`), which resolves to a proper nullable data
//    class so `?.` typechecks. NOTE a `signal<T | null>(null)` source
//    currently fails kotlinc for a SEPARATE reason — `mutableStateOf(null)`
//    is emitted without a type param so Kotlin infers `Nothing?`; that
//    nullable-signal-init typing is a documented follow-up, NOT an
//    optional-chaining defect (the `?.` emit is byte-identical either way).
//  - Swift: `swiftc -parse` (the harness rung — parse-only) + emit-shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const p = signal<{ name: string; addr: { city: string } } | null>(null)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('optional chaining', () => {
  it('single optional member emits `?.` (both targets)', () => {
    const body = `  const n = computed(() => p()?.name)`
    expect(transform(app(body), { target: 'swift' }).code).toContain('p?.name')
    expect(transform(app(body), { target: 'kotlin' }).code).toContain('p?.name')
  })

  it('propagates `?.` down a multi-level chain (a?.b.c → a?.b?.c)', () => {
    const body = `  const c = computed(() => p()?.addr.city)`
    // Kotlin REQUIRES the propagation; Swift accepts it. Both emit the same.
    expect(transform(app(body), { target: 'swift' }).code).toContain('p?.addr?.city')
    expect(transform(app(body), { target: 'kotlin' }).code).toContain('p?.addr?.city')
  })

  it('does NOT add `?.` to a plain (non-optional) member chain', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const o = signal<{ a: { b: number } }>({ a: { b: 1 } })
  const v = computed(() => o().a.b)
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('o.a.b')
    expect(out).not.toContain('o?.a')
  })

  it('optional CALL still warn-falls-back; optional INDEX now lowers (safe-index)', () => {
    // #1989 lowers optional INDEX (`a?.[i]`) to the guarded safe-index idiom
    // for a re-readable receiver (see native-optional-index.test.ts), so it no
    // longer warns. Optional CALL (`fn?.()`) still diverges per target (Swift
    // `fn?()` vs Kotlin `fn?.invoke()`) and warn-falls-back.
    const call = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const fn = signal<(() => number) | undefined>(undefined)
  const v = computed(() => fn?.())
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(call.warnings.some((w) => w.includes('index/call'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: optional-chain emit parses via swiftc -parse', () => {
    const out = transform(app(`  const c = computed(() => p()?.addr.city)`), {
      target: 'swift',
    }).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: single + propagated optional chaining over a useFetch nullable source typechecks via kotlinc',
    () => {
      // useFetch's `data` is a proper nullable data class, so `?.` typechecks
      // (a `signal<T | null>(null)` source fails for a SEPARATE
      // nullable-signal-init-typing reason — see the file header). Named
      // nested types (`Meta`) synthesize as real data classes, so the
      // PROPAGATED `data?.meta?.tag` resolves + typechecks too.
      const out = transform(
        `import { Stack, Text } from '@pyreon/primitives'
type Meta = { tag: string }
type Post = { title: string; meta: Meta }
function App() {
  const { data } = useFetch<Post>("/x")
  const t = computed(() => data()?.title)
  const m = computed(() => data()?.meta.tag)
  return (<Stack><Text>{(t() ?? "")}</Text></Stack>)
}`,
        { target: 'kotlin' },
      ).code
      // single optional + propagated multi-level optional both present …
      expect(out).toContain('?.title')
      expect(out).toContain('?.meta?.tag')
      // … and the whole thing typechecks (real kotlinc semantic rung).
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
