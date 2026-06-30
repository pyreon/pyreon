// Zero-silent-drops (P1) — completes the optional-truthiness lowering #1924
// started. #1924 lowered a POSITIVE optional condition (`t ? a : b`) to `t !=
// nil` / `t != null` at the conditional-RENDERING sites, but TWO gaps remained,
// both still silently mis-emitted:
//
//   (1) the NEGATED form `!t` (truthy-when-ABSENT) — `!t ? a : b` / `{!t &&
//       <X/>}` / `<Show when={!t}>` emitted the bare `!t`, which is itself an
//       error on an optional (Swift `!t` / Kotlin `!t` on a `T?`); it must
//       lower to `t == nil` / `t == null`.
//   (2) the STATEMENT position — `if (opt) { … }` / `while (opt)` emitted the
//       bare optional where Swift/Kotlin require a Bool.
//
// Both are closed by routing EVERY condition site (ternary, `&&`, `<Show
// when>`, `if`, `while`) through ONE shared `classifyOptionalCondition` helper
// (infer-type.ts) → `swiftCondition` / `kotlinCondition` (one per target,
// each carrying its own infer ctx + operand emitter). The helper returns
// 'present' (→ `!= nil`/`!= null`), 'absent' for `!optional` (→ `== nil`/`==
// null`, dropping the `!`), or null (a real Bool — verbatim).
//
// COVERAGE of the `if`/`while` wiring: any condition whose optionality
// `inferType` can resolve — an INLINE `if (todos.find(...))` or a COMPONENT-
// level `if (optionalComputed())`. The ONE remaining gap (honestly out of
// scope, separate concern): a handler-LOCAL var (`const t = …find(…); if (t)`)
// is NOT resolved because handler-locals aren't seeded into the infer ctx — a
// deeper change to thread a local type environment through statement emission.
//
// Bisect-load-bearing: neuter `classifyOptionalCondition` → `null` → every
// optional lowering (positive AND negated, all sites) vanishes; the negated +
// statement specs + both compile proofs fail, the boolean-control specs stay
// green.

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
  `import { Stack, Text, Button } from '@pyreon/primitives'\n` +
  `import { Show } from '@pyreon/core'\n`

// render-position, `t` is a component-level optional computed (a `.find` result)
const R = (decls: string, render: string) =>
  `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  ${decls}
  return (<Stack>${render}</Stack>)
}`

const negTernary = R(`const o = computed(() => !t() ? "empty" : "has")`, `<Text>{o}</Text>`)
const negAnd = R(``, `{!t() && <Text>empty</Text>}`)
const negShow = R(``, `<Show when={() => !t()}><Text>empty</Text></Show>`)
const boolTernary = R(`const o = computed(() => td().length > 0 ? "y" : "n")`, `<Text>{o}</Text>`)

// statement position — INLINE optional (`inferType` resolves the `.find` call)
const ifInline = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const onTap = () => { if (td().find(x => x.id === 1)) { td.set([]) } }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`
// statement position — COMPONENT-level optional read in the handler
const ifCompLevel = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  const onTap = () => { if (t()) { td.set([]) } else { td.set([{ id: 9, done: true }]) } }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`
// boolean statement control — must NOT wrap
const ifBool = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const onTap = () => { const n = td().length; if (n > 0) { td.set([]) } }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`

// A single component exercising negated render conditions + an inline-optional
// `if` — the real compile proof (1 swiftc + 1 kotlinc).
const proof = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const t = computed(() => td().find(x => x.id === 1))
  const label = computed(() => !t() ? "empty" : "has")
  const onTap = () => { if (td().find(x => x.id === 1)) { td.set([]) } }
  return (<Stack>
    <Text>{label}</Text>
    {!t() && <Text>none</Text>}
    <Show when={() => !t()}><Text>shown-when-empty</Text></Show>
    <Button onPress={onTap}>x</Button>
  </Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — optional-truthiness: negated `!opt` + statement position (completes #1924)', () => {
  // Negated optional → `== nil` / `== null` (the `!` is dropped).
  it('Swift: `!opt` in ternary/&&/Show lowers to `== nil`', () => {
    expect(sw(negTernary)).toContain('== nil')
    expect(sw(negAnd)).toContain('== nil')
    expect(sw(negShow)).toContain('== nil')
  })
  it('Kotlin: `!opt` in ternary/&&/Show lowers to `== null`', () => {
    expect(kt(negTernary)).toContain('== null')
    expect(kt(negAnd)).toContain('== null')
    expect(kt(negShow)).toContain('== null')
  })

  // Statement position — inline + component-level optionals lower.
  it('Swift: `if (inline-optional)` / `if (optionalComputed())` lower to `!= nil`', () => {
    expect(sw(ifInline)).toContain('!= nil')
    expect(sw(ifCompLevel)).toContain('!= nil')
  })
  it('Kotlin: the same `if`-statement conditions lower to `!= null`', () => {
    expect(kt(ifInline)).toContain('!= null')
    expect(kt(ifCompLevel)).toContain('!= null')
  })

  // Boolean conditions are never wrapped — guards against over-firing.
  it('Swift: a boolean ternary / `if` is NOT wrapped', () => {
    expect(sw(boolTernary)).not.toContain('!= nil')
    expect(sw(boolTernary)).not.toContain('== nil')
    expect(sw(ifBool)).not.toContain('!= nil')
  })
  it('Kotlin: a boolean ternary / `if` is NOT wrapped', () => {
    expect(kt(boolTernary)).not.toContain('!= null')
    expect(kt(ifBool)).not.toContain('!= null')
  })

  // Real proof: negated render conditions + an inline-optional `if` COMPILE.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: negated conditions + an inline-optional `if` TYPECHECK against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(sw(proof))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
