// Component-body TOP-LEVEL control flow (`for` / `for…of` / `for…in` /
// `while` / `do…while` / `switch` / `if` / `try` / `throw` at the
// component top level) — was a silent SEMANTIC drop → now a NAMED warning
// (the "zero silent failures" trustworthy-compiler pass).
//
// The component-body walker lowers only VariableDeclaration /
// FunctionDeclaration / ReturnStatement / ExpressionStatement; every other
// statement type fell through the if/else chain and VANISHED from the emit
// with no diagnostic — the loop/branch never ran on device and the render
// used stale values. A component body emits declarations + the return JSX
// (it runs ONCE); imperative control flow has no body-statement slot yet,
// but `parseStatement` DOES lower loops/switch inside a helper-function
// body (a param-taking helper is the verified escape hatch). Now a
// catch-all names the dropped statement instead of dropping it silently.
//
// CRITICAL: a clean component (declarations + return JSX) MUST stay
// silent — the catch-all only fires for genuinely-unhandled statement
// types, and type-only decls / no-ops are allow-listed.
//
// Bisect-verified by reverting the catch-all `else` branch — each control
// flow statement silently drops again and the warning disappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const hasDropWarn = (ws: readonly string[]): boolean =>
  ws.some((w) => w.includes('has no native lowering and was DROPPED'))

const COMPONENT = (body: string) =>
  `export function App(){ let r = 0; ${body}; return <Text>{String(r)}</Text> }`

describe('component-body control flow — NAMED warning (was a silent semantic drop)', () => {
  for (const [name, body] of [
    ['c-style for', 'for (let i = 0; i < 3; i++) { r += i }'],
    ['for…of', 'const xs = [1, 2, 3]; for (const x of xs) { r += x }'],
    ['for…in', 'const o = { a: 1 }; for (const k in o) { r += 1 }'],
    ['while', 'let i = 0; while (i < 3) { r += i; i++ }'],
    ['do…while', 'let i = 0; do { r += i; i++ } while (i < 3)'],
    ['switch', 'switch (2) { case 1: r = 1; break; default: r = 0 }'],
    ['if', 'if (r < 1) { r = 5 }'],
    ['try', 'try { r = 1 } catch (e) { r = 2 }'],
  ] as const) {
    it(`${name} warns NAMED on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(COMPONENT(body), { target })
        expect(hasDropWarn(out.warnings ?? []), `${target}: ${JSON.stringify(out.warnings)}`).toBe(
          true,
        )
      }
    })
  }

  it('names the specific statement keyword (`for`, `switch`, …)', () => {
    const forWarn = transform(COMPONENT('for (let i = 0; i < 3; i++) { r += i }'), {
      target: 'swift',
    }).warnings.find((w) => w.includes('DROPPED'))
    expect(forWarn).toContain('`for`')
    const switchWarn = transform(COMPONENT('switch (2) { case 1: r = 1; break }'), {
      target: 'swift',
    }).warnings.find((w) => w.includes('DROPPED'))
    expect(switchWarn).toContain('`switch`')
  })

  for (const [name, src] of [
    ['clean component', 'export function App(){ const r = 1; return <Text>{String(r)}</Text> }'],
    [
      'declarations + return only',
      'export function App(){ const a = 1; const b = a + 1; return <Text>{String(b)}</Text> }',
    ],
  ] as const) {
    it(`control — ${name} stays SILENT (no drop warning)`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(hasDropWarn(out.warnings ?? []), `${target}: ${JSON.stringify(out.warnings)}`).toBe(
          false,
        )
      }
    })
  }
})
