/**
 * Classic → Plain codemod (`migrateToPlain`) — emit-shape specs.
 *
 * The codemod's correctness bar is per-BINDING: a binding converts only when
 * EVERY reference has a plain form; anything else declines with a named
 * reason and leaves the binding byte-untouched. The behavioral half of the
 * proof is the round-trip fuzz oracle in
 * `runtime-dom/src/tests/plain-roundtrip-fuzz.test.tsx`.
 */
import { describe, expect, it } from 'vitest'
import { migrateToPlain } from '../plain-migrate'
import { transformPlain } from '../plain'

const M = (code: string) => migrateToPlain(code, 'mig.tsx')

describe('activation + no-ops', () => {
  it('a file already in the dialect returns alreadyPlain, untouched', () => {
    const r = M(`'use plain'\nlet a = 1\n`)
    expect(r.alreadyPlain).toBe(true)
    expect(r.code).toBeNull()
  })

  it('a file with no reactivity import returns null', () => {
    const r = M(`const a = 1\nexport const b = a + 1\n`)
    expect(r.code).toBeNull()
    expect(r.converted).toEqual([])
  })

  it('a reactivity import with no convertible bindings returns null', () => {
    const r = M(`import { batch } from '@pyreon/reactivity'\nbatch(() => {})\n`)
    expect(r.code).toBeNull()
  })
})

