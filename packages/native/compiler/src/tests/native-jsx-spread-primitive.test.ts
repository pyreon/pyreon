// Zero-silent-drops (P1): a JSX spread on a CANONICAL PRIMITIVE — `<Stack
// {...cfg()}>` — used to be SILENTLY dropped. The dedicated primitive emitters
// (emitSwiftStack / emitKotlinStack / …) read their layout attrs by NAME via
// `readStaticAttr`, which explicitly ignores spreads — so the spread's props
// (gap/padding/…) never reached the emitted `VStack` / `Column` and the layout
// was silently WRONG (clean compile, no warning, missing modifiers).
//
// A runtime prop-bag can't lower to a static SwiftUI view / Compose composable
// (those take fixed layout args via modifier chains, not a forwarded bag), so
// the resolution is a NAMED build-failing warning naming the escape hatch (set
// the props explicitly). A spread on a USER component is unaffected — it still
// expands against the component's declared props at the constructor call.
//
// The guard lives once at the top of emitSwift/KotlinJsx (the single entry for
// every jsx-element, so it covers every dedicated emitter AND the generic
// fallthrough exactly once). Bisect-load-bearing: neuter the guard's condition
// → the four "primitive-spread warns" specs fail (silent drop) while the
// user-component specs (no-warn + compile-clean) stay green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const PRIM = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const cfg = signal({ gap: "md" })
  return (<Stack {...cfg()}><Text>x</Text></Stack>)
}`

// A spread on a USER component expands against its declared props — supported,
// must stay silent AND must still compile clean (both targets).
const USER = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Item = { id: number; label: string }
function Row(props: { item: Item }) {
  return (<Text>{props.item.label}</Text>)
}
export function App() {
  const it = signal({ id: 1, label: "a" })
  return (<Stack><Row {...{ item: it() }} /></Stack>)
}`

const RE = /spread is not lowered to native/
const warns = (src: string, target: 'swift' | 'kotlin') =>
  transform(src, { target }).warnings.filter((w) => RE.test(w))

describe('P1 — JSX spread on a native primitive fails loudly (was a silent drop)', () => {
  it('Swift: `<Stack {...cfg()}>` warns (named, with escape hatch)', () => {
    const w = warns(PRIM, 'swift')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0]).toContain('props are DROPPED')
    expect(w[0]).toContain('Pass props explicitly')
  })

  it('Kotlin: `<Stack {...cfg()}>` warns identically (both targets fail loud)', () => {
    const w = warns(PRIM, 'kotlin')
    expect(w.length).toBeGreaterThan(0)
    expect(w[0]).toContain('props are DROPPED')
  })

  // Exactly-once: the guard sits at the single jsx-element entry, so it must
  // not double-fire when a primitive's emitter falls through to the generic
  // path (where the old per-arg warning lived). Locks against both regressing
  // to silent (0) AND my fix double-warning (2).
  it('Swift: the primitive-spread warning fires EXACTLY once (no double-fire)', () => {
    expect(warns(PRIM, 'swift').length).toBe(1)
  })

  it('Kotlin: the primitive-spread warning fires EXACTLY once', () => {
    expect(warns(PRIM, 'kotlin').length).toBe(1)
  })

  // A spread on a USER component is valid (expands) — must NOT warn. Guards
  // against the guard over-firing on the supported path.
  it('Swift: a spread on a USER component does NOT warn (still expands)', () => {
    expect(warns(USER, 'swift').length).toBe(0)
  })

  it('Kotlin: a spread on a USER component does NOT warn (still expands)', () => {
    expect(warns(USER, 'kotlin').length).toBe(0)
  })

  // The supported path must still COMPILE clean — proves the guard doesn't
  // break valid spread expansion (real swiftc -typecheck vs SwiftUI + kotlinc).
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the user-component-spread app TYPECHECKS against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(transform(USER, { target: 'swift' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Android: the user-component-spread app compiles via kotlinc',
    () => {
      const r = validateKotlin(transform(USER, { target: 'kotlin' }).code)
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
})
