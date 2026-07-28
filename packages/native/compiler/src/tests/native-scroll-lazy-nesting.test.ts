// `<Scroll><For/></Scroll>` — the canonical list idiom — CRASHED on Android.
//
// `<For>` lowers to a Compose `LazyColumn`, which is itself a vertical
// scroller. Nesting one inside `Column(Modifier.verticalScroll())` — what
// `<Scroll>` emitted — is explicitly forbidden, and Compose does not reject it
// at COMPILE time. It throws at MEASURE time, taking the activity down:
//
//   IllegalStateException: Vertically scrollable component was measured with an
//   infinity maximum height constraints … nesting layouts like LazyColumn and
//   Column(Modifier.verticalScroll())
//
// SwiftUI has no equivalent rule — `ScrollView { LazyVStack { … } }` is the
// idiomatic pair — so the SAME shared source rendered fine on iOS and crashed
// on Android. Found by running the finance example on a real emulator; a
// measure-time constraint is invisible to compile-only validation, which is
// why this needed a device gate to surface.
//
// FIX: when a vertical `<Scroll>` wraps a single `<For>` and carries no layout
// of its own, the LazyColumn replaces the wrapper — it already scrolls, so the
// author's intent is preserved.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const swift = (src: string) => transform(src, { target: 'swift' })

const LIST = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Scroll, Stack, Text } from '@pyreon/primitives'
type Row = { id: number; label: string }
export function C() {
  const rows = signal<Row[]>([{ id: 1, label: 'a' }])
  return (
    <Stack>
      <Scroll>
        <For each={rows} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For>
      </Scroll>
    </Stack>
  )
}`

describe('<Scroll> wrapping a lazy list (Kotlin)', () => {
  it('does NOT nest a LazyColumn inside a verticalScroll Column', () => {
    const out = kotlin(LIST).code
    expect(out).toContain('LazyColumn {')
    // The regression: a scrolling wrapper around the lazy list.
    expect(out).not.toContain('verticalScroll(rememberScrollState())')
  })

  it('emits ZERO warnings — the unwrap is silent, not a diagnostic', () => {
    expect(kotlin(LIST).warnings ?? []).toEqual([])
  })

  it('KEEPS the scroll wrapper when the <Scroll> carries its own layout', () => {
    // Unwrapping would silently drop the padding/testTag. The author's nesting
    // is then their own to resolve — the compiler must not restructure a tree
    // in a way that loses declared layout.
    const WITH_LAYOUT = LIST.replace('<Scroll>', '<Scroll data-testid="list-scroll">')
    const out = kotlin(WITH_LAYOUT).code
    expect(out).toContain('verticalScroll(rememberScrollState())')
    expect(out).toContain('list-scroll')
  })

  it('KEEPS the wrapper for a MIXED child list (a header plus the list)', () => {
    // With more than the lazy child, the outer scroller is doing real work.
    const MIXED = LIST.replace(
      '<Scroll>',
      '<Scroll><Text>Header</Text>',
    )
    expect(kotlin(MIXED).code).toContain('verticalScroll(rememberScrollState())')
  })

  it('KEEPS the wrapper on a HORIZONTAL scroll (a different axis, no conflict)', () => {
    // LazyColumn scrolls vertically; a horizontalScroll Row around it is a
    // legitimate two-axis arrangement, not the forbidden nesting.
    const HORIZ = LIST.replace('<Scroll>', '<Scroll axis="horizontal">')
    expect(kotlin(HORIZ).code).toContain('horizontalScroll(rememberScrollState())')
  })

  it('SWIFT is unchanged — ScrollView + LazyVStack is the idiomatic pair there', () => {
    const out = swift(LIST).code
    expect(out).toContain('ScrollView')
    expect(out).toContain('LazyVStack')
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const res = validateKotlin(kotlin(LIST).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
