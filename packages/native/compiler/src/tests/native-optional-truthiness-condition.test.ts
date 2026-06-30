// Zero-silent-drops (P1): a JS TRUTHINESS test on an OPTIONAL value — `const t
// = todos.find(...); t ? a : b` / `{t && <X/>}` / `<Show when={t}>` — used to be
// SILENTLY MIS-EMITTED. `.find` / `.findLast` / `.at` / a `T | null` field
// correctly lower to an optional (Swift `T?`, Kotlin `T?`), but the condition
// then emitted the BARE optional where Swift/Kotlin require a Bool:
//   Swift:  `t ? "y" : "n"`      → error: optional type 'T?' cannot be used as a
//                                  boolean; test for '!= nil' instead
//   Kotlin: `if (t) "y" else "n"`→ error: condition type mismatch: inferred type
//                                  is 'T?' but 'Boolean' was expected
// JS coerces null→false / non-null→true; Swift & Kotlin don't. Clean parse, no
// warning, uncompilable — the most dangerous silent-mis-emit class.
//
// Fixed by lowering an OPTIONAL-inferred condition to an explicit `!= nil`
// (Swift) / `!= null` (Kotlin) at the three conditional-RENDERING sites that
// share the component infer ctx: ternary, `{cond && <View/>}`, and `<Show
// when>`. One shared `typeIsOptional(TypeIR)` helper (infer-type.ts) defines
// "optional" once for all six emit sites (3 shapes × 2 targets). Boolean
// conditions (`n > 2`, `.some(...)`, a `Bool` signal) are NOT wrapped — the
// lowering fires only when the condition INFERS optional.
//
// Bisect-load-bearing: neuter `typeIsOptional` to `return false` → the wrap
// vanishes, the optional-condition specs + both compile proofs fail, and the
// boolean-control specs stay green (they never wrapped).
//
// DEFERRED (separate emit path, honestly out of scope): an `if (opt) { … }`
// STATEMENT inside an event handler still mis-emits (imperative position,
// handler-local infer ctx) — a tracked follow-up.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const H =
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `import { Show } from '@pyreon/core'\n`

// `t` is OPTIONAL — a `.find` result (`AppTodo?` / `__Obj0?`).
const optTernary = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  const out = computed(() => t() ? "y" : "n")
  return (<Stack><Text>{out}</Text></Stack>)
}`
const optAnd = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  return (<Stack>{t() && <Text>found</Text>}</Stack>)
}`
const optShow = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  return (<Stack><Show when={() => t()}><Text>found</Text></Show></Stack>)
}`
// A component exercising ALL THREE optional-condition shapes at once — the
// real compile proof (1 swiftc + 1 kotlinc call).
const optAll = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  const label = computed(() => t() ? "has" : "none")
  return (<Stack>
    <Text>{label}</Text>
    {t() && <Text>and</Text>}
    <Show when={() => t()}><Text>shown</Text></Show>
  </Stack>)
}`
// BOOLEAN conditions — must NOT be wrapped.
const boolTernary = `${H}export function App(){
  const n = signal(2)
  const out = computed(() => n() > 2 ? "m" : "f")
  return (<Stack><Text>{out}</Text></Stack>)
}`
const boolAnd = `${H}export function App(){
  const ok = signal(true)
  return (<Stack>{ok() && <Text>x</Text>}</Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — JS truthiness on an optional lowers to != nil / != null (was a silent mis-emit)', () => {
  // Swift wrap present for optional conditions.
  it('Swift: optional ternary wraps the condition in `!= nil`', () => {
    expect(sw(optTernary)).toContain('!= nil')
  })
  it('Swift: optional `{t && <X/>}` wraps in `!= nil`', () => {
    expect(sw(optAnd)).toContain('!= nil')
  })
  it('Swift: optional `<Show when>` wraps in `!= nil`', () => {
    expect(sw(optShow)).toContain('!= nil')
  })

  // Kotlin wrap present.
  it('Kotlin: optional conditions wrap in `!= null`', () => {
    expect(kt(optTernary)).toContain('!= null')
    expect(kt(optAnd)).toContain('!= null')
    expect(kt(optShow)).toContain('!= null')
  })

  // Boolean conditions must NOT be wrapped — guards against over-firing.
  it('Swift: a BOOLEAN ternary is NOT wrapped (no spurious `!= nil`)', () => {
    expect(sw(boolTernary)).not.toContain('!= nil')
  })
  it('Swift: a BOOLEAN `&&` is NOT wrapped', () => {
    expect(sw(boolAnd)).not.toContain('!= nil')
  })
  it('Kotlin: a BOOLEAN ternary is NOT wrapped (no spurious `!= null`)', () => {
    expect(kt(boolTernary)).not.toContain('!= null')
  })

  // The real proof: all three optional-condition shapes COMPILE clean.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: a component using all 3 optional-condition shapes TYPECHECKS against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(sw(optAll))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())(
    'Android: the same component compiles via kotlinc',
    () => {
      const r = validateKotlin(kt(optAll))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
})
