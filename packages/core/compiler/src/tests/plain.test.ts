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

  it('member mutation on SHALLOW state (state.raw) warns (silent-mutation trap) but the root read still rewrites', () => {
    const r = P(`${HEADER}let o = state.raw({ a: 1 })\no.a = 5\n`)!
    expect(r.warnings.some((w) => w.message.includes('does not notify'))).toBe(true)
    expect(r.code).toContain(`o().a = 5`)
  })

  it('member mutation on NON-LITERAL state (shallow signal) still warns', () => {
    const r = P(`${HEADER}let o = state(makeConfig())\no.a = 5\n`)!
    expect(r.warnings.some((w) => w.message.includes('does not notify'))).toBe(true)
    expect(r.code).toContain(`signal(makeConfig())`)
  })

  it('destructuring assignment onto state warns', () => {
    const r = P(`${HEADER}let a = state(0)\n;({ a } = foo())\n`)!
    expect(r.warnings.some((w) => w.message.includes('destructuring assignment'))).toBe(true)
  })
})

describe('deep state — literal object/array initializers lower to signal(createStore(…))', () => {
  it('object literal → signal(createStore({…})), array literal too', () => {
    const r = P(`${HEADER}let user = state({ name: 'Ada' })\nlet todos = state([1, 2])\n`)!
    expect(r.code).toContain(`const user = signal(createStore({ name: 'Ada' }))`)
    expect(r.code).toContain(`const todos = signal(createStore([1, 2]))`)
    expect(r.code).toContain(`import { signal, createStore } from '@pyreon/reactivity'`)
  })

  it('member reads rewrite the ROOT only: user.name → user().name (per-key tracking through the proxy)', () => {
    const r = P(`${HEADER}let user = state({ name: 'Ada' })\nconst n = user.name\n`)!
    expect(r.code).toContain(`const n = user().name`)
  })

  it('member writes pass through with the root rewritten — NO silent-mutation warning', () => {
    const r = P(
      `${HEADER}let todos = state([{ done: false }])\nconst f = () => { todos[0].done = true }\nconst g = () => { todos.push({ done: false }) }\n`,
    )!
    expect(r.code).toContain(`todos()[0].done = true`)
    expect(r.code).toContain(`todos().push({ done: false })`)
    expect(r.warnings).toHaveLength(0)
  })

  it('whole reassignment wraps the new value in a fresh store through the outer signal', () => {
    const r = P(`${HEADER}let user = state({ n: 1 })\nconst f = () => { user = { n: 2 } }\n`)!
    expect(r.code).toContain(`user.set(createStore({ n: 2 }))`)
  })

  it('reassignment in expression position returns the settled value', () => {
    const r = P(`${HEADER}let user = state({ n: 1 })\nconst f = () => take(user = { n: 2 })\n`)!
    expect(r.code).toContain(`take((user.set(createStore({ n: 2 })), user()))`)
  })

  it('compound assignment and ++ on a deep-state BINDING warn (mutate properties instead)', () => {
    const r = P(`${HEADER}let user = state({ n: 1 })\nconst f = () => { user += 1 }\nconst g = () => { user++ }\n`)!
    expect(r.warnings.some((w) => w.message.includes('compound assignment on deep state'))).toBe(true)
    expect(r.warnings.some((w) => w.message.includes('cannot apply `++` to deep state'))).toBe(true)
  })

  it('state.raw(objectLiteral) opts OUT to a shallow signal', () => {
    const r = P(`${HEADER}let cfg = state.raw({ big: true })\nconst v = cfg.big\n`)!
    expect(r.code).toContain(`const cfg = signal({ big: true })`)
    expect(r.code).not.toContain('createStore')
    expect(r.code).toContain(`cfg().big`)
  })

  it('a NON-literal argument stays a shallow signal (the store/signal split is static)', () => {
    const r = P(`${HEADER}let cfg = state(makeConfig())\n`)!
    expect(r.code).toContain(`const cfg = signal(makeConfig())`)
    expect(r.code).not.toContain('createStore')
  })

  it('total tracking hoists conditional STATIC member paths per-key', () => {
    const r = P(
      `${HEADER}let user = state({ name: 'a', age: 1 })\nlet flag = state(false)\neffect(() => { if (flag) log(user.name) })\n`,
    )!
    expect(r.code).toContain(`void (user(), user().name);`)
  })

  it('an unconditional path is NOT hoisted; a conditional writer does not hoist its own target', () => {
    const r = P(
      `${HEADER}let user = state({ name: 'a', n: 0 })\nlet flag = state(false)\neffect(() => { log(user.name) })\neffect(() => { if (flag) user.n = 1 })\n`,
    )!
    // reader effect: unconditional read → no prologue at all
    expect(r.code).toContain(`effect(() => { log(user().name) })`)
    // writer effect: the WRITE target path must not appear in the prologue
    expect(r.code).toContain(`void (user());`)
    expect(r.code).not.toContain(`user().n)`)
  })

  it('non-static paths (computed keys, optional chains) are skipped — root hoist only', () => {
    const r = P(
      `${HEADER}let m = state({ a: 1 })\nlet k = state('a')\nlet flag = state(false)\neffect(() => { if (flag) log(m[k], m?.a) })\n`,
    )!
    expect(r.code).toContain(`m()[k()]`)
    expect(r.code).not.toContain(`void (flag(), m(), k(), m()[`)
  })

  it('deep state is live in every JSX position (root reads become tracked calls)', () => {
    const r = P(
      `${HEADER}let user = state({ name: 'Ada' })\nexport const App = () => <div title={user.name}><span>{user.name}</span><Child v={user.name} /></div>\n`,
    )!
    expect(r.code).toContain(`title={user().name}`)
    expect(r.code).toContain(`<span>{user().name}</span>`)
    expect(r.code).toContain(`<Child v={user().name} />`)
  })

  it('derived over store paths tracks through the proxy', () => {
    const r = P(`${HEADER}let todos = state([{ done: false }])\nconst open = derived(todos.filter(t => !t.done).length)\n`)!
    expect(r.code).toContain(`const open = computed(() => (todos().filter(t => !t.done).length))`)
  })

  it('a module-scope `createStore` binding forces the __plainStore alias', () => {
    const r = P(`${HEADER}const createStore = () => null\nlet u = state({ a: 1 })\n`)!
    expect(r.code).toContain(`signal(__plainStore({ a: 1 }))`)
    expect(r.code).toContain(`createStore as __plainStore`)
  })

  it('for-of head writing a deep-state binding warns', () => {
    const r = P(`${HEADER}let u = state({ a: 1 })\nfor (u of list) { log(u) }\n`)!
    expect(r.warnings.some((w) => w.message.includes('writes plain state per iteration'))).toBe(true)
  })

  it('imported-state member writes get CONDITIONAL guidance (registry carries names only)', () => {
    const r = P(`${HEADER}const f = () => { remote.k = 1 }\nconst g = () => { remote.n++ }\n`, ['remote'])!
    const conditional = r.warnings.filter((w) => w.message.includes('only if the owning module declared it DEEP'))
    expect(conditional).toHaveLength(2)
  })

  it('deep-state member UPDATE (todos.count++) passes through un-warned with the root rewritten', () => {
    const r = P(`${HEADER}let s = state({ n: 1 })\nconst f = () => { s.n++ }\n`)!
    expect(r.code).toContain(`s().n++`)
    expect(r.warnings).toHaveLength(0)
  })

  it('object shorthand `{ user }` expands to the root read (the proxy is the value)', () => {
    const r = P(`${HEADER}let user = state({ a: 1 })\nconst o = { user }\n`)!
    expect(r.code).toContain(`{ user: user() }`)
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

describe('detectPyreonPatterns is dialect-aware', () => {
  it('does not flag destructured props or reactive early returns in a PLAIN file', async () => {
    const { detectPyreonPatterns } = await import('../pyreon-intercept')
    const plainSrc = `'use plain'
import { state } from '@pyreon/core/plain'
export function Card({ title, kind = 'info' }) {
  let open = state(false)
  if (!open) return null
  return <div class={kind}>{title}</div>
}
`
    // The SAME shapes WITHOUT the directive are the classic footguns and
    // must still fire — the directive is the only difference, proving the
    // gate (not a detector regression) is what silences them.
    const classicSrc = plainSrc.replace(`'use plain'\n`, '').replace(
      `import { state } from '@pyreon/core/plain'`,
      `import { signal as state } from '@pyreon/reactivity'`,
    )
    const plainFindings = detectPyreonPatterns(plainSrc, 'card.tsx')
    const classicFindings = detectPyreonPatterns(classicSrc, 'card.tsx')
    expect(plainFindings.filter((d) => d.code === 'props-destructured')).toHaveLength(0)
    expect(plainFindings.filter((d) => d.code === 'static-return-null-conditional')).toHaveLength(0)
    expect(classicFindings.some((d) => d.code === 'props-destructured')).toBe(true)
  })
})

describe('walker breadth — every statement/expression arm rewrites through', () => {
  it('loops, switch, try, throw, labeled: reads rewrite, heads shadow, state-write heads warn', () => {
    const src = `${HEADER}let n = state(0)
let obj = state({ done: false })
export function run() {
  { const inner = n; use(inner) }
  for (let i = 0; i < n; i++) use(n)
  for (const item of list(n)) use(item, n)
  for (const k in obj) use(k)
  while (n < 5) { n += 1 }
  do { n -= 1 } while (n > 0)
  switch (n) {
    case 1: use(n); break
    default: use(n)
  }
  try { risky(n) } catch (e) { use(e, n) } finally { use(n) }
  outer: for (const x of xs) { if (x === n) break outer }
  if (n > 99) throw new Error(\`too big: \${n}\`)
}
export function badHead() {
  for (n of feed()) use(n)
}\n`
    const r = P(src)!
    expect(r.code).toContain(`i < n()`)
    expect(r.code).toContain(`list(n())`)
    expect(r.code).toContain(`for (const k in obj())`)
    expect(r.code).toContain(`while (n() < 5) { n.set(n() + (1)) }`)
    expect(r.code).toContain(`do { n.set(n() - (1)) } while (n() > 0)`)
    expect(r.code).toContain(`switch (n())`)
    expect(r.code).toContain(`risky(n())`)
    expect(r.code).toContain(`use(e, n())`)
    expect(r.code).toContain(`if (x === n()) break outer`)
    expect(r.code).toContain('`too big: ${n()}`')
    expect(r.warnings.some((w) => w.message.includes('writes plain state per iteration'))).toBe(true)
  })

  it('classes: methods, computed keys, property values, class expressions, super', () => {
    const src = `${HEADER}let base = state('b')
let key = state('k')
export class Widget extends mix(base) {
  [key] = base
  static label = base
  render() { return base }
}
export const Anon = class { go() { return base } }\n`
    const r = P(src)!
    expect(r.code).toContain(`extends mix(base())`)
    expect(r.code).toContain(`[key()] = base()`)
    expect(r.code).toContain(`static label = base()`)
    expect(r.code).toContain(`render() { return base() }`)
    expect(r.code).toContain(`go() { return base() }`)
  })

  it('expression forms: tagged templates, new, chain, sequence, yield, spread, JSX fragments and spread children', () => {
    const src = `${HEADER}let v = state(1)
const tagged = css\`w: \${v}px\`
const inst = new Thing(v)
const opt = maybe?.take(v)
const seq = (log(v), v)
function* gen() { yield v }
const arr = [...items(v)]
export const Frag = () => <>{v}<div {...propsOf(v)} /></>\n`
    const r = P(src)!
    expect(r.code).toContain('css`w: ${v()}px`')
    expect(r.code).toContain(`new Thing(v())`)
    expect(r.code).toContain(`maybe?.take(v())`)
    expect(r.code).toContain(`(log(v()), v())`)
    expect(r.code).toContain(`yield v()`)
    expect(r.code).toContain(`[...items(v())]`)
    expect(r.code).toContain(`<>{v()}<div {...propsOf(v())} /></>`)
  })

  it('remaining write forms: &&= statement, bitwise compounds, imported-state update, member-root update', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
import { remote } from './store'
let f = state(true)
let bits = state(0)
let box = state.raw({ n: 1 })
f &&= compute()
bits &= 3
bits <<= 1
remote++
box.n++
`
    const r = transformPlain(src, 'writes.tsx', { knownSignals: ['remote'] })!
    expect(r.code).toContain(`f() && f.set(compute())`)
    expect(r.code).toContain(`bits.set(bits() & (3))`)
    expect(r.code).toContain(`bits.set(bits() << (1))`)
    expect(r.warnings.some((w) => w.message.includes('not writable state'))).toBe(true)
    expect(r.warnings.some((w) => w.message.includes('does not notify'))).toBe(true)
    expect(r.code).toContain(`box().n++`)
  })

  it('params: array patterns, rest params, defaults reading state, catch-param shadowing', () => {
    const src = `${HEADER}let d = state(5)
function pick([a, b], ...rest) { return a + b + rest.length }
function withDefault(x = d, { y = d } = {}) { return x + y }
function catcher() { try { go() } catch (d) { return d } }
export const all = [pick, withDefault, catcher]\n`
    const r = P(src)!
    expect(r.code).toContain(`function pick([a, b], ...rest) { return a + b + rest.length }`)
    expect(r.code).toContain(`x = d()`)
    expect(r.code).toContain(`y = d()`)
    expect(r.code).toContain(`catch (d) { return d }`)
  })

  it('derived thunk with block body gets total tracking; nested effect frames stay separate', () => {
    const src = `${HEADER}let gate = state(false)
let a = state(1)
let b = state(2)
const picked = derived(() => {
  if (gate) return a
  return b
})
effect(() => {
  effect(() => { if (gate) use(a) })
  use(b)
})\n`
    const r = P(src)!
    // The thunk-form derived hoists its branch-only reads too.
    expect(r.code).toMatch(/computed\(\(\) => \{ void \((a\(\), b\(\)|b\(\), a\(\))\);/)
    // Inner effect hoists `a`; outer hoists nothing (b is unconditional).
    expect(r.code).toContain(`effect(() => { void (a()); if (gate()) use(a()) })`)
  })

  it('export default arrow component + object methods + getters walk', () => {
    const src = `${HEADER}let t = state('x')
const api = {
  read() { return t },
  get label() { return t },
  arrow: () => t,
}
export default () => <p title={t}>{api.read()}</p>\n`
    const r = P(src)!
    expect(r.code).toContain(`read() { return t() }`)
    expect(r.code).toContain(`get label() { return t() }`)
    expect(r.code).toContain(`arrow: () => t()`)
    expect(r.code).toContain(`title={t()}`)
  })
})

describe('coverage margin — file kinds, aliases, guards, fallthroughs', () => {
  it('a plain .ts store module (no JSX lang) transforms', () => {
    const src = `'use plain'\nimport { state } from '@pyreon/core/plain'\nexport let n = state(0)\nexport const inc = () => { n++ }\n`
    const r = transformPlain(src, 'store.ts')!
    expect(r.code).toContain('signal(0)')
    expect(r.code).toContain('n.set(n() + 1)')
  })

  it('a parse error in a plain-marked file returns null (downstream reports it)', () => {
    expect(transformPlain(`'use plain'\nconst = broken(\n`, 'bad.ts')).toBeNull()
  })

  it('a default specifier beside the marker import is tolerated', () => {
    const src = `'use plain'\nimport plainDefault, { state } from '@pyreon/core/plain'\nlet a = state(1)\nexport const r = () => a\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).toContain('signal(1)')
  })

  it('collision aliasing covers computed and effect too', () => {
    const src = `'use plain'
import { state, derived, effect as fx } from '@pyreon/core/plain'
const computed = 'mine'
const effect = 'also mine'
let a = state(1)
const d = derived(a + 1)
fx(() => use(a))
export const all = [computed, effect, d]\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).toContain(`__plainComputed(() => (a() + 1))`)
    expect(r.code).toContain(`__plainEffect(() => use(a()))`)
    expect(r.code).toContain(`computed as __plainComputed`)
    expect(r.code).toContain(`effect as __plainEffect`)
  })

  it('a marker name shadowed by a local binding is not treated as a marker', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
function local() {
  const state = (v) => v * 2
  return state(21)
}
export const x = local()\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).toContain(`return state(21)`) // untouched — the local wins
    expect(r.warnings).toHaveLength(0)
  })

  it('computed keys and nested patterns in props bail as complex', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
export function A({ [key]: a }) { return <i>{a}</i> }
export function B({ pos: { x } }) { return <i>{x}</i> }
export function C({ a }, extra) { return <i>{a}{extra}</i> }
export function D(props) { const { a: { b } } = props; return <i>{b}</i> }\n`
    const r = transformPlain(src, 't.tsx')!
    const complex = r.warnings.filter((w) => w.message.includes('complex props destructuring'))
    expect(complex.length).toBeGreaterThanOrEqual(3)
    // C is SIMPLE with a second param — the rewrite fires and `extra` shadows.
    expect(r.code).toContain(`C(props, extra)`)
    expect(r.code).toContain(`{props.a}{extra}`)
  })

  it('if/else alternates, expression-init for loops, and a return-less reactive if do not wrap', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let m = state(0)
export function T() {
  if (m > 1) log(m)
  else warnMore(m)
  let i
  for (i = 0; i < 3; i++) tick(m)
  return <p>{m}</p>
}\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).not.toContain('return () => {') // no return inside the if
    expect(r.code).toContain(`else warnMore(m())`)
    expect(r.code).toContain(`for (i = 0; i < 3; i++) tick(m())`)
  })

  it('export default function declarations walk; computed members and import() rewrite', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let k = state('mod')
const v = table[k]
const dyn = import(pathFor(k))
export default function Main() { return <div>{k}</div> }\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).toContain(`table[k()]`)
    expect(r.code).toContain(`import(pathFor(k()))`)
    expect(r.code).toContain(`{k()}`)
  })

  it('a destructured prop used as object shorthand expands to the props read', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
export function Card({ label, size = 2 }) {
  const payload = { label, size }
  return <i title={JSON.stringify(payload)}>{label}</i>
}\n`
    const r = transformPlain(src, 't.tsx')!
    expect(r.code).toContain(`{ label: props.label, size: (props.size ?? (2)) }`)
  })
})
