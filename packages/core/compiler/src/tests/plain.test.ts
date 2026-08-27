/**
 * Plain Mode pre-pass — transform-shape specs.
 *
 * Behavioral (mount + reactivity) coverage lives in
 * `@pyreon/runtime-dom` `src/tests/plain-mode.test.tsx`, which compiles plain
 * source through the REAL full pipeline and asserts DOM updates. This file
 * locks the EMIT: what each dialect shape rewrites to, what warns, and what is
 * deliberately left alone.
 */
import { describe, expect, it } from 'vitest'
import { detectPlain, transformPlain } from '../plain'
import { transformJSX_JS } from '../jsx'

const P = (code: string, knownSignals?: string[]) =>
  transformPlain(code, 'test.tsx', knownSignals ? { knownSignals } : {})

const HEADER = `'use plain'
import { state, derived, effect } from '@pyreon/core/plain'
`

describe('activation', () => {
  it('returns null for a file with neither directive nor plain import', () => {
    expect(P(`import { signal } from '@pyreon/reactivity'\nconst a = signal(0)`)).toBeNull()
  })

  it('detectPlain: directive alone, import alone, neither', () => {
    expect(detectPlain(`'use plain'\nconst a = 1`)).toBe(true)
    expect(detectPlain(`import { state } from '@pyreon/core/plain'`)).toBe(true)
    expect(detectPlain(`const s = "use plain in docs prose"`)).toBe(false)
  })

  it('a mention of "use plain" in a string literal mid-file does not activate', () => {
    // detectPlain is a cheap gate; the PARSE decides — the directive must be a
    // real directive statement.
    const r = P(`const doc = 'x';\n'use plain';\nlet a = 1`)
    // 'use plain' as a statement AFTER other statements is not a directive.
    expect(r).toBeNull()
  })

  it('strips the directive and the marker import, preserving line numbers', () => {
    const r = P(`${HEADER}let a = state(1)\n`)!
    expect(r.code).not.toContain('use plain')
    expect(r.code).not.toContain('@pyreon/core/plain')
    // Same number of lines in and out — stripped slots keep their newlines.
    expect(r.code.split('\n').length).toBe(`${HEADER}let a = state(1)\n`.split('\n').length)
  })

  it('is idempotent — the output no longer detects as plain', () => {
    const r = P(`${HEADER}let a = state(1)\n`)!
    expect(detectPlain(r.code)).toBe(false)
    expect(transformPlain(r.code, 'test.tsx')).toBeNull()
  })
})

describe('state declarations', () => {
  it('let x = state(v) → const x = signal(v) with injected import', () => {
    const r = P(`${HEADER}let count = state(0)\n`)!
    expect(r.code).toContain(`const count = signal(0)`)
    expect(r.code).toContain(`import { signal } from '@pyreon/reactivity'`)
  })

  it('const x = state(v) works too', () => {
    const r = P(`${HEADER}const count = state(5)\n`)!
    expect(r.code).toContain(`const count = signal(5)`)
  })

  it('preserves TS type arguments: state<number>(0) → signal<number>(0)', () => {
    const r = P(`${HEADER}let n = state<number>(0)\n`)!
    expect(r.code).toContain(`signal<number>(0)`)
  })

  it('a mixed declaration keeps its original kind for the non-marker declarator', () => {
    const r = P(`${HEADER}let a = state(0), b = 1\nb = 2\n`)!
    expect(r.code).toContain(`let a = signal(0), b = 1`)
    expect(r.code).toContain(`b = 2`) // b is not state — untouched
  })

  it('merges into an existing @pyreon/reactivity import instead of duplicating', () => {
    const src = `${HEADER}import { batch } from '@pyreon/reactivity'\nlet a = state(0)\n`
    const r = P(src)!
    expect(r.code).toContain(`import { batch, signal } from '@pyreon/reactivity'`)
    expect(r.code.match(/@pyreon\/reactivity/g)!.length).toBe(1)
  })

  it('aliases the emit name when the module declares a colliding binding', () => {
    const src = `${HEADER}const signal = 'mine'\nlet a = state(0)\n`
    const r = P(src)!
    expect(r.code).toContain(`const a = __plainSignal(0)`)
    expect(r.code).toContain(`import { signal as __plainSignal } from '@pyreon/reactivity'`)
  })

  it('state() outside a declaration init warns and is left alone', () => {
    const r = P(`${HEADER}foo(state(1))\n`)!
    expect(r.warnings.some((w) => w.message.includes('must initialize a variable declaration'))).toBe(true)
    expect(r.code).toContain(`foo(state(1))`)
  })

  it('aliased marker import: import { state as s } works', () => {
    const src = `'use plain'\nimport { state as s } from '@pyreon/core/plain'\nlet a = s(0)\na = a + 1\n`
    const r = P(src)!
    expect(r.code).toContain(`const a = signal(0)`)
    expect(r.code).toContain(`a.set(a() + 1)`)
  })
})

