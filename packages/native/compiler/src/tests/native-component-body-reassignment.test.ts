// Component-body TOP-LEVEL reassignment (`let a = 1; a = 5;` at the component
// top level) — was a silent SEMANTIC drop → now a NAMED warning.
//
// The component-body walker emits declarations + the return JSX; components run
// ONCE, and a setup-time statement can't be threaded into the SwiftUI `var body`
// / Compose fn body without a ComponentIR body-statement field (a larger
// change). A top-level reassignment is an `ExpressionStatement` whose expression
// is an `AssignmentExpression` (`a = 5` / `a += 2`) or `UpdateExpression`
// (`a++`) — NOT a CallExpression, so it fell past the bare-call warn branch into
// the intentional no-op drop meant for harmless `void x` discards. A
// reassignment has a REAL effect, so dropping it silently was a semantic bug
// (the render used the initial value). Now it's a NAMED warning.
//
// CRITICAL: harmless `void x` / bare-identifier / unary / logical discards
// (common in fixtures to mark values used — rx-full has 20 `void` refs) MUST
// stay silent — warning on them was a documented over-eager regression. Only
// genuine reassignments warn.
//
// Bisect-verified by reverting the AssignmentExpression/UpdateExpression branch
// — the reassignment silently drops again and the warning disappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const hasReassignWarn = (ws: readonly string[]): boolean =>
  ws.some((w) => w.includes('top-level reassignment'))

describe('component-body top-level reassignment — NAMED warning (was a silent semantic drop)', () => {
  for (const [name, src] of [
    ['plain `a = 5`', `export function App(){ let a = 1; a = 5; return <Text>{String(a)}</Text> }`],
    ['compound `a += 2`', `export function App(){ let a = 1; a += 2; return <Text>{String(a)}</Text> }`],
    ['update `a++`', `export function App(){ let a = 1; a++; return <Text>{String(a)}</Text> }`],
  ] as const) {
    it(`${name} warns NAMED on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          hasReassignWarn(out.warnings ?? []),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(true)
      }
    })
  }

  for (const [name, src] of [
    ['`void x` discard', `export function App(){ const x = 1; void x; return <Text>{String(x)}</Text> }`],
    ['bare identifier ref', `export function App(){ const x = 1; x; return <Text>{String(x)}</Text> }`],
  ] as const) {
    it(`control — ${name} stays SILENT (no reassignment warning)`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          hasReassignWarn(out.warnings ?? []),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(false)
      }
    })
  }
})
