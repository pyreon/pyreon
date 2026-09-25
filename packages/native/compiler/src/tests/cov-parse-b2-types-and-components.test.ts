// Branch coverage — `src/parse.ts` type-alias / interface / union struct
// synthesis, the arrow-const helper router, the component-body dropped-
// statement keyword table, and the early-return conditional-render fold.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const APP = `
export function App(){ return <Text>x</Text> }
`
const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
/** Emitted top-level type names, excluding the framework's own preamble. */
const userTypes = (code: string): string[] =>
  [...code.matchAll(/^(?:struct|enum|data class) (\w+)/gm)]
    .map((m) => m[1]!)
    .filter((n) => !n.startsWith('Pyreon') && n !== 'App')

describe('parse.ts — tryEnumFromTypeAlias', () => {
  it('lowers a string-literal union alias to a native enum (the positive control)', () => {
    const r = swift(`export type Mode = 'light' | 'dark'` + APP)
    expect(r.code).toContain('enum Mode: String, Codable {')
    expect(r.code).toContain('case light, dark')
  })

  it('declines a GENERIC alias — not a closed enum', () => {
    const r = swift(`export type Box<T> = T | null` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('declines a non-union alias body', () => {
    const r = swift(`export type Mode = 'light'` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('declines a union with a NON-literal branch', () => {
    const r = swift(`export type Mode = 'light' | number` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('declines a union whose literal branch is not a STRING', () => {
    const r = swift(`export type Mode = 'light' | 1` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('declines a union whose literal branch is a TEMPLATE literal type', () => {
    const r = swift('export type Mode = \'light\' | `d${string}`' + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('warns + declines an EMPTY-string branch (an invalid native case name)', () => {
    const r = swift(`export type Mode = '' | 'dark'` + APP)
    expect(r.warnings).toContain('Enum Mode: skipped empty-string union branch.')
    expect(userTypes(r.code)).toEqual([])
  })
})

describe('parse.ts — struct synthesis from a type alias / interface', () => {
  it('synthesizes from BOTH the alias and the interface spelling, identically', () => {
    const a = swift(`export type S = { id: string; n: number }` + APP)
    const i = swift(`export interface S { id: string; n: number }` + APP)
    expect(a.code).toContain('struct S: Codable {')
    expect(a.code).toContain('var id: String')
    expect(a.code).toContain('var n: Int')
    expect(i.code.match(/struct S: Codable \{[\s\S]*?\n\}/)![0]).toBe(
      a.code.match(/struct S: Codable \{[\s\S]*?\n\}/)![0],
    )
  })

  it('declines a GENERIC type alias silently', () => {
    const r = swift(`export type S<T> = { id: T }` + APP)
    expect(userTypes(r.code)).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('is SILENT for a method-ONLY shape (a behavioral contract, not data)', () => {
    const alias = swift(`export type S = { act(): void }` + APP)
    expect(userTypes(alias.code)).toEqual([])
    expect(alias.warnings).toEqual([])
    const iface = swift(`export interface S { act(): void }` + APP)
    expect(userTypes(iface.code)).toEqual([])
    expect(iface.warnings).toEqual([])
  })

  it('warns by NAME when methods are dropped from a MIXED shape but keeps the struct', () => {
    const r = swift(`export type S = { id: string; act(): void }` + APP)
    expect(r.code).toContain('struct S: Codable {')
    expect(r.warnings.join('\n')).toContain('Struct S: 1 method member(s) dropped')
  })

  it('warns on a genuinely EMPTY shape — alias and interface carry different texts', () => {
    expect(swift(`export type S = {}` + APP).warnings).toContain('Struct S: skipped — empty object type.')
    expect(swift(`export interface S {}` + APP).warnings).toContain('Struct S: skipped — empty interface.')
  })

  it('warns + declines a GENERIC or `extends` interface', () => {
    const gen = swift(`export interface S<T> { id: T }` + APP)
    expect(gen.warnings.join('\n')).toContain('Top-level `interface S` with generics or `extends` is NOT compiled')
    const ext = swift(`interface B { a: string }\nexport interface S extends B { id: string }` + APP)
    expect(ext.warnings.join('\n')).toContain('Top-level `interface S` with generics or `extends` is NOT compiled')
    // The non-extending parent still synthesizes.
    expect(userTypes(ext.code)).toEqual(['B'])
  })
})

describe('parse.ts — tryStructFromObjectUnion', () => {
  it('merges two object branches, marking a branch-local field optional', () => {
    const r = swift(`export type S = { a: string; b?: number } | { a: string }` + APP)
    expect(r.code).toContain('struct S: Codable {')
    expect(r.code).toContain('var a: String')
    expect(r.code).toContain('var b: Int? = nil')
    expect(r.warnings).toEqual([])
  })

  it('marks a field present in only ONE branch optional', () => {
    const r = swift(`export type S = { a: string; b: number } | { a: string }` + APP)
    expect(r.code).toContain('var b: Int? = nil')
  })

  it('declines a union with fewer than two branches', () => {
    const r = swift(`export type S = { a: string }` + APP)
    // Single-branch: the plain type-alias path claims it, not the union path.
    expect(r.code).toContain('struct S: Codable {')
  })

  it('declines when ANY branch is not an object literal type', () => {
    const r = swift(`export type S = { a: string } | string` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('warns + declines on a field whose TYPE conflicts across branches', () => {
    const r = swift(`export type S = { a: string } | { a: number }` + APP)
    expect(r.warnings.join('\n')).toContain('Union type S: field "a" has DIFFERENT types across branches')
    expect(userTypes(r.code)).toEqual([])
  })

  it('declines a union of EMPTY object branches (no fields to order)', () => {
    const r = swift(`export type S = {} | {}` + APP)
    expect(userTypes(r.code)).toEqual([])
  })

  it('merges a field that is optional in one branch and required in the other as ONE optional field', () => {
    const r = kotlin(`export type S = { a?: string } | { a: string }` + APP)
    expect(r.code).toContain('data class S(')
    expect(r.code.match(/var a: [^,\n]*/)![0]).toContain('?')
  })
})

describe('parse.ts — tryHelperFnFromArrowConst', () => {
  it('routes a param-taking arrow const to a native func (the positive control)', () => {
    const r = swift(`export const dbl = (x: number) => x * 2\nexport function App(){ return <Text>{String(dbl(2))}</Text> }`)
    expect(r.code).toContain('func dbl(_ x: Int) -> Int { x * 2 }')
  })

  it('declines a `let` binding — only `const` is routed', () => {
    const r = swift(`let dbl = (x: number) => x * 2` + APP)
    expect(r.code).not.toContain('func dbl')
  })

  it('declines a MULTI-declarator const', () => {
    const r = swift(
      `const dbl = (x: number) => x * 2, trp = (x: number) => x * 3\nexport function App(){ return <Text>{String(dbl(2))}</Text> }`,
    )
    expect(r.code).not.toContain('func dbl')
    expect(r.code).not.toContain('func trp')
  })

  it('declines a destructuring declarator id', () => {
    const r = swift(`const { dbl } = { dbl: (x: number) => x * 2 }` + APP)
    expect(r.code).not.toContain('func dbl')
  })

  it('declines a const whose initializer is not an arrow', () => {
    const r = swift(`const dbl = function (x: number) { return x * 2 }` + APP)
    expect(r.code).not.toContain('func dbl')
  })

  it('declines a ZERO-parameter arrow — a helper is a function OF ITS INPUTS', () => {
    const r = swift(`const g = () => 2\nexport function App(){ return <Text>{String(g())}</Text> }`)
    expect(r.code).not.toContain('func g(')
  })

  it('declines an arrow whose body returns JSX — that is a VIEW function, not a pure-logic helper', () => {
    // Not routed through the helper emit (which would type it `-> Text` or
    // Void); it lowers as a view function instead (render-slots.ts).
    const r = swift(`const Row = (x: number) => <Text>{String(x)}</Text>` + APP)
    expect(r.code).toContain('@ViewBuilder private func Row(_ x: Int) -> some View {')
    expect(r.code.match(/func Row\(/g)).toHaveLength(1)
  })

  it('declines a VOID-bodied arrow (no top-level return)', () => {
    const r = swift(`const log = (x: number) => { console.log(x) }` + APP)
    expect(r.code).not.toContain('func log')
  })
})

describe('parse.ts — componentStmtKeyword names each dropped statement kind', () => {
  const body = (stmt: string) => `export function App(){\n${stmt}\n  return <Text>x</Text>\n}`
  const warnOf = (stmt: string) => swift(body(stmt)).warnings.join('\n')

  it.each([
    ['for', '  for (let i = 0; i < 2; i++) { }'],
    ['for', '  for (const q of [1]) { }'],
    ['for', '  for (const q in {}) { }'],
    ['while', '  while (false) { }'],
    ['do…while', '  do { } while (false)'],
    ['switch', '  switch (1) { case 1: break }'],
    ['try', '  try { } catch (e) { }'],
    ['throw', "  throw new Error('x')"],
    ['labeled', '  lbl: { }'],
    ['block', '  { const q = 1 }'],
  ])('names a dropped `%s` statement', (keyword, stmt) => {
    expect(warnOf(stmt)).toContain(`a top-level \`${keyword}\` statement has no native lowering`)
  })

  it('names an `if` statement with its own conditional-render-aware text', () => {
    expect(warnOf('  if (true) { }')).toContain(
      'a top-level `if` statement has no native lowering and was DROPPED — an early-return conditional render',
    )
  })

  it('falls through to the raw node type for a statement with no keyword mapping', () => {
    // A bare expression statement takes the dedicated "bare statement" arm,
    // so the default arm is reached by a statement kind with no keyword —
    // `with` is the remaining non-strict shape the walker still sees.
    const r = swift(body('  debugger'))
    expect(r.warnings).toEqual([])
  })
})