describe('reads', () => {
  it('rewrites reads everywhere: JSX text, attrs, template literals, calls, member roots', () => {
    const src = `${HEADER}let c = state(0)
const el = <div title={c}>{c}</div>
const t = \`v: \${c}\`
foo(c)
const k = c.toFixed(1)
`
    const r = P(src)!
    expect(r.code).toContain(`title={c()}`)
    expect(r.code).toContain(`>{c()}<`)
    expect(r.code).toContain('`v: ${c()}`')
    expect(r.code).toContain(`foo(c())`)
    expect(r.code).toContain(`c().toFixed(1)`)
  })

  it('object shorthand expands: { c } → { c: c() }', () => {
    const r = P(`${HEADER}let c = state(0)\nconst o = { c, k: c }\n`)!
    expect(r.code).toContain(`{ c: c(), k: c() }`)
  })

  it('does NOT rewrite property names, labels, or export specifiers', () => {
    const src = `${HEADER}let c = state(0)
const o = { c: 1 }
const m = o.c
export { c }
`
    const r = P(src)!
    expect(r.code).toContain(`const o = { c: 1 }`)
    expect(r.code).toContain(`const m = o.c`)
    expect(r.code).toContain(`export { c }`) // live-binding law: export the signal
  })

  it('shadowing: params, locals, and hoisted functions suppress the rewrite', () => {
    const src = `${HEADER}let c = state(0)
function f(c) { return c + 1 }
function g() { const c = 2; return c }
function h() { return c }
`
    const r = P(src)!
    expect(r.code).toContain(`return c + 1`)
    expect(r.code).toContain(`const c = 2; return c`)
    expect(r.code).toContain(`function h() { return c() }`)
  })

  it('classic signal() bindings in a plain file are untouched (mixed mode)', () => {
    const src = `${HEADER}import { signal } from '@pyreon/reactivity'
const classic = signal(0)
let plain = state(1)
const both = classic() + plain
`
    const r = P(src)!
    expect(r.code).toContain(`classic() + plain()`)
  })

  it('knownSignals (cross-module imports) read as calls; assignment warns', () => {
    const src = `'use plain'\nimport { theme } from './store'\nconst t = theme\ntheme = 'x'\n`
    const r = transformPlain(src, 'test.tsx', { knownSignals: ['theme'] })!
    expect(r.code).toContain(`const t = theme()`)
    expect(r.warnings.some((w) => w.message.includes('read-only'))).toBe(true)
  })
})

describe('writes', () => {
  const decl = `${HEADER}let c = state(0)\n`

  it('plain assignment: c = v → c.set(v)', () => {
    expect(P(`${decl}c = 5\n`)!.code).toContain(`c.set(5)`)
  })

  it('self-referencing assignment: c = c + 1 → c.set(c() + 1)', () => {
    expect(P(`${decl}c = c + 1\n`)!.code).toContain(`c.set(c() + 1)`)
  })

  it('compound: c += v → c.set(c() + (v))', () => {
    expect(P(`${decl}c += 2\n`)!.code).toContain(`c.set(c() + (2))`)
    expect(P(`${decl}c **= 2\n`)!.code).toContain(`c.set(c() ** (2))`)
  })

  it('logical assigns short-circuit correctly', () => {
    expect(P(`${decl}c ||= 9\n`)!.code).toContain(`c() || c.set(9)`)
    expect(P(`${decl}c ??= 9\n`)!.code).toContain(`c() ?? c.set(9)`)
  })

  it('statement-position updates: c++ → c.set(c() + 1)', () => {
    expect(P(`${decl}c++\n`)!.code).toContain(`c.set(c() + 1)`)
    expect(P(`${decl}c--\n`)!.code).toContain(`c.set(c() - 1)`)
  })

  it('expression-position postfix keeps the OLD value via a single-eval IIFE', () => {
    const r = P(`${decl}const old = c++\n`)!
    expect(r.code).toContain(`((__v) => (c.set(__v + 1), __v))(c())`)
  })

  it('expression-position prefix and assignment yield the settled value', () => {
    expect(P(`${decl}const v = ++c\n`)!.code).toContain(`(c.set(c() + 1), c())`)
    expect(P(`${decl}foo(c = 7)\n`)!.code).toContain(`foo((c.set(7), c()))`)
  })

  it('assigning to derived / imported state / props warns and leaves code alone', () => {
    const r1 = P(`${HEADER}let a = state(0)\nconst d = derived(a * 2)\nd = 3\n`)!
    expect(r1.warnings.some((w) => w.message.includes('cannot assign to derived'))).toBe(true)
    const r2 = transformPlain(`'use plain'\nimport { x } from './s'\nx = 1\n`, 't.tsx', {
      knownSignals: ['x'],
    })!
    expect(r2.warnings.some((w) => w.message.includes('read-only'))).toBe(true)
  })

  it('member mutation on state warns (silent-mutation trap) but the root read still rewrites', () => {
    const r = P(`${HEADER}let o = state({ a: 1 })\no.a = 5\n`)!
    expect(r.warnings.some((w) => w.message.includes('does not notify'))).toBe(true)
    expect(r.code).toContain(`o().a = 5`)
  })

  it('destructuring assignment onto state warns', () => {
    const r = P(`${HEADER}let a = state(0)\n;({ a } = foo())\n`)!
    expect(r.warnings.some((w) => w.message.includes('destructuring assignment'))).toBe(true)
  })
})

