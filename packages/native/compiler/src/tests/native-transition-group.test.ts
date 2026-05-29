// Phase 5.3 — `<TransitionGroup>` native emit. Own test file (not
// canonical-primitives.test.ts) so it doesn't append-conflict with the
// in-flight emit PRs that also extend that file.
//
// `<TransitionGroup>` animates the enter/leave of a KEYED list — its child
// is typically a `<For each={items}>`. SwiftUI animates `ForEach`
// insert/remove with the default transition when the container carries
// `.animation(.default, value: <list>)`; the list driver is pulled from the
// For child's `each` signal. Compose uses `Modifier.animateContentSize()` on
// a `Column` (its built-in "animate when content changes" primitive — no
// explicit driver needed). Same semantics, platform-idiomatic emit — exactly
// the lockstep shape `<Transition>` uses (ZStack+animation vs
// AnimatedVisibility).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const LIST_SRC = `
  type Item = { id: number; label: string }
  export function ItemList() {
    const items = signal<Item[]>([])
    return (
      <TransitionGroup>
        <For each={items} by={(i) => i.id}>{(item) => <Text>{item.label}</Text>}</For>
      </TransitionGroup>
    )
  }
`

describe('Phase 5.3 — <TransitionGroup> native emit', () => {
  it('Swift: VStack wrapping the For, animation driven by the For `each` signal', () => {
    const out = transform(LIST_SRC, { target: 'swift' }).code
    expect(out).toContain('VStack {')
    expect(out).toContain('ForEach(items, id: \\.id)')
    // The list animation is keyed on the For's `each` list — so SwiftUI
    // animates item insert/remove.
    expect(out).toContain('.animation(.default, value: items)')
  })

  it('Kotlin: Column with Modifier.animateContentSize() wrapping the For', () => {
    const out = transform(LIST_SRC, { target: 'kotlin' }).code
    expect(out).toContain('Column(modifier = Modifier.animateContentSize()) {')
    // The For body renders inside the animated column.
    expect(out).toContain('items')
  })

  it('Swift: no For child → plain VStack, NO value-less .animation', () => {
    const out = transform(
      `export function Static() { return <TransitionGroup><Text>hi</Text></TransitionGroup> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('VStack {')
    expect(out).toContain('Text("hi")')
    // Nothing changes to animate — no deprecated value-less .animation emitted.
    expect(out).not.toContain('.animation(')
  })

  it('Kotlin: static content still uses animateContentSize (no driver needed)', () => {
    const out = transform(
      `export function Static() { return <TransitionGroup><Text>hi</Text></TransitionGroup> }`,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('Column(modifier = Modifier.animateContentSize()) {')
    expect(out).toContain('Text(text = "hi")')
  })
})