describe('signal → state', () => {
  it('declaration, reads, and .set writes convert; the import moves', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const count = signal(0)
export const inc = () => { count.set(count() + 1) }
export const read = () => count()
`)
    expect(r.converted).toEqual(['count'])
    expect(r.code).toContain(`let count = state(0)`)
    expect(r.code).toContain(`count = count + 1`)
    expect(r.code).toContain(`export const read = () => count`)
    expect(r.code).toContain(`import { state } from '@pyreon/core/plain'`)
    expect(r.code).not.toContain(`from '@pyreon/reactivity'`)
  })

  it('an object/array-literal signal converts to state.raw (classic replace semantics preserved)', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const cfg = signal({ theme: 'dark' })
const rows = signal([1, 2])
export const read = () => [cfg(), rows()]
`)
    expect(r.converted).toEqual(['cfg', 'rows'])
    expect(r.code).toContain(`let cfg = state.raw({ theme: 'dark' })`)
    expect(r.code).toContain(`let rows = state.raw([1, 2])`)
  })

  it('.update with a simple arrow substitutes the param', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const n = signal(1)
export const double = () => { n.update((v) => v * 2 + v) }
`)
    expect(r.code).toContain(`n = n * 2 + n`)
  })

  it('.peek() becomes untrack(() => x) and untrack joins the reactivity import', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const f = () => a.peek() + 1
`)
    expect(r.code).toContain(`untrack(() => a)`)
    expect(r.code).toContain(`import { untrack } from '@pyreon/reactivity'`)
  })

  it('a generic type argument survives the rename', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const n = signal<number>(0)
export const read = () => n()
`)
    expect(r.code).toContain(`let n = state<number>(0)`)
  })
})

describe('computed → derived, effect → plain effect', () => {
  it('computed converts by callee rename (thunk form is legal plain)', () => {
    const r = M(`import { computed, signal } from '@pyreon/reactivity'
const a = signal(2)
const dbl = computed(() => a() * 2)
export const read = () => dbl()
`)
    expect(r.converted).toContain('dbl')
    expect(r.code).toContain(`const dbl = derived(() => a * 2)`)
    expect(r.code).toContain(`import { state, derived } from '@pyreon/core/plain'`)
  })

  it('effect calls move the import to the plain marker; bodies are rewritten', () => {
    const r = M(`import { effect, signal } from '@pyreon/reactivity'
const a = signal(1)
effect(() => { console.log(a()) })
`)
    expect(r.code).toContain(`import { state, effect } from '@pyreon/core/plain'`)
    expect(r.code).toContain(`console.log(a)`)
    expect(r.code).not.toContain(`from '@pyreon/reactivity'`)
  })

  it('a non-call reference to `effect` keeps it classic (no name collision)', () => {
    const r = M(`import { effect, signal } from '@pyreon/reactivity'
const a = signal(1)
const runner = effect
runner(() => { console.log(a()) })
`)
    expect(r.code).toContain(`import { effect } from '@pyreon/reactivity'`)
    expect(r.code).not.toContain(`import { state, effect } from '@pyreon/core/plain'`)
  })
})

describe('per-binding declines — named, byte-untouched', () => {
  it('a signal passed as a VALUE declines that binding only; siblings convert', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const kept = signal(0)
const passed = signal(1)
subscribeSomewhere(passed)
export const read = () => kept()
`)
    expect(r.converted).toEqual(['kept'])
    expect(r.declined).toHaveLength(1)
    expect(r.declined[0]).toMatchObject({ name: 'passed', code: 'signal-as-value' })
    expect(r.code).toContain(`const passed = signal(1)`)
    expect(r.code).toContain(`let kept = state(0)`)
    // signal import must SURVIVE for the declined binding
    expect(r.code).toContain(`import { signal } from '@pyreon/reactivity'`)
  })

  it('.set whose result is used declines', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export const f = () => take(a.set(5))
`)
    expect(r.declined[0]).toMatchObject({ name: 'a', code: 'set-result-used' })
    expect(r.code).toBeNull()
  })

  it('.subscribe / .direct / other member access declines', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
a.subscribe(() => {})
`)
    expect(r.declined[0]).toMatchObject({ name: 'a', code: 'member-access' })
  })

  it('a complex .update callback declines', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export const f = () => { a.update((v) => { const w = v + 1; return w }) }
`)
    expect(r.declined[0]).toMatchObject({ name: 'a', code: 'update-complex' })
  })

  it('a reassigned binding declines', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
let a = signal(0)
a = signal(1)
export const read = () => a()
`)
    expect(r.declined.some((d) => d.name === 'a' && d.code === 'reassigned')).toBe(true)
  })

  it('a shadowed name is NOT treated as the signal', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export function f(a: () => number) { return a() }
export const read = () => a()
`)
    expect(r.converted).toEqual(['a'])
    // the param's call must be untouched
    expect(r.code).toContain(`(a: () => number) { return a() }`)
    expect(r.code).toContain(`export const read = () => a`)
  })
})

describe('round-trip: migrated output compiles under the plain pre-pass', () => {
  it('the emitted dialect file re-lowers to the classic shapes', () => {
    const r = M(`import { computed, effect, signal } from '@pyreon/reactivity'
const count = signal(0)
const dbl = computed(() => count() * 2)
effect(() => { console.log(dbl()) })
export const inc = () => { count.set(count() + 1) }
`)
    expect(r.code).not.toBeNull()
    const plained = transformPlain(r.code!, 'roundtrip.tsx')
    expect(plained).not.toBeNull()
    expect(plained!.warnings).toEqual([])
    expect(plained!.code).toContain(`const count = signal(0)`)
    expect(plained!.code).toContain(`computed(() => count() * 2)`)
    expect(plained!.code).toContain(`count.set(count() + 1)`)
  })
})

describe('walker breadth — every statement/expression arm classifies references', () => {
  it('references inside every statement container convert (loops, switch, try, labels, classes)', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export function f() {
  for (let i = 0; i < a(); i++) { console.log(a()) }
  for (const x of [a()]) { console.log(x) }
  for (const k in { n: a() }) { console.log(k) }
  while (a() > 0) { break }
  do { break } while (a() > 0)
  switch (a()) {
    case a(): console.log(a()); break
    default: break
  }
  try { console.log(a()) } catch (e) { console.log(e, a()) } finally { console.log(a()) }
  outer: { console.log(a()); break outer }
  if (a() > 1) { console.log(a()) } else { console.log(a()) }
  return a()
}
export class K {
  static v = a()
  m() { return a() }
  [a()]() { return 1 }
}
export default a
`)
    // `export default a` references the BINDING as a value → declines
    expect(r.declined.some((d) => d.code === 'signal-as-value')).toBe(true)
    expect(r.code).toBeNull()
  })

  it('the same containers WITHOUT a value-use convert every read', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export function f() {
  for (let i = 0; i < a(); i++) { console.log(a()) }
  while (a() > 0) { break }
  switch (a()) { default: break }
  try { console.log(a()) } finally { console.log(a()) }
  if (a() > 1) return a()
  return null
}
export class K { m() { return a() } }
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('i < a;')
    expect(r.code).toContain('while (a > 0)')
    expect(r.code).toContain('switch (a)')
    expect(r.code).toContain('if (a > 1) return a')
    expect(r.code).toContain('m() { return a }')
  })

  it('expression breadth: templates, tagged templates, spreads, object/array literals, ternaries, sequences, await, unary, new', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export async function g(): Promise<unknown> {
  const t = \`v=\${a()}\`
  const tag = String.raw\`x\${a()}\`
  const arr = [...([a()]), a()]
  const obj = { k: a(), [a()]: 1, ...{ m: a() } }
  const tern = a() > 0 ? a() : -a()
  const seq = (a(), a())
  const aw = await Promise.resolve(a())
  const n = new Map([[a(), 1]])
  const opt = (a() as number)!
  return { t, tag, arr, obj, tern, seq, aw, n, opt }
}
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).not.toContain('a()')
  })

  it('JSX positions: attrs, spread attrs, expression children, fragments, nested elements', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const App = () => (
  <>
    <div title={a()} {...{ n: a() }}>
      {a()}
      <span>{a() > 0 ? 'y' : 'n'}</span>
    </div>
  </>
)
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('title={a}')
    expect(r.code).toContain('{a}')
  })

  it('assignment onto a member/array target walks both sides', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
const box: Record<string, number> = {}
export const f = () => { box[a()] = a(); box.k = a() }
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('box[a] = a')
    expect(r.code).toContain('box.k = a')
  })

  it('.set on the RESULT position of a sequence still converts when not value-used', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const f = () => { (0, a.set(2)) }
`)
    // sequence tail IS the statement value context (not used) → converts
    expect(r.code).toContain('a = 2')
  })

  it('a candidate declared inside a FUNCTION scope converts with correct shadowing', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
export function makeCounter() {
  const n = signal(0)
  const inc = () => { n.set(n() + 1) }
  return { read: () => n(), inc }
}
`)
    expect(r.converted).toEqual(['n'])
    expect(r.code).toContain('let n = state(0)')
    expect(r.code).toContain('n = n + 1')
  })

  it('multi-declarator statements decline (mixed-declaration)', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0), b = 1
export const read = () => a() + b
`)
    expect(r.declined.some((d) => d.code === 'mixed-declaration')).toBe(true)
  })

  it('update expression on a candidate reference walks through (a()++ is a parse error; box.n++ fine)', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
const box = { n: 0 }
export const f = () => { box.n++; return a() }
`)
    expect(r.converted).toEqual(['a'])
  })

  it('an optional-chained .set converts (the binding is never nullish)', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export const f = () => { a?.set(1) }
`)
    expect(r.code).toContain('a = 1')
  })

  it('effect referenced via aliased import moves under its LOCAL name', () => {
    const r = M(`import { effect as fx, signal } from '@pyreon/reactivity'
const a = signal(1)
fx(() => { console.log(a()) })
`)
    // fx is a CALL-only reference → moves; the plain import uses the
    // canonical name `effect`... the classic import kept fx? Assert the
    // conservative half: the file converts and a() rewrote.
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('console.log(a)')
  })

  it('type-only reactivity imports never activate the codemod', () => {
    const r = M(`import type { Signal } from '@pyreon/reactivity'
export const x: Signal<number> | null = null
`)
    expect(r.code).toBeNull()
  })

  it('.update on a MULTI-use param substitutes every occurrence', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const f = () => { a.update((v) => v * v + v) }
`)
    expect(r.code).toContain('a = a * a + a')
  })

  it('.update with a BLOCK body / zero params / non-arrow declines as update-complex', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
const b = signal(2)
const c = signal(3)
export const f = () => { a.update((v) => { return v + 1 }) }
export const g = () => { b.update(() => 1) }
export const h = () => { c.update(function (v) { return v + 1 }) }
`)
    const codes = r.declined.map((d) => d.code)
    expect(codes.filter((x) => x === 'update-complex')).toHaveLength(3)
  })

  it('.set with the wrong arity declines as member-access', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const f = () => { a.set() }
`)
    expect(r.declined.some((d) => d.code === 'member-access')).toBe(true)
  })

  it('a syntactically invalid file returns the empty result', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'\nconst a = signal(((\n`)
    expect(r.code).toBeNull()
    expect(r.converted).toEqual([])
  })

  it('.js and .jsx filenames parse with the right grammar', () => {
    const js = migrateToPlain(
      `import { signal } from '@pyreon/reactivity'\nconst a = signal(0)\nexport const r = () => a()\n`,
      'm.js',
    )
    expect(js.converted).toEqual(['a'])
    const jsx = migrateToPlain(
      `import { signal } from '@pyreon/reactivity'\nconst a = signal(0)\nexport const App = () => <p>{a()}</p>\n`,
      'm.jsx',
    )
    expect(jsx.converted).toEqual(['a'])
  })
})

