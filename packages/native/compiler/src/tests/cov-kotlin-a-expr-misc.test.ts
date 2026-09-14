// Coverage: the remaining `emitKotlinExpr` arms in the Kotlin backend —
// signal / store writes, model + device-hook member reads, the index-range
// `Array.from` form, fragments, and the zero-param lambda shape.
//
// The common thread is that the WEB spelling is a CALL and the native shape
// is a FIELD (or the other way round), so an un-rewritten call is an
// unresolved reference or "expression of type Boolean cannot be invoked as
// a function". Each spec therefore pins the rewritten spelling AND asserts
// the web spelling is gone.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kt = (src: string) => transform(src, { target: 'kotlin' })

describe('Kotlin expr: signal and store writes', () => {
  const SRC = (body: string) => `
import { defineStore } from '@pyreon/store'
import { Stack, Text, Press } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const useApp = defineStore('app', () => {
  const n = signal(0)
  return { n }
})
export function App() {
  const s = useApp()
  const q = signal<number>(0)
  const run = () => { ${body} }
  return (<Stack><Press onPress={run}><Text>{String(q()) + String(s.store.n())}</Text></Press></Stack>)
}`

  it('`.update(fn)` substitutes the param into an assignment — for a signal and a store field alike', () => {
    const out = kt(SRC(`q.update((p) => p + 1); s.store.n.update((p) => p + 2)`)).code
    expect(out).toContain('q = q + 1')
    expect(out).toContain('PyreonStore_app.n = PyreonStore_app.n + 2')
    expect(out).not.toContain('.update(')
  })

  it('`.set(v)` is an assignment on both (Compose `by mutableStateOf` is a var)', () => {
    const out = kt(SRC(`q.set(5); s.store.n.set(3)`)).code
    expect(out).toContain('q = 5')
    expect(out).toContain('PyreonStore_app.n = 3')
  })

  it('an `.update` shape the substitution cannot handle WARNS rather than mis-emitting', () => {
    // a nested arrow shadowing the param defeats the IR-level substitution
    const r = kt(SRC(`q.update((p) => [1].map((p) => p + 1)[0])`))
    expect(r.warnings.join('\n')).toContain('`.update(fn)` lowering supports')
  })
})

describe('Kotlin expr: state-tree model member calls', () => {
  const MODEL = `import { model } from '@pyreon/state-tree'
import { Stack, Text, Button } from '@pyreon/primitives'
const cart = model({ state: { total: 0 } })
  .views((self) => ({ doubled: () => self.total() * 2 }))
  .actions((self) => ({ add: (n: number) => self.total.set(self.total() + n) }))
  .create()
export function App() {
  return (<Stack>
    <Text>{cart.total()}</Text>
    <Text>{cart.doubled()}</Text>
    <Button onPress={() => cart.add(3)}>add</Button>
  </Stack>)
}`

  it('a state READ drops its parens; a VIEW and an ACTION keep theirs', () => {
    const out = kt(MODEL).code
    // the state field is a signal on the web and a property natively
    expect(out).toContain('${PyreonModel_cart.total}')
    expect(out).toContain('${PyreonModel_cart.doubled}')
    // the action is a real method — parens preserved, args forwarded
    expect(out).toContain('PyreonModel_cart.add(3)')
  })
})

describe('Kotlin expr: device-hook reads — MutableState takes .value, a plain getter does not', () => {
  it('useBluetooth: scanning/devices/error take `.value`, `available` does not', () => {
    const out = kt(`import { useBluetooth } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const bt = useBluetooth()
  return (<Stack><Text>{String(bt.scanning()) + String(bt.available())}</Text></Stack>)
}`).code
    expect(out).toContain('bt.scanning.value')
    expect(out).toContain('(bt.available).toString()')
    expect(out).not.toContain('bt.available.value')
  })

  it('useWakeLock: `active` takes `.value`, `supported` does not', () => {
    const out = kt(`import { useWakeLock } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const wl = useWakeLock()
  return (<Stack><Text>{String(wl.active()) + String(wl.supported())}</Text></Stack>)
}`).code
    expect(out).toContain('wl.active.value')
    expect(out).toContain('(wl.supported).toString()')
    expect(out).not.toContain('wl.supported.value')
  })
})

describe('Kotlin expr: predicates, lambdas and fragments', () => {
  const SRC = (body: string, read: string) => `
import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1, 2, 3])
${body}
  return (<><Stack><Text>{${read}}</Text></Stack></>)
}`

  it('some/every become any/all, and a ZERO-param lambda emits no binder head', () => {
    const out = kt(SRC(
      `  const a = computed(() => xs().some((v) => v > 1))
  const b = computed(() => xs().every((v) => v > 1))
  const c = computed(() => xs().map(() => 1))`,
      `String(a()) + String(b()) + String(c().length)`,
    )).code
    expect(out).toContain('xs.any({ v -> v > 1 })')
    expect(out).toContain('xs.all({ v -> v > 1 })')
    expect(out).toContain('xs.map({ 1 })')
  })

  it('a JSX FRAGMENT lowers to a Column (Compose has no transparent group node)', () => {
    const out = kt(SRC(`  const a = computed(() => xs().length)`, `String(a())`)).code
    // the fragment wrapper plus the inner Stack — two Columns
    expect(out.match(/Column \{/g)!.length).toBeGreaterThanOrEqual(2)
  })

  it('a template literal keeps its leading/trailing quasis and interpolates with ${}', () => {
    const out = kt(SRC(`  const a = computed(() => xs().length)`, '`x${a()}y`')).code
    expect(out).toContain('"x${a}y"')
  })
})

describe('Kotlin expr: Array.from({length}) index range', () => {
  it('binds the index param as an Int local for the body emit, restoring a shadowed outer local', () => {
    const out = kt(`
import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const i = signal<string>('outer')
  const a = computed(() => Array.from({ length: 3 }, (i, j) => j * 2))
  return (<Stack><Text>{i() + String(a().length)}</Text></Stack>)
}`).code
    expect(out).toContain('(0 until 3).map({ j -> j * 2 })')
    // the outer `i` is untouched by the loop-param registration
    expect(out).toContain('"${i + (a.length).toString()}"')
  })
})

describe('Kotlin expr: a `Double` type-ALIAS folds like a float number, not an Int', () => {
  it('Number.isInteger / isNaN on a Double-typed PARAM emit the runtime check, not a constant', () => {
    const out = kt(`
import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
function pick(d: Double): boolean { return Number.isInteger(d) }
function nan(d: Double): boolean { return isNaN(d) }
export function App() {
  const a = computed(() => pick(1.5))
  const b = computed(() => nan(1.5))
  return (<Stack><Text>{String(a()) + String(b())}</Text></Stack>)
}`).code
    // an INT-typed arg would fold to the constants `true` / `false`
    expect(out).toContain('fun pick(d: Double): Boolean = ((d) % 1.0 == 0.0)')
    expect(out).toContain('fun nan(d: Double): Boolean = (d).isNaN()')
  })
})
