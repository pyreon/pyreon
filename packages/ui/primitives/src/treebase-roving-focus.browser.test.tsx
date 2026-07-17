import { For, h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { TreeBase } from './TreeBase'
import type { TreeNode, TreeState } from './TreeBase'

/**
 * Tree roving focus — the half of the WAI-ARIA tree pattern that shipped broken.
 *
 * Two interlocking bugs, neither fixable alone:
 *
 *  A. `getItemProps` returned EAGER snapshots, so the docs told callers to
 *     re-render the list in a reactive accessor to keep ARIA live. That
 *     REMOUNTS every item on each focus change and destroys DOM focus.
 *  B. `onKeyDown` only did `focused.set(id)` — it moved the roving TABINDEX but
 *     never the browser's FOCUS, so the ring never followed the arrow keys.
 *
 * Fixing only A leaves focus not following; fixing only B leaves the remount
 * destroying the focus B just set.
 *
 * These specs render through a KEYED `<For>` — the corrected contract. A bare
 * `.map()` cannot react to expand/collapse (measured: collapsing a node left
 * its children in the DOM, 4 items before AND after); a reactive accessor
 * reacts but remounts everything. `<For by={id}>` does both: membership
 * updates while surviving rows keep their identity, so focus survives.
 *
 * They dispatch keydown from the FOCUSED ITEM, the way a real keypress
 * arrives. The original #2374 spec dispatched on the CONTAINER — which
 * survives a remount — so it passed against all of this.
 */
const DATA: TreeNode[] = [
  { id: 'a', label: 'apple' },
  { id: 'b', label: 'banana', children: [{ id: 'b1', label: 'berry' }] },
  { id: 'c', label: 'cherry' },
]

/** Keyed `<For>` + accessor-valued props: the shape the fix makes possible. */
function mountTree(data: TreeNode[] = DATA) {
  const { container } = mountInBrowser(
    h(TreeBase as never, {
      data,
      defaultExpanded: ['b'],
      children: (s: TreeState) =>
        h(
          'div',
          { ...s.treeProps(), onKeyDown: s.onKeyDown },
          h(For as never, {
            each: () => s.visibleNodes(),
            by: (v: { node: TreeNode }) => v.node.id,
            children: ({ node, depth }: { node: TreeNode; depth: number }) =>
              h('div', { ...s.getItemProps(node.id, depth, !!node.children?.length) }, node.label),
          }),
        ),
    }),
  )
  const items = () => [...container.querySelectorAll('[role="treeitem"]')] as HTMLElement[]
  const press = (from: HTMLElement, key: string) =>
    from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  return { container, items, press }
}

describe('TreeBase — roving focus moves BOTH tabindex and DOM focus', () => {
  it('ArrowDown moves real DOM focus to the next item', () => {
    const { items, press } = mountTree()
    const first = items()[0]!
    first.focus()
    press(first, 'ArrowDown') // focused() is null -> lands on item 0
    press(items()[0]!, 'ArrowDown') // -> item 1
    expect(document.activeElement).toBe(items()[1]!)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('reacts to collapse WITHOUT destroying focus (the shape a bare .map() cannot do)', () => {
    const { items, press } = mountTree()
    expect(items().length).toBe(4) // a, b, b1, c
    items()[0]!.focus()
    press(items()[0]!, 'ArrowDown')
    press(items()[0]!, 'ArrowDown') // -> b
    const b = items()[1]!
    press(b, 'ArrowLeft') // collapse b -> b1 leaves
    // A bare .map() renders once: b1 would still be in the DOM (measured 4/4).
    expect(items().length).toBe(3)
    // …and a reactive accessor would have dropped focus to <body> here.
    expect(document.activeElement).toBe(items()[1]!)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('does NOT remount items — focus survives navigation', () => {
    const { items, press } = mountTree()
    const before = items()
    before[0]!.focus()
    press(before[0]!, 'ArrowDown')
    // The exact failure: a reactive-accessor list re-created these nodes and
    // dropped focus to <body>, so the NEXT arrow key had nowhere to land.
    expect(items()[0]).toBe(before[0])
    expect(items()[1]).toBe(before[1])
  })

  it('keeps navigating after the first press (the death the remount caused)', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'ArrowDown')
    press(document.activeElement as HTMLElement, 'ArrowDown')
    press(document.activeElement as HTMLElement, 'ArrowDown')
    // a -> b -> b1 (b is expanded, so b1 is visible)
    expect(document.activeElement).toBe(items()[2]!)
  })

  it('keeps tabindex live through a plain spread (accessor-valued, not frozen)', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'ArrowDown')
    expect(items().map((el) => el.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
    press(items()[0]!, 'ArrowDown')
    // Frozen snapshots would leave this at 0,-1,-1,-1 forever.
    expect(items().map((el) => el.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
  })

  it('keeps aria-selected live through a plain spread', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'ArrowDown')
    expect(items()[0]!.getAttribute('aria-selected')).toBe('false')
    press(items()[0]!, 'Enter')
    expect(items()[0]!.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps aria-expanded live through a plain spread', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'ArrowDown')
    press(items()[0]!, 'ArrowDown') // -> b (has children, expanded)
    const b = items()[1]!
    expect(b.getAttribute('aria-expanded')).toBe('true')
    press(b, 'ArrowLeft') // collapse
    expect(b.getAttribute('aria-expanded')).toBe('false')
  })

  it('Home/End move DOM focus too', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'End')
    expect(document.activeElement).toBe(items()[items().length - 1]!)
    press(document.activeElement as HTMLElement, 'Home')
    expect(document.activeElement).toBe(items()[0]!)
  })

  it('typeahead moves DOM focus too', () => {
    const { items, press } = mountTree()
    items()[0]!.focus()
    press(items()[0]!, 'c') // "cherry"
    expect(document.activeElement).toBe(items()[3]!)
  })
})
