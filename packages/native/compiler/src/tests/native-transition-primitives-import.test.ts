// `<Transition>` / `<TransitionGroup>` imported from `@pyreon/primitives` —
// the import path that resolves on EVERY target.
//
// This closes a phantom capability. Both emitters have lowered these two
// tags to real platform animation since M2.7/M2.8, and the compiler
// dispatches purely on the TAG NAME, so a bare (un-imported) tag has always
// emitted correctly. But the only runtime export lived in
// `@pyreon/runtime-dom` — a package the compiler correctly flags WEB-ONLY —
// so the one import that made the tag resolve on web produced a
// "no native emit" warning, and the import native accepted did not exist.
// `@pyreon/primitives` now exports both, and this file locks that:
//
//   1. importing them from `@pyreon/primitives` emits ZERO warnings, and
//   2. the emitted SwiftUI / Compose is unchanged by the import path.
//
// The second half is the load-bearing one: an import-path change must not
// move a single byte of an emit that four other test files already prove.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

/** The shape a real multiplatform app writes: ONE import for everything. */
const fromPrimitives = `import { Stack, Text, Transition } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const on = signal(false)
  return (<Stack><Transition name="slide-up" show={on()}><Text>hi</Text></Transition></Stack>)
}`

/** The same source with the tag un-imported — what the emit tests use today. */
const bareTag = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const on = signal(false)
  return (<Stack><Transition name="slide-up" show={on()}><Text>hi</Text></Transition></Stack>)
}`

/** The web-only path — still legal, still correctly warned about. */
const fromRuntimeDom = `import { Transition } from '@pyreon/runtime-dom'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const on = signal(false)
  return (<Stack><Transition name="slide-up" show={on()}><Text>hi</Text></Transition></Stack>)
}`

const groupFromPrimitives = `import { Stack, Text, TransitionGroup } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Row = { id: number; label: string }
export function C() {
  const rows = signal<Row[]>([])
  return (
    <Stack>
      <TransitionGroup>
        <For each={rows()} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For>
      </TransitionGroup>
    </Stack>
  )
}`

describe('<Transition> imported from @pyreon/primitives', () => {
  it('emits ZERO warnings on both targets', () => {
    expect(transform(fromPrimitives, { target: 'swift' }).warnings).toEqual([])
    expect(transform(fromPrimitives, { target: 'kotlin' }).warnings).toEqual([])
  })

  it('Swift: the preset lowers to the platform transition', () => {
    const out = transform(fromPrimitives, { target: 'swift' }).code
    expect(out).toContain('.transition(.move(edge: .bottom).combined(with: .opacity))')
    expect(out).toContain('.animation(.default, value: on)')
  })

  it('Compose: the preset lowers to AnimatedVisibility enter/exit', () => {
    const out = transform(fromPrimitives, { target: 'kotlin' }).code
    expect(out).toContain('AnimatedVisibility(visible = on')
    expect(out).toContain('slideInVertically(')
    expect(out).toContain('slideOutVertically(')
  })

  // The point of the change is REACH, not new emit behaviour. If the import
  // path moved any byte of the output, the four existing emit test files
  // would be describing a shape real apps no longer produce.
  it('emits BYTE-IDENTICALLY to the un-imported tag on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(fromPrimitives, { target }).code).toBe(
        transform(bareTag, { target }).code,
      )
    }
  })

  // The runtime-dom path is genuinely web-only and must KEEP warning — the
  // fix is a new reachable import, not a loosened rule. The assertion is on
  // the package's own RATIONALE, not on the blanket suffix: that suffix
  // already names `@pyreon/primitives` for every web-only package, so a
  // bare "mentions @pyreon/primitives" check would pass against the
  // pre-fix rationale and prove nothing.
  it('the @pyreon/runtime-dom import still warns, and its RATIONALE routes Transition here', () => {
    const warnings = transform(fromRuntimeDom, { target: 'swift' }).warnings
    const webOnly = warnings.filter((w) => w.includes('@pyreon/runtime-dom is WEB-ONLY'))
    expect(webOnly.length).toBe(1)
    expect(webOnly[0]).toContain(
      '`<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives`',
    )
  })

  // The guidance this PR exists to correct: `@pyreon/kinetic`'s rationale
  // told authors its preset vocabulary crosses "via `<Transition name>`"
  // without naming an import that resolves on native — and the only one
  // that existed was `@pyreon/runtime-dom`, which is itself web-only.
  it('still points at the portable spelling when a kinetic chain cannot lower', () => {
    // This used to assert a blanket "@pyreon/kinetic is WEB-ONLY" warning. The
    // package now declares a nativeFrontend — a `.preset()` chain LOWERS — so
    // that warning is gone and asserting it would demand a diagnostic about a
    // shipped capability.
    //
    // The invariant it protected is the one that matters and still holds:
    // whenever a chain CANNOT cross, the message names the portable spelling
    // rather than leaving the author to guess. It just moved from a blanket
    // package warning onto the path that actually declines — a chain with no
    // preset, which has no animation vocabulary to carry across.
    const src = `import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div')
export function C() { return (<Stack><Box><Text>x</Text></Box></Stack>) }`
    const warnings = transform(src, { target: 'swift' }).warnings
    const decline = warnings.filter((w) => w.includes('`Box`'))
    expect(decline.length).toBe(1)
    expect(decline[0]).toContain('<Transition show name="fade">')
    expect(decline[0]).toContain('@pyreon/primitives')
  })

  it('does NOT blanket-warn for a kinetic chain that DOES lower', () => {
    const src = `import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset('fade')
export function C() { return (<Stack><Box><Text>x</Text></Box></Stack>) }`
    expect(transform(src, { target: 'swift' }).warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())('type-checks against the Swift stubs', () => {
    const res = validateSwiftWithStubs(transform(fromPrimitives, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.runIf(isKotlincAvailable())('compiles against the Kotlin stubs', () => {
    const res = validateKotlin(transform(fromPrimitives, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('<TransitionGroup> imported from @pyreon/primitives', () => {
  it('emits ZERO warnings on both targets', () => {
    expect(transform(groupFromPrimitives, { target: 'swift' }).warnings).toEqual([])
    expect(transform(groupFromPrimitives, { target: 'kotlin' }).warnings).toEqual([])
  })

  it('Swift: a VStack animated off the list length', () => {
    const out = transform(groupFromPrimitives, { target: 'swift' }).code
    expect(out).toContain('VStack {')
    expect(out).toContain('.animation(.default, value: rows.count)')
  })

  it('Compose: a Column carrying animateContentSize()', () => {
    expect(transform(groupFromPrimitives, { target: 'kotlin' }).code).toContain(
      'Column(modifier = Modifier.animateContentSize())',
    )
  })
})
