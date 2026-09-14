// Branch matrices for `emitSwiftStore` / `emitSwiftModel` — the two
// singleton-class emits.
//
// Both swap the module-level signal/function NAME SETS to the store's own
// members while emitting, and restore them after. That swap is what makes a
// method body's `n()` a bare property read (the store's field) rather than a
// call — and getting it wrong is the 1:1-inverted class the repo already
// names: web-correct source failing to compile, and native-compiling source
// reading the accessor instead of the value.
//
// The interesting arms are the `?? []` / `hasMembers` pairs: a store or model
// with NO computeds/views and NO methods must skip the swap entirely and emit
// only its stored properties. Each is asserted against the members-bearing
// twin.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code
const P = '@pyreon/primitives'

describe('defineStore', () => {
  const SRC = `import { Stack, Text, Press } from '${P}'
import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'
const useApp = defineStore('app', () => {
  const n = signal(0)
  const label = signal('x')
  const doubled = computed(() => n() * 2)
  const quad = computed(() => doubled() * 2)
  const inc = () => { n.set(n() + 1) }
  return { n, label, doubled, quad, inc }
})
const useBare = defineStore('bare', () => {
  const z = signal(1)
  return { z }
})
export function App() {
  const a = useApp()
  const b = useBare()
  return (<Stack><Press onPress={() => { a.inc() }}><Text>{() => \`\${a.doubled}\${a.quad}\${b.z()}\`}</Text></Press></Stack>)
}`

  it('fields become stored properties; computeds become typed getters reading them BARE', () => {
    const out = swift(SRC)
    expect(out).toContain('final class PyreonStore_app: PyreonStoreProtocol')
    expect(out).toContain('var n: Int = 0')
    expect(out).toContain('var label: String = "x"')
    // `n()` inside the store body is a FIELD read — the parens must drop, or
    // the emit calls an Int.
    expect(out).toContain('var doubled: Int { n * 2 }')
    // a LATER computed may read an EARLIER one — the name set grows as it goes
    expect(out).toContain('var quad: Int { doubled * 2 }')
    expect(out).toContain('func inc() {')
    expect(out).toContain('n = n + 1')
  })

  it('a store with NO computeds and NO methods skips the swap and emits only its fields', () => {
    const out = swift(SRC)
    expect(out).toMatch(
      /final class PyreonStore_bare: PyreonStoreProtocol \{\n\s+static let shared = PyreonStore_bare\(\)\n\s+var z: Int = 1\n\s+private init\(\) \{\}/,
    )
  })

  it('a computed whose type cannot be inferred annotates `Any`, not a guess', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'
declare function mystery(): unknown
const useApp = defineStore('app', () => {
  const n = signal(0)
  const weird = computed(() => mystery())
  return { n, weird }
})
export function App() {
  const a = useApp()
  return (<Stack><Text>{String(a.weird)}</Text></Stack>)
}`)
    expect(out).toContain('var weird: Any {')
  })
})

describe('model()', () => {
  const SRC = `import { Stack, Text, Press } from '${P}'
import { model } from '@pyreon/state-tree'
const m = model({ state: { count: 1, tag: 'a' } })
  .views((me) => ({ double: () => me.count() * 2, quad: () => me.double() * 2 }))
  .actions((me) => ({ bump: () => { me.count.set(me.count() + 1) } }))
  .create()
const bare = model({ state: { q: 1 } }).create()
export function App() {
  return (<Stack><Press onPress={() => { m.bump() }}><Text>{() => \`\${m.double()}\${m.quad()}\${bare.q()}\`}</Text></Press></Stack>)
}`

  it('state becomes stored properties; views become getters; a later view reads an earlier one', () => {
    const out = swift(SRC)
    expect(out).toContain('final class PyreonModel_m: PyreonModelProtocol')
    expect(out).toContain('var count: Int = 1')
    expect(out).toContain('var tag: String = "a"')
    expect(out).toContain('var double: Int { count * 2 }')
    expect(out).toContain('var quad: Int { double * 2 }')
    expect(out).toContain('func bump() {')
  })

  it('a model with NO views and NO actions emits only its state', () => {
    const out = swift(SRC)
    expect(out).toMatch(
      /final class PyreonModel_bare: PyreonModelProtocol \{\n\s+static let shared = PyreonModel_bare\(\)\n\s+var q: Int = 1\n\s+private init\(\) \{\}/,
    )
  })

  it('a view whose type cannot be inferred annotates `Any`', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { model } from '@pyreon/state-tree'
declare function mystery(): unknown
const m = model({ state: { c: 1 } }).views((me) => ({ odd: () => mystery() })).create()
export function App() {
  return (<Stack><Text>{String(m.odd())}</Text></Stack>)
}`)
    expect(out).toContain('var odd: Any {')
  })

  it('from a COMPONENT, a state read drops its parens and an action keeps them', () => {
    // The inversion this closes: `m.count` alone is the accessor on web and
    // `m.count()` is the value, while natively the two are the other way
    // round — so ONE spelling has to work on both.
    const out = swift(SRC)
    expect(out).toContain('PyreonModel_m.shared.double')
    expect(out).toContain('PyreonModel_m.shared.bump()')
    expect(out).toContain('PyreonModel_bare.shared.q')
    expect(out).not.toContain('PyreonModel_bare.shared.q()')
  })
})

describe('only ONE member kind present — the other list is absent, not empty', () => {
  it('a model with actions but no views, and one with views but no actions', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { model } from '@pyreon/state-tree'
const onlyActions = model({ state: { c: 1 } }).actions((me) => ({ inc: () => { me.c.set(1) } })).create()
const onlyViews = model({ state: { d: 1 } }).views((me) => ({ dbl: () => me.d() * 2 })).create()
export function App() {
  return (<Stack><Press onPress={() => { onlyActions.inc() }}><Text>{() => String(onlyViews.dbl())}</Text></Press></Stack>)
}`)
    expect(out).toContain('final class PyreonModel_onlyActions')
    expect(out).toContain('func inc() {')
    expect(out).toContain('final class PyreonModel_onlyViews')
    expect(out).toContain('var dbl: Int { d * 2 }')
  })

  it('a store with methods but no computeds, and one with computeds but no methods', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'
const useOnlyFns = defineStore('fns', () => { const z = signal(0); const bump = () => { z.set(1) }; return { z, bump } })
const useOnlyComp = defineStore('cmp', () => { const y = signal(0); const dy = computed(() => y() * 2); return { y, dy } })
export function App() {
  const s1 = useOnlyFns()
  const s2 = useOnlyComp()
  return (<Stack><Press onPress={() => { s1.bump() }}><Text>{() => String(s2.dy)}</Text></Press></Stack>)
}`)
    expect(out).toContain('final class PyreonStore_fns')
    expect(out).toContain('func bump() {')
    expect(out).toContain('final class PyreonStore_cmp')
    expect(out).toContain('var dy: Int { y * 2 }')
  })
})