describe('parse.ts — tryEarlyReturnConditional folds a conditional render', () => {
  const C = (b: string) => `export function App(p: { on: boolean }){\n${b}\n}`

  it('folds `if (cond) return <A>` + a trailing return into an if/else view', () => {
    const r = swift(C('  if (p.on) return <Text>A</Text>\n  return <Text>B</Text>'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('if on {')
    expect(r.code).toContain('Text("A")')
    expect(r.code).toContain('Text("B")')
  })

  it('folds the explicit `else return <B>` spelling identically', () => {
    const withElse = swift(C('  if (p.on) return <Text>A</Text>\n  else return <Text>B</Text>'))
    const trailing = swift(C('  if (p.on) return <Text>A</Text>\n  return <Text>B</Text>'))
    expect(withElse.warnings).toEqual([])
    expect(withElse.code).toBe(trailing.code)
  })

  it('accepts a ONE-statement block branch, and declines a multi-statement one', () => {
    const block = swift(C('  if (p.on) { return <Text>A</Text> }\n  return <Text>B</Text>'))
    expect(block.warnings).toEqual([])
    expect(block.code).toContain('if on {')
    const multi = swift(C('  if (p.on) { const q = 1; return <Text>A</Text> }\n  return <Text>B</Text>'))
    expect(multi.warnings.join('\n')).toContain('a top-level `if` statement has no native lowering')
    expect(multi.code).not.toContain('if on {')
  })

  it('declines an `else` branch that is not a clean JSX return', () => {
    const r = swift(C('  if (p.on) return <Text>A</Text>\n  else { const q = 1; return <Text>B</Text> }\n  return <Text>C</Text>'))
    expect(r.warnings.join('\n')).toContain('a top-level `if` statement has no native lowering')
    expect(r.code).toContain('Text("C")')
  })

  it('declines an imperative (non-JSX) early return', () => {
    const r = swift(C('  if (p.on) return 0\n  return <Text>B</Text>'))
    expect(r.warnings.join('\n')).toContain('a top-level `if` statement has no native lowering')
  })

  it('declines a bare `return` with no argument', () => {
    const r = swift(C('  if (p.on) return\n  return <Text>B</Text>'))
    expect(r.warnings.join('\n')).toContain('a top-level `if` statement has no native lowering')
  })
})