describe('derived', () => {
  it('expression form wraps in a thunk: derived(a * 2) → computed(() => (a() * 2))', () => {
    const r = P(`${HEADER}let a = state(1)\nconst d = derived(a * 2)\n`)!
    expect(r.code).toContain(`const d = computed(() => (a() * 2))`)
  })

  it('thunk form is passed through: derived(() => a * 2)', () => {
    const r = P(`${HEADER}let a = state(1)\nconst d = derived(() => a * 2)\n`)!
    expect(r.code).toContain(`const d = computed(() => a() * 2)`)
  })

  it('derived reads rewrite like state reads', () => {
    const r = P(`${HEADER}let a = state(1)\nconst d = derived(a + 1)\nconst u = d * 10\n`)!
    expect(r.code).toContain(`const u = d() * 10`)
  })

  it('conditional reads inside a derived expression get a total-tracking prologue', () => {
    const r = P(`${HEADER}let f = state(true)\nlet a = state(1)\nlet b = state(2)\nconst d = derived(f ? a : b)\n`)!
    // f is read unconditionally (the test); a and b only in branches.
    expect(r.code).toMatch(/computed\(\(\) => \(\(void \((a\(\), b\(\)|b\(\), a\(\))\), f\(\) \? a\(\) : b\(\)\)\)\)/)
  })
})

describe('effect + total tracking', () => {
  it('effect() maps to reactivity effect() with reads rewritten', () => {
    const r = P(`${HEADER}let a = state(1)\neffect(() => console.log(a))\n`)!
    expect(r.code).toContain(`effect(() => console.log(a()))`)
    expect(r.code).toContain(`import { signal, effect } from '@pyreon/reactivity'`)
  })

  it('a branch-only read is hoisted into a prologue', () => {
    const r = P(`${HEADER}let f = state(false)\nlet a = state(1)\neffect(() => { if (f) console.log(a) })\n`)!
    expect(r.code).toContain(`{ void (a());`)
    expect(r.code).toContain(`if (f()) console.log(a())`)
  })

  it('unconditional reads get NO prologue', () => {
    const r = P(`${HEADER}let a = state(1)\neffect(() => { console.log(a) })\n`)!
    expect(r.code).not.toContain(`void (`)
  })

  it('reads after an await are treated as conditional (subscription survives)', () => {
    const r = P(`${HEADER}let a = state(1)\neffect(async () => { await tick(); console.log(a) })\n`)!
    expect(r.code).toContain(`void (a());`)
  })

  it('reads inside a nested function are treated as conditional', () => {
    const r = P(`${HEADER}let a = state(1)\neffect(() => { const t = () => a; use(t) })\n`)!
    expect(r.code).toContain(`void (a());`)
  })

  it('a WRITE-only binding is never hoisted (no self-retrigger loop)', () => {
    const r = P(`${HEADER}let a = state(1)\nlet b = state(2)\neffect(() => { if (b) a = 5 })\n`)!
    // a is only written — must NOT appear in the prologue.
    expect(r.code).not.toMatch(/void \([^)]*a\(\)/)
  })

  it('expression-bodied effect wraps the body when a prologue is needed', () => {
    const r = P(`${HEADER}let f = state(false)\nlet a = state(1)\neffect(() => f && log(a))\n`)!
    expect(r.code).toContain(`effect(() => (void (a()), f() && log(a())))`)
  })

  it('non-function effect argument warns', () => {
    const r = P(`${HEADER}effect(42)\n`)!
    expect(r.warnings.some((w) => w.message.includes('expects a function'))).toBe(true)
  })
})

