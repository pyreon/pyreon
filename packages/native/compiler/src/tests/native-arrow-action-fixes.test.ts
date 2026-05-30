// Round-1 audit fixes — two arrow-action emit bugs surfaced during the
// Button.disabled verify cycle.
//
// Bug 1 — empty arrow body `() => {}`:
// The parser converts a BlockStatement body with no expression/return
// statement into `body: { kind: 'literal', value: '' }` (see parse.ts
// ArrowFunctionExpression). The emit then renders that as `{ "" }` —
// a CLOSURE RETURNING AN EMPTY STRING. Both Swift's `() -> Void`
// action slot and Compose's `() -> Unit` onClick contract reject this
// as a type error. Fix: emit `{ }` (truly empty closure) for the
// empty-arrow-body shape.
//
// Bug 2 — `function fnName() {}` declarations in component body:
// Previously the body walker only handled `VariableDeclaration` and
// `ReturnStatement` — `FunctionDeclaration` nodes silently fell
// through. `function del() {}` never landed in `_functionNames`,
// causing two downstream emit failures:
//   (a) `() => del()` (CallExpression body) — the call branch's
//       "disambiguate signal-read vs function-call" heuristic for
//       zero-arg identifier calls would drop the parens for unknown
//       names, emitting `{ del }` (closure RETURNING the function
//       reference, never CALLING it).
//   (b) `<Button onPress={del}>` (bare identifier handler) — the
//       `resolveFunctionHandler` path checks `_functionNames`; without
//       a match it falls through to plain emit (also `{ del }`).
// Both shapes silently turned the button into a no-op. Fix: extend
// the parser's body walker to recognize FunctionDeclaration nodes
// and route them through the existing `tryFunctionDecl` helper
// (which accepts both arrow-expression and function-declaration
// shapes — both carry `.params` / `.returnType` / `.body`).
//
// Bisect-verified per-bug: reverting either fix alone breaks the
// corresponding specs; both restored → all pass.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Round-1 audit — Bug 1: empty arrow body `() => {}` emits `{ }`, not `{ "" }`', () => {
  it('Swift: <Button onPress={() => {}}> emits `Button("X") { }` (truly empty closure)', () => {
    const out = transform(
      `export function App() { return <Button onPress={() => {}}>Save</Button> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('Button("Save") { }')
    // The OLD broken shape — a closure returning empty String.
    expect(out).not.toContain('Button("Save") { "" }')
  })

  it('Kotlin: <Button onPress={() => {}}> emits `onClick = { }` (truly empty lambda)', () => {
    const out = transform(
      `export function App() { return <Button onPress={() => {}}>Save</Button> }`,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('Button(onClick = { }) {')
    expect(out).not.toContain('Button(onClick = { "" }) {')
  })

  it('Swift: empty <Toggle onChange={() => {}}> handler emits empty Binding setter', () => {
    // Verification belt — other primitives that flow through
    // emitSwiftAction also benefit from the empty-arrow fix.
    const out = transform(
      `
      import { signal } from '@pyreon/reactivity'
      export function App() {
        const on = signal(false)
        return <Toggle value={on} onChange={() => {}} />
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).not.toContain('"" }')
  })
})

describe('Round-1 audit — Bug 2: `function fnName() {}` registers as function decl', () => {
  it('Swift: `() => del()` (CallExpression body) emits `{ del() }` not `{ del }`', () => {
    const out = transform(
      `
      export function App() {
        function del() {}
        return <Button onPress={() => del()}>X</Button>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain('Button("X") { del() }')
    // The OLD broken shape — closure returning the function reference.
    expect(out).not.toContain('Button("X") { del }')
  })

  it('Swift: bare `<Button onPress={del}>` (identifier handler) emits `{ del() }`', () => {
    const out = transform(
      `
      export function App() {
        function del() {}
        return <Button onPress={del}>X</Button>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain('Button("X") { del() }')
  })

  it('Kotlin: `() => del()` (CallExpression body) emits `{ del() }` not `{ del }`', () => {
    const out = transform(
      `
      export function App() {
        function del() {}
        return <Button onPress={() => del()}>X</Button>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('Button(onClick = { del() })')
  })

  it('Kotlin: bare `<Button onPress={del}>` (identifier handler) emits `{ del() }`', () => {
    const out = transform(
      `
      export function App() {
        function del() {}
        return <Button onPress={del}>X</Button>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('Button(onClick = { del() })')
  })

  it('Swift: function-declaration registers as a `private func` in the View struct (mirror of const-arrow form)', () => {
    const out = transform(
      `
      export function App() {
        function del() {}
        return <Button onPress={del}>X</Button>
      }
      `,
      { target: 'swift' },
    ).code
    // The function decl itself should emit as a struct method, same
    // shape as the existing const-arrow path produces.
    expect(out).toContain('private func del()')
  })
})