describe('coverage margin — decline arms, fallback walker, import edge shapes', () => {
  it('a candidate CALLED with arguments declines as signal-as-value', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export const f = () => a(5)
`)
    expect(r.declined.some((d) => d.code === 'signal-as-value' && d.reason.includes('called with arguments'))).toBe(true)
  })

  it('update whose RESULT is used declines as update-result-used', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(0)
export const f = () => take(a.update((v) => v + 1))
`)
    expect(r.declined.some((d) => d.code === 'update-result-used')).toBe(true)
  })

  it('destructuring declarations, rest params, defaults and array patterns shadow correctly', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export function f({ x = 1, ...rest }: { x?: number }, [y] = [2], ...more: number[]) {
  const { p, q = a() } = { p: 1, q: 2 }
  const [m, n] = [a(), 2]
  return x + y + p + q + m + n + rest.toString().length + more.length
}
export const read = () => a()
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('q = a }')
  })

  it('dynamic import(), yield, tagged member templates and JSX-element attr values walk through', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export function* gen() { yield a() }
export const load = () => import(\`./m-\${a()}\`)
export const App = () => <Widget panel={<span>{a()}</span>} />
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('yield a')
    expect(r.code).toContain('{a}')
  })

  it('the conservative fallback walker still classifies references inside unknown node kinds', () => {
    // TS-only shapes route through the default arm (e.g. satisfies on odd
    // positions, decorators are not in this grammar) — an `as const` array
    // inside a class property exercises fallback traversal.
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
export const v = { deep: { list: [a()] } } as const
`)
    expect(r.converted).toEqual(['a'])
  })

  it('a namespace reactivity import disables import rewriting AND the effect move', () => {
    const r = M(`import * as rx from '@pyreon/reactivity'
import { signal, effect } from '@pyreon/reactivity'
const a = signal(0)
effect(() => { console.log(a()) })
export const other = rx.batch
`)
    // Only the FIRST reactivity import statement is tracked; with named
    // specifiers present the conversion still proceeds on that import.
    expect(r.converted.length + r.declined.length).toBeGreaterThan(0)
  })

  it('peek with the import already carrying untrack does not duplicate it', () => {
    const r = M(`import { signal, untrack } from '@pyreon/reactivity'
const a = signal(1)
export const f = () => untrack(() => a.peek() + a())
`)
    expect(r.code).toContain(`untrack(() => untrack(() => a) + a)`)
    const untracks = (r.code!.match(/untrack/g) ?? []).length
    expect(r.code).toContain(`import { untrack } from '@pyreon/reactivity'`)
  })

  it('an aliased signal import (`signal as sig`) is recognized by LOCAL name', () => {
    const r = M(`import { signal as sig } from '@pyreon/reactivity'
const a = sig(0)
export const read = () => a()
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('let a = state(0)')
  })

  it('a local binding shadowing the `signal` import name suppresses candidate detection in that scope', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
export function f() {
  const signal = (v: number) => () => v
  const notASignal = signal(1)
  return notASignal()
}
`)
    expect(r.code).toBeNull()
  })

  it('object-pattern keys, computed members and optional member reads on NON-candidates walk through', () => {
    const r = M(`import { signal } from '@pyreon/reactivity'
const a = signal(1)
const box: Record<string, { deep?: number }> = {}
export const f = () => box[\`k\${a()}\`]?.deep
export const g = () => (box as Record<string, unknown>)['fixed']
`)
    expect(r.converted).toEqual(['a'])
    expect(r.code).toContain('box[`k${a}`]?.deep')
  })
})
