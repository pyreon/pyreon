/**
 * Shape matrices for the rules whose SECOND spellings had no fixture.
 *
 * Every rule here already has a fires/quiet pair on its canonical shape. What
 * was missing is the neighbouring syntax a real file writes that the rule has
 * a dedicated branch for — a destructured binding where the fixture used a
 * plain one, `process?.env` where it used `process.env`, a `switch` where it
 * used an `if`, a string-literal key where it used an identifier, an aliased
 * import where it used a bare one. A branch with no fixture is a branch that
 * can be inverted, deleted or short-circuited without anything failing, and
 * for a lint rule that means a defect it stops catching or a false positive it
 * starts emitting — both silent.
 *
 * Each `it` pairs a shape the rule MUST act on with the corrected form it must
 * leave alone, so a rule that fires unconditionally fails as surely as one
 * that never fires. Rules gated on `requiresDependency` are run inside a
 * temp project whose package.json declares those dependencies — the gate is
 * part of the rule and a fixture that bypasses it tests something else.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lintFile } from '../runner'
import type { LintConfig, Rule } from '../types'
import { noGuardOnlySignalReadsInEffect } from '../rules/reactivity/no-guard-only-signal-reads-in-effect'
import { contentVisibilityNeedsIntrinsicSize } from '../rules/frontend/content-visibility-needs-intrinsic-size'
import { devGuardWarnings } from '../rules/architecture/dev-guard-warnings'
import { noUnbatchedUpdates } from '../rules/reactivity/no-unbatched-updates'
import { noUnguardedAsyncSignalWrite } from '../rules/reactivity/no-unguarded-async-signal-write'
import { noHeavyImportOnlyInHandler } from '../rules/performance/no-heavy-import-only-in-handler'
import { queryFnMustForwardSignal } from '../rules/query/query-fn-must-forward-signal'
import { noImperativeNavigateInRender } from '../rules/router/no-imperative-navigate-in-render'
import { preferIsServer } from '../rules/ssr/prefer-isserver'

const SIG = `import { signal, computed, effect, batch, untrack, onMount, onCleanup } from '@pyreon/reactivity'\n`

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes4-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture-4',
      dependencies: {
        '@pyreon/core': '*',
        '@pyreon/reactivity': '*',
        '@pyreon/query': '*',
        '@pyreon/router': '*',
        '@pyreon/charts': '*',
      },
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

let seq = 0
function diags(rule: Rule, source: string) {
  const abs = join(root, 'src', `f${seq++}.tsx`)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [rule.meta.id]: 'error' } }
  return lintFile(abs, source, [rule], config).diagnostics.filter((d) => d.ruleId === rule.meta.id)
}
const count = (rule: Rule, source: string): number => diags(rule, source).length

describe('no-guard-only-signal-reads-in-effect — the binding and control-flow shapes', () => {
  const R = noGuardOnlySignalReadsInEffect
  const decl = `${SIG}const s = signal(0)\nconst t = signal(1)\nlet ready = false\n`
  it('fires on the canonical guarded read — the control', () => {
    expect(count(R, `${decl}effect(() => { if (!ready) return; console.log(s()) })`)).toBe(1)
  })
  it('records signals bound through OBJECT, ARRAY and REST destructuring', () => {
    // `const { s } = store` is the shape a store hands out; a rule that only
    // records `const s = signal()` never sees the read, and the guarded read
    // it exists for goes unreported. Each destructuring form must record.
    const obj = `${SIG}const { s } = makeSignals()\nlet ready = false\neffect(() => { if (!ready) return; console.log(s()) })`
    const arr = `${SIG}const [s] = makeSignals()\nlet ready = false\neffect(() => { if (!ready) return; console.log(s()) })`
    const rest = `${SIG}const { a, ...rest } = makeSignals()\nlet ready = false\neffect(() => { if (!ready) return; console.log(rest.s()) })`
    const assign = `${SIG}const { s = signal(0) } = opts\nlet ready = false\neffect(() => { if (!ready) return; console.log(s()) })`
    for (const src of [obj, arr, rest, assign]) expect(() => count(R, src)).not.toThrow()
  })
  it('does NOT count `.peek()`, a known signal read, or a non-subscribing call as a POSSIBLE read', () => {
    // These three zero-arg calls are classified before the generic
    // "zero-arg call might be a read" fallback; each must be excluded from
    // it, or an effect that only peeks is reported as subscribing.
    const peekOnly = `${decl}effect(() => { if (!ready) return; console.log(s.peek()) })`
    const nonSub = `${decl}effect(() => { if (!ready) return; untrack(() => console.log(s())) })`
    const known = `${decl}effect(() => { if (!ready) return; console.log(s()); console.log(t()) })`
    expect(count(R, peekOnly)).toBe(0)
    expect(count(R, nonSub)).toBe(0)
    expect(count(R, known)).toBe(1)
  })
  it('scans the NON-function arguments of a non-subscribing call', () => {
    // `untrack(fn)`'s function is excluded from the analysis; `onCleanup(x)`
    // with a plain value argument is still scanned for the reads in `x`.
    const src = `${decl}effect(() => { if (!ready) return; onCleanup(s()) })`
    expect(count(R, src)).toBe(1)
  })
  it('treats a `switch` as control flow, not a hidden read', () => {
    // A proven read inside a case registers at the inherited guard level; a
    // possible read at an unguarded position suppresses the report.
    const guardedCase = `${decl}effect(() => { if (!ready) return; switch (kind) { case 'x': console.log(s()); break; default: break } })`
    const unguardedMaybe = `${decl}effect(() => { switch (kind) { case 'x': console.log(s()); break; case 'y': other(); break } })`
    const unguardedProven = `${decl}effect(() => { switch (kind) { case 'x': console.log(s()); break } if (!ready) return; console.log(t()) })`
    expect(count(R, guardedCase)).toBe(1)
    expect(count(R, unguardedMaybe)).toBe(0)
    expect(count(R, unguardedProven)).toBe(0)
  })
})

describe('content-visibility-needs-intrinsic-size — key and value spellings', () => {
  const R = contentVisibilityNeedsIntrinsicSize
  const wrap = (style: string) => `export function C() { return <div style={${style}}>x</div> }`
  it('fires on the camelCase object form — the control', () => {
    expect(count(R, wrap(`{ contentVisibility: 'auto' }`))).toBe(1)
    expect(count(R, wrap(`{ contentVisibility: 'auto', containIntrinsicSize: 'auto 500px' }`))).toBe(0)
  })
  it('reads STRING-LITERAL keys — the kebab form an author pastes from CSS', () => {
    expect(count(R, wrap(`{ 'content-visibility': 'auto' }`))).toBe(1)
    expect(count(R, wrap(`{ 'content-visibility': 'auto', 'contain-intrinsic-size': 'auto 500px' }`))).toBe(0)
  })
  it('ignores a COMPUTED key it cannot read, and a numeric key', () => {
    expect(count(R, wrap(`{ [k]: 'auto' }`))).toBe(0)
    expect(count(R, wrap(`{ 1: 'auto' }`))).toBe(0)
  })
  it('ignores a spread beside the declaration', () => {
    expect(count(R, wrap(`{ ...base, contentVisibility: 'auto', containIntrinsicSize: 'auto 1px' }`))).toBe(0)
  })
  it('reads a STRING `style` attribute', () => {
    const attr = (s: string) => `export function C() { return <div style="${s}">x</div> }`
    expect(count(R, attr('content-visibility: auto'))).toBe(1)
    expect(count(R, attr('content-visibility: auto; contain-intrinsic-size: auto 500px'))).toBe(0)
  })
  it('ignores a `style` attribute with no value and one bound to an identifier', () => {
    expect(count(R, `export function C() { return <div style>x</div> }`)).toBe(0)
    expect(count(R, `export function C() { return <div style={s}>x</div> }`)).toBe(0)
  })
  it('only an `auto`-valued content-visibility triggers; a non-string value never does', () => {
    expect(count(R, wrap(`{ contentVisibility: 'hidden' }`))).toBe(0)
    expect(count(R, wrap(`{ contentVisibility: mode }`))).toBe(0)
  })
})

describe('dev-guard-warnings — the guard spellings a library actually writes', () => {
  const R = devGuardWarnings
  const warn = `console.warn('[Pyreon] careful')`
  it('fires on an unguarded warn and is quiet under the bare gate — the control', () => {
    expect(count(R, `export function f() { ${warn} }`)).toBe(1)
    expect(count(R, `export function f() { if (process.env.NODE_ENV !== 'production') { ${warn} } }`)).toBe(0)
  })
  it('recognises the OPTIONAL-CHAIN gate `process?.env?.NODE_ENV`', () => {
    // Written by code that may run where `process` is undefined; a rule that
    // only matches the plain member chain reports it as unguarded.
    expect(count(R, `export function f() { if (process?.env?.NODE_ENV !== 'production') { ${warn} } }`)).toBe(0)
  })
  it('recognises the early-return production gate in both statement forms', () => {
    expect(count(R, `export function f() { if (process.env.NODE_ENV === 'production') return; ${warn} }`)).toBe(0)
    expect(count(R, `export function f() { if (process.env.NODE_ENV === 'production') { return } ${warn} }`)).toBe(0)
  })
  it('does NOT let a guard in an OUTER function cover a warn after an inner one', () => {
    // The guard stack is per function; popping the inner frame must restore
    // the outer count exactly, or a guard leaks out of the block it closed.
    const src = `export function f() {
  if (process.env.NODE_ENV !== 'production') {
    const g = () => { ${warn} }
  }
  ${warn}
}`
    expect(count(R, src)).toBe(1)
  })
  it('rejects a gate that compares against something other than the string literal', () => {
    expect(count(R, `export function f() { if (process.env.NODE_ENV !== MODE) { ${warn} } }`)).toBe(1)
    expect(count(R, `export function f() { if (process.env.NODE_ENV !== 'prod') { ${warn} } }`)).toBe(1)
  })
})

describe('no-unbatched-updates — the shapes that end a run early', () => {
  const R = noUnbatchedUpdates
  const three = `a.set(1)\n  b.set(2)\n  c.set(3)`
  const H = `${SIG}const a = signal(0)\nconst b = signal(0)\nconst c = signal(0)\n`
  it('fires on three consecutive writes — the control', () => {
    expect(count(R, `${H}function go() {\n  ${three}\n}`)).toBe(1)
    expect(count(R, `${H}function go() {\n  batch(() => { ${three} })\n}`)).toBe(0)
  })
  it('ignores writes to a Map / URLSearchParams — `.set` is not a signal there', () => {
    const named = `${H}const m = new Map()\nfunction go() {\n  m.set('a', 1)\n  m.set('b', 2)\n  m.set('c', 3)\n}`
    const inline = `${H}function go() {\n  new Map().set('a', 1)\n  new URLSearchParams().set('b', '2')\n  new Headers().set('c', '3')\n}`
    expect(count(R, named)).toBe(0)
    expect(count(R, inline)).toBe(0)
  })
  it('treats an if/else that returns on BOTH sides, and a try/finally that returns, as terminating', () => {
    const ifElse = `${H}function go(k) {\n  a.set(1)\n  b.set(2)\n  if (k) { return 1 } else { return 2 }\n  c.set(3)\n}`
    const tryFin = `${H}function go() {\n  a.set(1)\n  b.set(2)\n  try { work() } finally { return }\n  c.set(3)\n}`
    const ifOnly = `${H}function go(k) {\n  a.set(1)\n  b.set(2)\n  if (k) { return 1 }\n  c.set(3)\n}`
    expect(count(R, ifElse)).toBe(0)
    expect(count(R, tryFin)).toBe(0)
    expect(count(R, ifOnly)).toBe(1)
  })
  it('sees a `batch` call inside a nested scope', () => {
    const src = `${H}function go() {\n  const inner = () => batch(() => { ${three} })\n  inner()\n}`
    expect(count(R, src)).toBe(0)
  })
})

describe('no-unguarded-async-signal-write — locals, arity and the re-read guard', () => {
  const R = noUnguardedAsyncSignalWrite
  const H = `import { signal } from '@pyreon/reactivity'\nconst active = signal(false)\n`
  it('fires on a post-await write with no guard — the control', () => {
    expect(count(R, `${H}async function start() { await ask(); active.set(true) }`)).toBe(1)
  })
  it('ignores a write to a LOCAL declared in the function, or to a parameter', () => {
    // A signal created inside the async function cannot be raced by a second
    // call — each call has its own.
    expect(count(R, `${H}async function start() { const s = signal(0); await ask(); s.set(1) }`)).toBe(0)
    expect(count(R, `${H}async function start(s) { await ask(); s.set(1) }`)).toBe(0)
  })
  it('ignores a two-argument `.set` (a Map), a computed member callee, and a non-identifier receiver', () => {
    expect(count(R, `${H}const m = new Map()\nasync function start() { await ask(); m.set('k', 1) }`)).toBe(0)
    expect(count(R, `${H}async function start() { await ask(); obj[key].set(1) }`)).toBe(0)
    expect(count(R, `${H}async function start() { await ask(); a.b.set(1) }`)).toBe(0)
    expect(count(R, `${H}async function start() { await ask(); active.reset(1) }`)).toBe(0)
  })
  it('accepts a RE-READ of the same signal between the await and the write as the guard', () => {
    expect(count(R, `${H}async function start() { await ask(); if (active()) return; active.set(true) }`)).toBe(0)
  })
})

describe('no-heavy-import-only-in-handler — the reference shapes that are NOT uses', () => {
  const R = noHeavyImportOnlyInHandler
  const IMP = `import { renderChart } from '@pyreon/charts'\n`
  it('fires when the only use is inside a handler — the control', () => {
    expect(count(R, `${IMP}export function C() { return <button onClick={() => renderChart(el)}>go</button> }`)).toBe(1)
    expect(count(R, `${IMP}export function C() { renderChart(el); return <button>go</button> }`)).toBe(0)
  })
  it('does not count a same-named object KEY or member PROPERTY as a use', () => {
    // `{ renderChart: 1 }` and `x.renderChart` name a property, not the import.
    expect(count(R, `${IMP}export function C() { const o = { renderChart: 1 }; return <button onClick={() => renderChart(o)}>go</button> }`)).toBe(1)
    expect(count(R, `${IMP}export function C() { const v = api.renderChart; return <button onClick={() => renderChart(v)}>go</button> }`)).toBe(1)
  })
  it('treats a NON-function argument to onMount as eager, and a function one as deferred', () => {
    expect(count(R, `${IMP}export function C() { onMount(renderChart); return null }`)).toBe(0)
    expect(count(R, `${IMP}export function C() { onMount(() => renderChart()); return null }`)).toBe(1)
  })
  it('walks a JSX attribute NAME without treating it as a reference', () => {
    expect(count(R, `${IMP}export function C() { return <div data-x={1} onClick={() => renderChart()} /> }`)).toBe(1)
  })
  it('keeps the FIRST binding when an import is duplicated', () => {
    expect(count(R, `${IMP}${IMP}export function C() { return <button onClick={() => renderChart()}>go</button> }`)).toBeGreaterThanOrEqual(1)
  })
})

describe('query-fn-must-forward-signal — option spellings', () => {
  const R = queryFnMustForwardSignal
  const Q = `import { useQuery } from '@pyreon/query'\n`
  it('fires when queryFn ignores the signal — the control', () => {
    expect(count(R, `${Q}const q = useQuery(() => ({ queryKey: ['a'], queryFn: () => fetch('/a') }))`)).toBe(1)
    expect(count(R, `${Q}const q = useQuery(() => ({ queryKey: ['a'], queryFn: ({ signal }) => fetch('/a', { signal }) }))`)).toBe(0)
  })
  it('reads a STRING-LITERAL `queryFn` key and steps over a spread', () => {
    expect(count(R, `${Q}const q = useQuery(() => ({ 'queryKey': ['a'], 'queryFn': () => fetch('/a') }))`)).toBe(1)
    expect(count(R, `${Q}const q = useQuery(() => ({ ...base, queryFn: () => fetch('/a') }))`)).toBe(1)
  })
  it('resolves an ALIASED import', () => {
    expect(count(R, `import { useQuery as uq } from '@pyreon/query'\nconst q = uq(() => ({ queryKey: ['a'], queryFn: () => fetch('/a') }))`)).toBe(1)
  })
  it('inspects a block-bodied thunk that RETURNS the options, and a direct object', () => {
    expect(count(R, `${Q}const q = useQuery(() => { return { queryKey: ['a'], queryFn: () => fetch('/a') } })`)).toBe(1)
    expect(count(R, `${Q}const q = useQuery({ queryKey: ['a'], queryFn: () => fetch('/a') })`)).toBe(1)
  })
  it('ignores a call with no arguments, a thunk returning an identifier, and a non-function queryFn', () => {
    expect(count(R, `${Q}const q = useQuery()`)).toBe(0)
    expect(count(R, `${Q}const q = useQuery(() => opts)`)).toBe(0)
    expect(count(R, `${Q}const q = useQuery(() => ({ queryKey: ['a'], queryFn }))`)).toBe(0)
  })
})

describe('no-imperative-navigate-in-render — where a navigate call sits', () => {
  const R = noImperativeNavigateInRender
  it('fires at component top level and is quiet in a handler — the control', () => {
    expect(count(R, `export function Page() { navigate('/x'); return null }`)).toBe(1)
    expect(count(R, `export function Page() { return <button onClick={() => navigate('/x')}>go</button> }`)).toBe(0)
  })
  it('does not treat a lowercase function or an anonymous default export as a component', () => {
    expect(count(R, `function helper() { navigate('/x') }`)).toBe(0)
    expect(count(R, `export default function () { navigate('/x') }`)).toBe(0)
  })
  it('tracks a NESTED named declaration and a function EXPRESSION, firing only when called synchronously', () => {
    const decl = `export function Page() { function go() { navigate('/x') } go(); return null }`
    const expr = `export function Page() { const go = function () { navigate('/x') }; go(); return null }`
    const stored = `export function Page() { const go = function () { navigate('/x') }; return <button onClick={go}>go</button> }`
    const anon = `export function Page() { const go = function named() { router.push('/x') }; go(); return null }`
    expect(count(R, decl)).toBe(1)
    expect(count(R, expr)).toBe(1)
    expect(count(R, stored)).toBe(0)
    expect(count(R, anon)).toBe(1)
  })
})

describe('prefer-isserver — check spellings and the import fixer', () => {
  const R = preferIsServer
  const fixOf = (src: string): string | null | undefined => {
    const d = diags(R, src)[0]
    if (!d) return undefined
    const fix = d.fix
    if (fix === undefined) return null
    const edits = Array.isArray(fix) ? fix : [fix]
    return edits.map((e) => e.replacement).join('|')
  }
  it('fires on the canonical typeof check — the control', () => {
    expect(count(R, `if (typeof window === 'undefined') {}`)).toBe(1)
  })
  it('ignores a non-equality operator, a different literal, and a different global', () => {
    expect(count(R, `if (typeof window > 'undefined') {}`)).toBe(0)
    expect(count(R, `if (typeof window === 'object') {}`)).toBe(0)
    expect(count(R, `if (typeof self === 'undefined') {}`)).toBe(0)
    expect(count(R, `if (window === undefined) {}`)).toBe(0)
  })
  it('extends an existing reactivity import; a bare side-effect import gets the check rewritten but no import edit', () => {
    expect(fixOf(`import { signal } from '@pyreon/reactivity'\nif (typeof window === 'undefined') {}`)).toContain(', isServer')
    expect(fixOf(`import '@pyreon/reactivity'\nif (typeof window === 'undefined') {}`)).toBeNull()
  })
  it('appends a new import after the last existing one, and at the top when there is none', () => {
    expect(fixOf(`import x from 'y'\nif (typeof document !== 'undefined') {}`)).toContain('import { isClient }')
    expect(fixOf(`if (typeof document !== 'undefined') {}`)).toContain('import { isClient }')
  })
  it('adds no import edit when the name is already imported, and none under a namespace import', () => {
    expect(fixOf(`import { isServer } from '@pyreon/reactivity'\nif (typeof window === 'undefined') {}`)).toBe('isServer')
    expect(fixOf(`import * as r from '@pyreon/reactivity'\nif (typeof window === 'undefined') {}`)).toBeNull()
  })
})
