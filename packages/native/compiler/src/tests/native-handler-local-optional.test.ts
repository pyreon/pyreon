// Zero-silent-drops (P1) — closes the LAST optional-truthiness gap (#1924 +
// #1928 completion). #1928 lowered optional conditions at every SITE (ternary /
// `&&` / `<Show>` / `if` / `while`) but the `if`/`while` lowering only fired for
// conditions whose optionality `inferType` could RESOLVE — an inline `if
// (todos.find(…))` or a component-level `if (optionalComputed())`. A handler-
// LOCAL var was the hole:
//
//   const onTap = () => {
//     const t = todos.find(x => x.id === id)   // handler-local optional
//     if (t) { … }                             // emitted bare `if t {` → FAIL
//   }
//
// Handler-locals weren't seeded into the infer ctx, so `inferType(t)` returned
// `unknown` there and the condition stayed un-lowered (a clean-parse but
// uncompilable silent mis-emit — the find-then-check idiom in nearly every CRUD
// handler).
//
// Fixed by `seedHandlerLocals(stmts, ctx)` (infer-type.ts) — walks a handler /
// function body's `const`/`let` statements IN ORDER, infers each init, and
// seeds `ctx.locals` (restored after, scoped to the body). Wired into BOTH
// statement-body emit paths: inline handlers (`emitSwift/KotlinAction`) AND
// named handler / function decls (`const onTap = () => {…}`, the component-level
// function-decl emit). General: it seeds the handler-local TYPE ENVIRONMENT, so
// any later type-dependent emit in the body resolves locals — conditions are
// the first beneficiary.
//
// Bisect-load-bearing: neuter `seedHandlerLocals` to a no-op (return without
// seeding) → the handler-local emit + compile specs fail; the boolean control
// stays green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const H =
  `import { signal } from '@pyreon/reactivity'\n` +
  `import { Stack, Button } from '@pyreon/primitives'\n`

// NAMED handler — `const onTap = () => { … }` (component-level arrow decl).
const named = (body: string) => `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const onTap = () => { ${body} }
  return (<Stack><Button onPress={onTap}>x</Button></Stack>)
}`
// INLINE handler — `onPress={() => { … }}` (action-closure emit).
const inline = (body: string) => `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  return (<Stack><Button onPress={() => { ${body} }}>x</Button></Stack>)
}`

const findIf = `const t = td().find(x => x.id === 1); if (t) { td.set([]) }`
const findIfNot = `const t = td().find(x => x.id === 1); if (!t) { td.set([]) }`
const boolIf = `const n = td().length; if (n > 0) { td.set([]) }`

// Compile proof — named handler (positive + else) + inline handler + a local
// chain, all in one component.
const proof = `${H}export function App(){
  const td = signal([{ id: 1, done: false }])
  const onTap = () => {
    const t = td().find(x => x.id === 1)
    const u = t
    if (u) { td.set([]) } else { td.set([{ id: 9, done: true }]) }
  }
  return (<Stack>
    <Button onPress={onTap}>named</Button>
    <Button onPress={() => { const t = td().find(x => x.id === 2); if (!t) { td.set([]) } }}>inline</Button>
  </Stack>)
}`

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

describe('P1 — handler-LOCAL optional in a statement condition lowers (completes optional-truthiness)', () => {
  it('Swift: named-handler `if (localOpt)` lowers to `!= nil`', () => {
    expect(sw(named(findIf))).toContain('!= nil')
  })
  it('Swift: named-handler `if (!localOpt)` lowers to `== nil`', () => {
    expect(sw(named(findIfNot))).toContain('== nil')
  })
  it('Swift: inline-handler `if (localOpt)` lowers to `!= nil`', () => {
    expect(sw(inline(findIf))).toContain('!= nil')
  })
  it('Kotlin: named + inline handler-local conditions lower to `!= null` / `== null`', () => {
    expect(kt(named(findIf))).toContain('!= null')
    expect(kt(named(findIfNot))).toContain('== null')
    expect(kt(inline(findIf))).toContain('!= null')
  })

  // Boolean handler-local condition must NOT be wrapped.
  it('Swift/Kotlin: a boolean handler-local `if` is NOT wrapped', () => {
    expect(sw(named(boolIf))).not.toContain('!= nil')
    expect(kt(named(boolIf))).not.toContain('!= null')
  })

  // Real proof: named + inline handler-local conditions (incl. a chain + an
  // else branch + the negated form) COMPILE.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: handler-local optional conditions TYPECHECK against real SwiftUI',
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
