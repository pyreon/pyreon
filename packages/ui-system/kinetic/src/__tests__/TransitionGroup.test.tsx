/**
 * Smoke + diff tests for `<TransitionGroup>` — exercises the keyed
 * enter/leave diff machinery against a manually-driven reactive
 * children accessor.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import TransitionGroup from '../TransitionGroup'

const keyedChild = (k: string) =>
  ({ type: 'div', props: { class: k }, children: [], key: k }) as any

describe('TransitionGroup', () => {
  it('returns a reactive accessor that renders the initial keyed children', () => {
    const accessor = TransitionGroup({
      children: [keyedChild('a'), keyedChild('b')],
    }) as unknown as () => any
    const result = accessor()
    // Returns a Fragment containing one <Transition> per child
    expect(result).toBeTruthy()
    expect(result.children?.length ?? 0).toBe(2)
  })

  it('detects leaving children when the accessor returns fewer entries', () => {
    const items = signal<string[]>(['a', 'b', 'c'])
    const accessor = TransitionGroup({
      children: () => items().map(keyedChild),
    }) as unknown as () => any

    // First render: all three present
    const first = accessor()
    expect(first.children?.length).toBe(3)

    // Drop 'b' from current — TransitionGroup keeps it as a "leaving" child
    items.set(['a', 'c'])
    const second = accessor()
    // Current (2) + leaving (1) = 3 still rendered
    expect(second.children?.length).toBe(3)
  })

  it('reuses a child when it reappears after starting to leave', () => {
    const items = signal<string[]>(['a', 'b'])
    const accessor = TransitionGroup({
      children: () => items().map(keyedChild),
    }) as unknown as () => any

    accessor()
    items.set(['a']) // 'b' is leaving
    accessor()
    items.set(['a', 'b']) // 'b' reappears — leaving entry cancelled
    const result = accessor()
    expect(result.children?.length).toBe(2)
  })

  it('handles static array children (non-accessor form)', () => {
    const accessor = TransitionGroup({
      children: [keyedChild('x'), keyedChild('y'), keyedChild('z')],
    }) as unknown as () => any
    const result = accessor()
    expect(result.children?.length).toBe(3)
  })

  it('skips children without a key', () => {
    const noKey = { type: 'div', props: {}, children: [] } as any
    const accessor = TransitionGroup({
      children: [keyedChild('a'), noKey, keyedChild('b')],
    }) as unknown as () => any
    const result = accessor()
    // Only the two keyed children are wrapped in Transitions
    expect(result.children?.length).toBe(2)
  })
})
