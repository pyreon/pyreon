// `@pyreon/state-tree`'s `model()` was 1:1-INVERTED on native: the source
// that compiled was the source that is wrong on web, and the canonical web
// source did not compile.
//
// Two halves, each independently shipped-broken.
//
// 1. THE CHAIN. The web API is a builder — `model({ state })
//    .views(f).actions(f).create()`. The recognizer matched only the bare
//    `model({ state }).create()`, so every model with an action (i.e. every
//    model that can change) fell through to a VERBATIM emit:
//
//        private let counter = model((state: __Obj0(count: 0)))
//          .actions({ `self` in (__Obj1(increment: "")) }).create()
//
//    `model` does not exist on either target, and the action became a String
//    FIELD. Zero warnings on either target — the failure surfaced as a
//    swiftc/kotlinc error inside generated code, naming nothing.
//
// 2. THE READ. A model's state field is a SIGNAL, so the web read is
//    `counter.count()`. That emitted `…shared.count()` — calling an Int.
//    The only form that compiled was `counter.count`, which on web renders
//    the accessor function rather than its value. Note the emit already
//    lowered the WRITE (`counter.count.set(1)` → `count = 1`): it knew the
//    field was a signal when written and forgot when read.
//
// The fix mirrors `defineStore`, which had already solved every hard part —
// views become computed properties, actions become methods, and the member
// bodies address state through the factory's `self` the same way a component
// body addresses its props param.
//
// Bisect-verify: revert the chain walk in `tryModelDefnFromTopLevel` and the
// specs below fail with the verbatim `model(` passthrough; revert the
// zero-arg read branch in either emitter and the read specs fail with
// `.count()`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

/** The canonical web shape, verbatim: chain, signal reads, signal writes. */
const APP = `import { model } from '@pyreon/state-tree'
import { Stack, Text, Button } from '@pyreon/primitives'

const cart = model({ state: { total: 0, note: 'empty' } })
  .views((self) => ({ doubled: () => self.total() * 2 }))
  .actions((self) => ({
    add: (n: number) => self.total.set(self.total() + n),
    reset: () => self.total.set(0),
  }))
  .create()

export function App() {
  return (
    <Stack>
      <Text>{cart.total()}</Text>
      <Text>{cart.doubled()}</Text>
      <Text>{cart.note()}</Text>
      <Button onPress={() => cart.add(3)}>add</Button>
      <Button onPress={() => cart.reset()}>reset</Button>
    </Stack>
  )
}`

const emit = (target: 'swift' | 'kotlin') => transform(APP, { target })
const code = (target: 'swift' | 'kotlin') => emit(target).code

describe('a chained model lowers instead of emitting itself verbatim', () => {
  it('Swift: views are computed properties, actions are methods', () => {
    const out = code('swift')
    expect(out).toContain('var doubled: Int { total * 2 }')
    expect(out).toContain('func add(_ n: Int) { total = total + n }')
    expect(out).toContain('func reset() { total = 0 }')
  })

  it('Kotlin: views are reactive getters, actions are funs', () => {
    const out = code('kotlin')
    expect(out).toContain('val doubled get() = total * 2')
    expect(out).toContain('fun add(n: Int)')
    expect(out).toContain('total = total + n')
  })

  // The shape that shipped. `model(` surviving into the emit is the whole
  // bug in one string — it is a JS function neither target has.
  it('the verbatim passthrough is gone on both targets', () => {
    expect(code('swift')).not.toContain('model(')
    expect(code('kotlin')).not.toContain('model(')
  })

  // Both halves together, deliberately: the BROKEN emit was silent too, so
  // "no warnings" alone passes against it and guards nothing. Paired with
  // the singleton actually being emitted, it means silent AND correct.
  it('lowering the chain is silent AND produces the singleton', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = emit(target)
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('PyreonModel_cart')
    }
  })
})

describe('a state field is a signal: reads drop parens, actions keep them', () => {
  it('Swift', () => {
    const out = code('swift')
    // Was `…shared.count()` — calling an Int.
    expect(out).toContain('Text(verbatim: "\\(PyreonModel_cart.shared.total)")')
    expect(out).toContain('Text(verbatim: "\\(PyreonModel_cart.shared.doubled)")')
    expect(out).toContain('Text(verbatim: "\\(PyreonModel_cart.shared.note)")')
    // An ACTION is a call and must keep its parens + args.
    expect(out).toContain('PyreonModel_cart.shared.add(3)')
    expect(out).toContain('PyreonModel_cart.shared.reset()')
  })

  it('Kotlin', () => {
    const out = code('kotlin')
    expect(out).toContain('Text(text = "${PyreonModel_cart.total}")')
    expect(out).toContain('Text(text = "${PyreonModel_cart.doubled}")')
    expect(out).toContain('PyreonModel_cart.add(3)')
    expect(out).toContain('PyreonModel_cart.reset()')
  })

  // Inside a member body the same rule applies to the model's OWN state,
  // reached through the factory's `self`.
  it('`self.total()` in a member body emits the property bare, both targets', () => {
    expect(code('swift')).not.toContain('total()')
    expect(code('kotlin')).not.toContain('total()')
  })
})

describe('the state seed types the field', () => {
  const seeded = (v: string, target: 'swift' | 'kotlin') =>
    transform(
      `const cart = model({ state: { total: ${v} } }).create()
       export function App() { return <Text>{cart.total()}</Text> }`,
      { target },
    ).code

  // Encoding the seed as a raw literal + a three-value type tag forced Int;
  // a fractional seed then emitted `var total: Int = 2.5`.
  it('a fractional seed is a Double, not an Int that cannot hold it', () => {
    expect(seeded('2.5', 'swift')).toContain('var total: Double = 2.5')
    expect(seeded('2.5', 'kotlin')).toContain('mutableStateOf(2.5)')
  })

  it('an integer seed is untouched — the widening is additive', () => {
    expect(seeded('0', 'swift')).toContain('var total: Int = 0')
    expect(seeded('0', 'kotlin')).toContain('mutableStateOf(0)')
  })
})

describe('an unsupported builder step declines by name', () => {
  // Silence is what made the original bug expensive. A step we do not lower
  // must say which step, not fall through to a verbatim emit.
  it('`.asHook()` warns naming itself', () => {
    const r = transform(
      `const c = model({ state: { n: 0 } }).asHook('c').create()
       export function App() { return <Text>{c.n()}</Text> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('.asHook()')
  })
})

describe('the emitted model survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(code('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(code('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
