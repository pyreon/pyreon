import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Tree, TreeItem } from './index'

/**
 * Tree used to be a styled `<div>` with ZERO keyboard support and no ARIA,
 * while `TreeBase` — 281 lines of fully keyboard-tested WAI-ARIA tree
 * behavior — sat ORPHANED, imported by nothing. These lock the wiring:
 * real tree semantics, real keyboard, and (per the #2372 lesson —
 * "delegates" != "works") the rocketstyle class actually landing.
 */

interface Node {
  id: string
  label: string
  children?: Node[]
  disabled?: boolean
}

const DATA: Node[] = [
  { id: 'docs', label: 'docs', children: [{ id: 'intro', label: 'intro' }] },
  { id: 'src', label: 'src' },
]

type TreeStateLike = {
  treeProps: () => Record<string, unknown>
  getItemProps: (id: string, depth: number, hasChildren: boolean) => Record<string, unknown>
  visibleNodes: () => { node: Node; depth: number }[]
  onKeyDown: (e: KeyboardEvent) => void
  isSelected: (id: string) => boolean
}

function renderTree(extra: Record<string, unknown> = {}) {
  return mountInBrowser(
    h(
      PyreonUI,
      { theme },
      h(Tree as never, {
        data: DATA,
        defaultExpanded: ['docs'],
        ...extra,
        children: (s: TreeStateLike) =>
          h(
            'div',
            { ...s.treeProps(), onKeyDown: s.onKeyDown },
            // REACTIVE accessor, not a bare .map(): `getItemProps` returns a
            // SNAPSHOT (aria-selected / aria-expanded / tabIndex are evaluated
            // at call time). Rendering the items once would freeze their ARIA —
            // selection would never be announced. The accessor re-reads
            // getItemProps, subscribing to selected()/focused()/expanded().
            () =>
              s.visibleNodes().map(({ node, depth }) =>
                h(
                  TreeItem as never,
                  { ...s.getItemProps(node.id, depth, !!node.children?.length) },
                  node.label,
                ),
              ),
          ),
      }),
    ),
  )
}

describe('Tree delegates to TreeBase (was an inert styled div)', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('renders real tree semantics (role=tree + treeitem)', () => {
    const { container, unmount } = renderTree()
    cleanup = unmount
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    expect(tree).toBeTruthy()
    const items = container.querySelectorAll('[role="treeitem"]')
    // docs (expanded) + its child intro + src
    expect(items.length).toBe(3)
  })

  it('exposes aria-expanded / aria-level from the primitive', () => {
    const { container, unmount } = renderTree()
    cleanup = unmount
    const items = [...container.querySelectorAll('[role="treeitem"]')] as HTMLElement[]
    const docs = items[0]!
    expect(docs.getAttribute('aria-expanded')).toBe('true')
    expect(docs.getAttribute('aria-level')).toBe('1')
    // the nested child sits one level deeper
    expect(items[1]!.getAttribute('aria-level')).toBe('2')
  })

  it('applies its rocketstyle class to the tree container ("delegates" != "works")', () => {
    const { container, unmount } = renderTree()
    cleanup = unmount
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    expect(tree.getAttribute('data-rocketstyle')).toBe('Tree')
    expect(tree.className).toBeTruthy()
  })

  it('selects a node on Enter (keyboard comes from the primitive)', () => {
    const { container, unmount } = renderTree()
    cleanup = unmount
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    // focus the first node, then select it
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    const selected = container.querySelector('[aria-selected="true"]')
    expect(selected).toBeTruthy()
  })
})
