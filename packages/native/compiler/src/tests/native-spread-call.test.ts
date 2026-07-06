// Call-argument spreads (`f(...args)` / `o.h(...args)`) — silent MIS-EMIT
// → NAMED warning.
//
// A spread ARGUMENT in a call reaches the expr emitter's `case 'spread'`
// fallthrough. Pre-fix that returned the bare argument, so `f(...xs)`
// emitted `f(xs)` — passing the ARRAY as ONE scalar arg. Neither Swift nor
// Kotlin has a variadic call-spread, so the emit is uncompilable, and it
// carried ZERO warnings — a genuine silent-drop.
//
// The fix warns at the emitter (NOT parse): the parser can't distinguish a
// call-argument spread from an array-ELEMENT spread — both are
// `SpreadElement` — so the disambiguating context only exists downstream.
// Every legitimate spread consumer (array-literal concat, object
// partial-update `.copy`, `Math.max`/`Math.min`) extracts its spread BEFORE
// emitting, so ONLY a genuinely-unhandled call-arg spread routes through
// `case 'spread'`. The controls below prove those consumers still lower
// (no warning) — the warning fires ONLY for the call-arg shape.
//
// Bisect-verified by reverting the `_emitWarnings.push(...)` lines in both
// emitters' `case 'spread'` — the call-arg spread emits `f(xs)` silently
// and the warning disappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SPREAD_CALL_SHAPES: Record<string, string> = {
  'function call f(...xs)': `export function App() { function f(a: number, b: number) { return a + b }; const xs = [1, 2]; const r = f(...xs); return <Text>{String(r)}</Text> }`,
  'method call o.h(...xs)': `export function App() { const o = { h(a: number) { return a } }; const xs = [1]; const r = o.h(...xs); return <Text>{String(r)}</Text> }`,
}

// Shapes whose spread IS faithfully lowered elsewhere — must NOT warn.
const CONTROL_SHAPES: Record<string, string> = {
  'array-literal spread [...a, x]': `export function App() { const a = [1, 2]; const b = [...a, 3]; return <Text>{String(b)}</Text> }`,
  'mid-array spread [x, ...a, y]': `export function App() { const a = [2]; const b = [1, ...a, 3]; return <Text>{String(b)}</Text> }`,
  'object partial-update {...t, b}': `export function App() { const t = { a: 1 }; const u = { ...t, b: 2 }; return <Text>{String(u.b)}</Text> }`,
  'Math.max(...arr)': `export function App() { const arr = [1, 2, 3]; const m = Math.max(...arr); return <Text>{String(m)}</Text> }`,
  'Math.min(...arr)': `export function App() { const arr = [1, 2, 3]; const m = Math.min(...arr); return <Text>{String(m)}</Text> }`,
  'signal-array spread set': `export function App() { const items = signal<number[]>([1]); const add = () => items.set([...items(), 2]); return <Text onPress={add}>{String(items())}</Text> }`,
}

const isSpreadWarn = (w: string): boolean => w.includes('Spread arguments')

describe('call-argument spreads — NAMED warning (was a silent array-as-scalar mis-emit)', () => {
  for (const [name, src] of Object.entries(SPREAD_CALL_SHAPES)) {
    it(`${name}: warns NAMED on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          (out.warnings ?? []).some(isSpreadWarn),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(true)
      }
    })
  }

  for (const [name, src] of Object.entries(CONTROL_SHAPES)) {
    it(`control — ${name}: still lowers, no spread warning`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          (out.warnings ?? []).some(isSpreadWarn),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(false)
      }
    })
  }
})