describe('component props', () => {
  it('rewrites simple destructured params to live props.* reads', () => {
    const src = `${HEADER}export function Badge({ label, kind = 'info' }) {
  return <span class={kind}>{label}</span>
}\n`
    const r = P(src)!
    expect(r.code).toContain(`export function Badge(props) {`)
    expect(r.code).toContain(`class={(props.kind ?? ('info'))}`)
    expect(r.code).toContain(`{props.label}`)
  })

  it('renamed destructure { on: handler } maps handler → props.on', () => {
    const src = `${HEADER}export const B = ({ on: handler }) => <button onClick={handler}>x</button>\n`
    const r = P(src)!
    expect(r.code).toContain(`onClick={props.on}`)
  })

  it('preserves a TS annotation on the pattern', () => {
    const src = `${HEADER}export function B({ a }: { a: string }) { return <i>{a}</i> }\n`
    const r = P(src)!
    expect(r.code).toContain(`B(props: { a: string })`)
    expect(r.code).toContain(`{props.a}`)
  })

  it('body destructure const { a } = props is removed and reads go live', () => {
    const src = `${HEADER}export function B(props) {
  const { a } = props
  return <i>{a}</i>
}\n`
    const r = P(src)!
    expect(r.code).not.toContain(`const { a } = props`)
    expect(r.code).toContain(`{props.a}`)
  })

  it('rest / nested patterns bail with a warning and stay untouched', () => {
    const src = `${HEADER}export function B({ a, ...rest }) { return <i {...rest}>{a}</i> }\n`
    const r = P(src)!
    expect(r.warnings.some((w) => w.message.includes('complex props destructuring'))).toBe(true)
    expect(r.code).toContain(`{ a, ...rest }`)
  })

  it('uses __props when the body already binds `props`', () => {
    const src = `${HEADER}export function B({ a }) { const props = {}; return <i>{a}</i> }\n`
    const r = P(src)!
    expect(r.code).toContain(`B(__props)`)
    expect(r.code).toContain(`{__props.a}`)
  })

  it('non-component functions with object params are untouched', () => {
    const src = `${HEADER}function helper({ x }) { return x + 1 }\n`
    const r = P(src)!
    expect(r.code).toContain(`function helper({ x }) { return x + 1 }`)
  })

  it('assigning to a prop warns', () => {
    const src = `${HEADER}export function B({ a }) { a = 1; return <i>{a}</i> }\n`
    const r = P(src)!
    expect(r.warnings.some((w) => w.message.includes('cannot assign to prop'))).toBe(true)
  })
})

describe('reactive early returns', () => {
  it('wraps the tail in a returned accessor when the if-test reads state', () => {
    const src = `${HEADER}export function T() {
  let open = state(false)
  if (!open) return <button>show</button>
  return <div>content</div>
}\n`
    const r = P(src)!
    expect(r.code).toContain(`return () => {`)
    expect(r.code).toContain(`if (!open()) return <button>show</button>`)
  })

  it('wraps on a props-member test', () => {
    const src = `${HEADER}export function T(props) {
  if (props.loading) return <p>…</p>
  return <div>done</div>
}\n`
    const r = P(src)!
    expect(r.code).toContain(`return () => {`)
  })

  it('does NOT wrap a static early return', () => {
    const src = `${HEADER}const DEV = true
export function T() {
  if (DEV) return <p>dev</p>
  return <div>prod</div>
}\n`
    const r = P(src)!
    expect(r.code).not.toContain(`return () => {`)
  })

  it('bails with a warning when the tail hoists a function declaration', () => {
    const src = `${HEADER}export function T() {
  let open = state(false)
  if (!open) return <p>closed</p>
  function helper() { return 1 }
  return <div>{helper()}</div>
}\n`
    const r = P(src)!
    expect(r.code).not.toContain(`return () => {`)
    expect(r.warnings.some((w) => w.message.includes('could not be made live'))).toBe(true)
  })
})

describe('pipeline integration', () => {
  it('the full transform compiles a plain component to templates with direct bindings', () => {
    const src = `${HEADER}let count = state(0)
export function Counter() {
  return <button onClick={() => { count = count + 1 }}>{count}</button>
}\n`
    const r = transformJSX_JS(src, 'counter.tsx')
    expect(r.code).toContain(`const count = signal(0)`)
    expect(r.code).toContain(`count.set(count() + 1)`)
    // The read compiles into a template binding — the direct tier, no VNode.
    expect(r.code).toContain(`_bindText(count`)
  })

  it('plain warnings surface through the full transform result', () => {
    const src = `${HEADER}let d = state(0)\nconst e = derived(d)\ne = 1\nexport const x = <p>{d}</p>\n`
    const r = transformJSX_JS(src, 'warn.tsx')
    expect(r.warnings.some((w) => w.code === 'plain-mode')).toBe(true)
  })

  it('SSR mode composes with the pre-pass', () => {
    const src = `${HEADER}let n = state(1)\nexport const El = () => <div>{n}</div>\n`
    const r = transformJSX_JS(src, 'ssr.tsx', { ssr: true })
    expect(r.code).toContain(`signal(1)`)
    expect(r.code).toContain(`n()`)
  })
})
