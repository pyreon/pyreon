// Zero-silent-drops (P1) — idiom-sweep batch 3: the Swift optional-chain
// propagation bug + switch-in-computed inference + num.toString() +
// destructured-callback-param warning.
//
// 1. THE CHAIN BUG: the Swift member emit PROPAGATED `?.` down chains
//    (`a?.b.c` → `a?.b?.c`) — correct for Kotlin (which REQUIRES it) but
//    WRONG for Swift: after the first `?.`, Swift auto-propagates, and a
//    redundant `?.` on a chain-unwrapped NON-optional field is an ERROR
//    ("cannot use optional chaining on non-optional value of type
//    'String'"). `find(...)?.name?.length ?? 0` — the master-detail
//    field-length shape — was a SILENT fail. The codified `p?.addr?.city`
//    spec was itself broken, masked by an emit-shape-only assertion with
//    NO Swift compile proof (the missing-rung lesson). Swift now emits
//    `?.` only on the first optional link (+ genuinely-optional mid-chain
//    fields via the recvProvablyNonNull arm); Kotlin unchanged.
// 2. switch-in-computed: `findFirstReturnExpr` never entered switch cases
//    (or loop bodies) → the computed typed `Any` → typed consumers failed.
// 3. `num.toString()` → Swift `String(x)` (Int has no toString member);
//    Kotlin's native toString needs no change.
// 4. A DESTRUCTURED callback param ((`{name}`) => …) was silently filtered
//    → the closure referenced unbound names. NAMED warning (the binding
//    prelude is a tracked follow-up).
//
// Bisect-load-bearing: (1) restore the propagation arm → the chain specs
// fail swiftc; (2) neuter the switch walk → the switch annotation degrades
// to Any; (3) neuter toString → raw member emit; (4) neuter the param warn
// → the warning disappears (silent again).

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
  `type Item = { id: number; name: string; qty: number }\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const items = signal<Item[]>([{ id: 1, name: "a", qty: 2 }])
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

describe('P1 — Swift optional-chain fix + batch-3 finds', () => {
  it('Swift: `find()?.name?.length` emits ONE ?. then plain access (`?.name.count`)', () => {
    const rs = transform(A(`  const out = computed(() => items().find((i: Item) => i.id === 9)?.name?.length ?? 0)`), { target: 'swift' })
    expect(rs.code).toContain('?.name.count')
    expect(rs.code).not.toContain('?.name?.count')
  })
  it('Kotlin: the propagation stays (required there — `?.name?.length`)', () => {
    const rk = transform(A(`  const out = computed(() => items().find((i: Item) => i.id === 9)?.name?.length ?? 0)`), { target: 'kotlin' })
    expect(rk.code).toContain('?.name?.length')
  })
  it('switch-in-computed infers the case-return type (was Any)', () => {
    const rs = transform(
      A(`  const out = computed(() => { switch (nums()[0]) { case 1: return "one"; case 2: return "two"; default: return "many" } })`, 'out()'),
      { target: 'swift' },
    )
    expect(rs.code).toContain('var out: String {')
    expect(rs.code).not.toContain('var out: Any {')
  })
  it('num.toString() → Swift String(x); Kotlin native toString unchanged', () => {
    const src = A(`  const out = computed(() => nums()[0].toString())`, 'out()')
    expect(transform(src, { target: 'swift' }).code).toContain('String(nums[0])')
    expect(transform(src, { target: 'kotlin' }).code).toContain('nums[0].toString()')
  })
  it('a destructured callback param warns NAMED on both targets (was silent unbound names)', () => {
    const src = A(`  const out = computed(() => items().map(({name}: Item) => name).length)`)
    expect(transform(src, { target: 'swift' }).warnings.some((w) => w.includes('destructured callback parameter'))).toBe(true)
    expect(transform(src, { target: 'kotlin' }).warnings.some((w) => w.includes('destructured callback parameter'))).toBe(true)
  })
  it('control: a single `?.` link is unchanged on both targets', () => {
    const src = A(`  const out = computed(() => items().find((i: Item) => i.id === 1)?.qty ?? 0)`)
    expect(transform(src, { target: 'swift' }).code).toContain('?.qty ?? 0')
    expect(transform(src, { target: 'kotlin' }).code).toContain('?.qty ?: 0')
  })

  // The missing rung that let the chain bug ship: a Swift COMPILE proof.
  const proof = A(`  const len = computed(() => items().find((i: Item) => i.id === 9)?.name?.length ?? 0)
  const kind = computed(() => { switch (nums()[0]) { case 1: return "one"; default: return "many" } })
  const out = computed(() => String(len()) + kind() + nums()[0].toString())`, 'out()')
  it.skipIf(!isSwiftUIAvailable())('iOS: chain + switch + toString TYPECHECK against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(proof, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(proof, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
