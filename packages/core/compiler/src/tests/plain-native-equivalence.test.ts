/**
 * Plain Mode pre-pass — JS ↔ Rust BYTE-EQUALITY gate.
 *
 * The JS `transformPlain` is the ORACLE; the native `transform_plain`
 * (`native/src/plain.rs`) must match it byte-for-byte — output code AND the
 * full warnings array (message, line, column, code) — plus null-verdict
 * parity for non-plain files. Two tiers:
 *
 *   1. a hand-curated corpus covering every dialect feature (the shapes
 *      `plain.test.ts` locks, one per mechanism);
 *   2. a seeded grammar fuzz over the combinatoric space between them —
 *      the discipline that found the auto-call divergences in the JSX
 *      backends (`fuzz-equivalence.test.ts`), aimed at the pre-pass.
 *
 * A divergence indicts exactly one implementation; fix BOTH in one PR.
 * Seed count: PYREON_FUZZ_SEEDS (default 300).
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transformPlain } from '../plain'

const require2 = createRequire(import.meta.url)
let nativePlain:
  | ((code: string, filename: string, knownSignals: string[] | null) =>
      | { code: string; warnings: Array<{ message: string; line: number; column: number; code: string }> }
      | null)
  | null = null
try {
  const native = require2(join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  if (typeof native.transformPlain === 'function') nativePlain = native.transformPlain
} catch {
  // Native not available — skip
}

const describeNative = nativePlain ? describe : describe.skip

function compare(code: string, filename = 'eq.tsx', knownSignals?: string[]) {
  const js = transformPlain(code, filename, knownSignals ? { knownSignals } : {})
  const rs = nativePlain!(code, filename, knownSignals ?? null)
  if (js === null) {
    expect(rs, `native must return null where JS does\n${code}`).toBeNull()
    return
  }
  expect(rs, `native must transform where JS does\n${code}`).not.toBeNull()
  if (js.code !== rs!.code) {
    const a = js.code.split('\n')
    const b = rs!.code.split('\n')
    const diffs: string[] = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) diffs.push(`line ${i + 1}:\n  JS: ${a[i]}\n  RS: ${b[i]}`)
    }
    expect.fail(`code diverged on:\n${code}\n${diffs.join('\n')}`)
  }
  expect(rs!.warnings, `warnings diverged on:\n${code}`).toEqual(js.warnings)
}

const HEADER = `'use plain'\nimport { state, derived, effect } from '@pyreon/core/plain'\n`

describeNative('plain pre-pass corpus equivalence', () => {
  const CORPUS: Array<[string, string]> = [
    ['counter + writes', `${HEADER}let count = state(0)\nconst inc = () => { count = count + 1 }\nconst bump = () => { count += 2 }\nconst dec = () => { count-- }\nconst post = () => take(count++)\nconst pre = () => take(++count)\nconst orr = () => { count ||= 5 }\nconst expr = () => take(count = 9)\nexport const read = () => count\n`],
    ['deep state full surface', `${HEADER}let user = state({ name: 'Ada', tags: ['a'] })\nlet todos = state([{ id: 1, done: false }])\nconst f = () => { todos[0].done = true }\nconst g = () => { todos.push({ id: 2, done: false }) }\nconst h = () => { user.name = 'Bo' }\nconst r = () => { user = { name: 'Cy', tags: [] } }\nconst rv = () => take(user = { name: 'D', tags: [] })\nconst n = () => user.name\nconst chain = () => todos[0].done\n`],
    ['state.raw + non-literal', `${HEADER}let cfg = state.raw({ big: true })\nlet dyn = state(makeConfig())\nconst m = () => { cfg.big = false }\nconst m2 = () => { dyn.k = 1 }\nexport const read = () => [cfg.big, dyn]\n`],
    ['derived expr + thunk + block', `${HEADER}let a = state(1)\nlet b = state(2)\nconst s = derived(a + b)\nconst t = derived(() => a * b)\nconst u = derived(() => { return a - b })\nconst tern = derived(a > 1 ? b + 1 : b - 1)\n`],
    ['effect total tracking', `${HEADER}let a = state(1)\nlet b = state(2)\nlet gate = state(false)\neffect(() => { if (gate) log(a); else log(b) })\neffect(() => { log(a); if (gate) log(b) })\neffect(async () => { await tick(); log(a) })\neffect(() => { const inner = () => log(b); inner() })\n`],
    ['effect conditional exits', `${HEADER}let a = state(1)\nlet b = state(2)\neffect(() => { if (a > 1) return; log(b) })\n`],
    ['deep-state member paths in effects', `${HEADER}let user = state({ name: 'a', age: 1 })\nlet flag = state(false)\neffect(() => { if (flag) log(user.name) })\neffect(() => { log(user.name) })\neffect(() => { if (flag) user.age = 2 })\neffect(() => { if (flag) log(user[0], user?.name) })\n`],
    ['props destructuring param + body', `${HEADER}export function Card({ name, size = 'm' }) {\n  return <div title={size}>{name}</div>\n}\nexport function Row(props) {\n  const { label } = props\n  return <span>{label}</span>\n}\n`],
    ['props collision + complex bail', `${HEADER}export function A({ x }) {\n  const props = {}\n  return <b>{x}</b>\n}\nexport function B({ a, ...rest }) {\n  return <i>{a}</i>\n}\n`],
    ['reactive early return', `${HEADER}let loading = state(true)\nexport function View() {\n  let local = state(0)\n  if (loading) return <p>spin</p>\n  return <button onClick={() => { local++ }}>{local}</button>\n}\n`],
    ['early return hoisted bail', `${HEADER}let loading = state(true)\nexport function View() {\n  if (loading) return <p>spin</p>\n  var tail = 1\n  return <b>{tail}</b>\n}\n`],
    ['shadowing discipline', `${HEADER}let count = state(5)\nfunction helper(count) { return count + 1 }\nconst arrow = (count) => count * 2\nexport function C() {\n  const count = 'local'\n  return <i>{count}</i>\n}\nexport const read = () => count\n`],
    ['emit-name collisions', `'use plain'\nimport { state, derived } from '@pyreon/core/plain'\nconst signal = () => null\nconst computed = () => null\nconst createStore = () => null\nlet a = state(1)\nlet u = state({ k: 1 })\nconst d = derived(a * 2)\n`],
    ['existing reactivity import merge', `'use plain'\nimport { state } from '@pyreon/core/plain'\nimport { batch, untrack } from '@pyreon/reactivity'\nlet a = state(1)\nexport const f = () => batch(() => { a = untrack(() => a) + 1 })\n`],
    ['directive-only activation', `'use plain'\nexport const x = 1\n`],
    ['marker-import-only activation', `import { state } from '@pyreon/core/plain'\nlet n = state(1)\nexport const read = () => n\n`],
    ['imported-state (knownSignals)', `${HEADER}const f = () => remote + 1\nconst g = () => { remote = 5 }\nconst h = () => { remote.k = 1 }\nconst i = () => { remote.n++ }\nlet mine = state(0)\neffect(() => { log(remote, mine) })\n`],
    ['object shorthand + spreads', `${HEADER}let count = state(0)\nlet user = state({ a: 1 })\nconst o = { count, user, other }\nconst arr = [...list, count]\nconst obj = { ...base, k: count }\n`],
    ['writes: destructuring-assign + for-of head', `${HEADER}let a = state(0)\nlet u = state({ k: 1 })\n;({ a } = src)\n;[a] = src2\nfor (a of list) { log(a) }\nfor (u of list) { log(u) }\n`],
    ['marker misuse warnings', `${HEADER}state(5)\nconst x = [derived(1)]\neffect(42)\n`],
    ['JSX breadth', `${HEADER}let n = state(1)\nlet u = state({ k: 'v' })\nexport const App = () => (\n  <>\n    <div title={n} data-k={u.k} {...spread}>\n      {n}\n      <span>{u.k > 'a' ? n : 0}</span>\n      {list.map((it) => <b key={it}>{n}</b>)}\n    </div>\n  </>\n)\n`],
    ['statement breadth', `${HEADER}let a = state(1)\nexport function f() {\n  for (let i = 0; i < a; i++) { log(a) }\n  while (a > 0) { break }\n  do { break } while (a > 0)\n  switch (a) { case a: log(a); break; default: break }\n  try { log(a) } catch (e) { log(e, a) } finally { log(a) }\n  outer: { log(a); break outer }\n  throw new Error(String(a))\n}\nexport class K {\n  static v = a\n  m() { return a }\n}\n`],
    ['TS surface', `${HEADER}let n = state<number>(0)\nlet u = state({ k: 1 } as const)\nconst d = derived((n as number) * 2)\nexport function C({ label }: { label?: string }) {\n  const v = (n satisfies number)!\n  return <b title={label}>{v}</b>\n}\ninterface Foo { x: number }\ntype Bar = Foo\nexport enum E { A }\n`],
    ['not plain — classic file', `import { signal } from '@pyreon/reactivity'\nconst a = signal(0)\nexport const read = () => a()\n`],
    ['contains the token but not plain', `const s = "'use plain' is a directive"\nexport const y = s\n`],
    ['await + tracked frames', `${HEADER}let a = state(1)\nlet b = state(2)\neffect(async () => { log(a); await tick(); log(b); if (a) log(b) })\n`],
    ['nested effects + derived in component', `${HEADER}let a = state(1)\nexport function C() {\n  let local = state({ deep: { n: 1 } })\n  const d = derived(local.deep.n + a)\n  effect(() => { if (a) log(local.deep.n) })\n  const set = () => { local.deep.n = 5 }\n  return <div onClick={set}>{d}</div>\n}\n`],
    ['template literals + tagged', `${HEADER}let a = state(1)\nconst t = \`v=\${a}\`\nconst g = tag\`x\${a}\`\n`],
    ['classes + getters', `${HEADER}let a = state(1)\nexport class W {\n  [a]() { return 1 }\n  p = a\n}\nconst c = class Named { m() { return a } }\n`],
    ['export forms', `${HEADER}export let shared = state(0)\nexport const dd = derived(shared * 2)\nexport default function App() { return <b>{shared}</b> }\n`],
    ['sequence + logical + conditional positions', `${HEADER}let a = state(1)\nconst s = (log(a), a)\nconst l = a && a + 1\nconst n = a ?? 5\nconst t = a ? a : -a\nconst v = !a\nconst y = typeof a\n`],
  ]

  it.each(CORPUS)('%s', (_name, code) => {
    compare(code, 'eq.tsx', code.includes('remote') ? ['remote'] : undefined)
  })

  it('.ts / .jsx / .js filenames', () => {
    compare(`'use plain'\nimport { state } from '@pyreon/core/plain'\nexport let n = state(1)\nexport const read = () => n\n`, 'store.ts')
    compare(`'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state(1)\nexport const App = () => <b>{n}</b>\n`, 'view.jsx')
  })
})

// ─── Seeded fuzz ───────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

function generate(seed: number): string {
  const r = rng(seed)
  const lines: string[] = [`'use plain'`, `import { state, derived, effect } from '@pyreon/core/plain'`]
  const scalars: string[] = []
  const stores: string[] = []
  for (let i = 0; i < int(r, 1, 3); i++) {
    const name = `s${i}`
    if (r() > 0.5) {
      lines.push(`let ${name} = state(${int(r, 0, 9)})`)
      scalars.push(name)
    } else {
      lines.push(`let ${name} = state({ n: ${int(r, 0, 9)}, tag: 'x' })`)
      stores.push(name)
    }
  }
  if (r() > 0.6) {
    lines.push(`let raw0 = state.raw({ big: ${r() > 0.5} })`)
  }
  const readables = [...scalars, ...stores.map((s) => `${s}.n`)]
  if (readables.length === 0) readables.push('0')
  for (let i = 0; i < int(r, 0, 2); i++) {
    const body = pick(r, [
      `${pick(r, readables)} + ${pick(r, readables)}`,
      `${pick(r, readables)} * 2`,
      `${pick(r, readables)} > 3 ? ${pick(r, readables)} : -1`,
    ])
    lines.push(r() > 0.5 ? `const d${i} = derived(${body})` : `const d${i} = derived(() => ${body})`)
    readables.push(`d${i}`)
  }
  // mutators
  let m = 0
  for (const s of scalars) {
    lines.push(
      pick(r, [
        `export const m${m} = () => { ${s} = ${s} + 1 }`,
        `export const m${m} = () => { ${s} += ${int(r, 1, 3)} }`,
        `export const m${m} = () => { ${s}++ }`,
        `export const m${m} = () => take(${s}--)`,
        `export const m${m} = () => { ${s} ||= ${int(r, 1, 9)} }`,
      ]),
    )
    m++
  }
  for (const s of stores) {
    lines.push(
      pick(r, [
        `export const m${m} = () => { ${s}.n = ${int(r, 0, 9)} }`,
        `export const m${m} = () => { ${s}.n++ }`,
        `export const m${m} = () => { ${s} = { n: ${int(r, 0, 9)}, tag: 'y' } }`,
        `export const m${m} = () => { ${s} += 1 }`,
      ]),
    )
    m++
  }
  // effect with branch/await/nested-fn shapes
  if (r() > 0.3) {
    const a = pick(r, readables)
    const b = pick(r, readables)
    lines.push(
      pick(r, [
        `effect(() => { if (${a} > 2) log(${b}) })`,
        `effect(() => { log(${a}); if (${a} > 1) return; log(${b}) })`,
        `effect(async () => { await tick(); log(${a}) })`,
        `effect(() => { const f = () => log(${a}); if (${b}) f() })`,
      ]),
    )
  }
  // a component
  const title = pick(r, readables)
  const children: string[] = []
  for (let i = 0; i < int(r, 1, 3); i++) {
    const v = pick(r, readables)
    children.push(
      pick(r, [`{${v}}`, `<span>{${v}}</span>`, `{${v} > 2 ? 'hi' : 'lo'}`, `<b data-v={${v}}>x</b>`]),
    )
  }
  const propsShape = pick(r, ['({ label })', "({ label, size = 'm' })", '(props)'])
  const early = r() > 0.6 && scalars.length > 0 ? `  if (${scalars[0]} > 99) return <p>max</p>\n` : ''
  lines.push(
    `export function View${propsShape} {\n${early}  return <div title={${title}}>${children.join('|')}</div>\n}`,
  )
  return lines.join('\n') + '\n'
}

const SEEDS = Math.max(1, Number((process.env as Record<string, string | undefined>).PYREON_FUZZ_SEEDS) || 300)

describeNative(`plain pre-pass fuzz equivalence (${SEEDS} seeds)`, () => {
  it('every seed is byte-identical across implementations', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const code = generate(seed)
      compare(code, `fuzz-${seed}.tsx`)
    }
  })
})
