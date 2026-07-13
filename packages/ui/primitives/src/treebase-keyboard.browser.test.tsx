/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for TreeBase's WAI-ARIA tree keyboard model. The primitive
 * shipped ArrowUp/Down/Left/Right + Enter/Space; this suite locks the NEW
 * interactions added to complete the pattern:
 *   - Home → focus the first visible node
 *   - End  → focus the LAST VISIBLE node (collapsed subtrees are excluded)
 *   - `*`  → expand ALL sibling nodes at the focused node's level
 *   - typeahead → printable chars move focus to the next visible node whose
 *     label starts with the buffer; a repeated letter cycles.
 *
 * TreeBase is a render-function primitive: `onKeyDown` reads the `focused`
 * signal (not `e.target`) and mutates `focused` / `expanded`. This package's
 * browser JSX transform is non-reactive, so the observable outcome is the
 * signal value read off the captured `state` after a REAL `keydown` is
 * dispatched through the wired `onKeyDown` handler.
 *
 * Bisect (Home/End): remove the Home/End branches → the Home/End specs fail
 * (focused unchanged). Bisect (typeahead): remove the printable-char branch →
 * the typeahead specs fail. Bisect (`*`): remove the `*` branch → the sibling-
 * expand specs fail (expanded set unchanged).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { TreeBase, type TreeNode, type TreeState } from './TreeBase'

// `veggies` is the LAST root and is collapsible — so End landing on it (not on
// its child `zucchini`) proves End respects collapsed subtrees. `fungi` +
// `fruits` both start with "F" → typeahead cycling. `apple`/`berries` (children
// of fruits) both have children → `*`-at-depth expands siblings, not the root.
const DATA: TreeNode[] = [
  { id: 'fungi', label: 'Fungi' },
  {
    id: 'fruits',
    label: 'Fruits',
    children: [
      { id: 'apple', label: 'Apple', children: [{ id: 'gala', label: 'Gala' }] },
      { id: 'berries', label: 'Berries', children: [{ id: 'straw', label: 'Strawberry' }] },
    ],
  },
  {
    id: 'veggies',
    label: 'Veggies',
    children: [
      { id: 'carrot', label: 'Carrot' },
      { id: 'zucchini', label: 'Zucchini' },
    ],
  },
]

function mountTree(defaultExpanded: string[] = []): {
  container: HTMLElement
  unmount: () => void
  state: TreeState
  tree: HTMLElement
} {
  let captured: TreeState | undefined
  const { container, unmount } = mountInBrowser(
    h(TreeBase as never, {
      data: DATA,
      defaultExpanded,
      children: (state: TreeState) => {
        captured = state
        return h(
          'ul',
          { ...state.treeProps(), id: 'tree', onKeyDown: state.onKeyDown },
          ...state
            .visibleNodes()
            .map(({ node, depth }) =>
              h('li', state.getItemProps(node.id, depth, !!node.children?.length), node.label),
            ),
        )
      },
    }),
  )
  const tree = container.querySelector('#tree') as HTMLElement
  return { container, unmount, state: captured!, tree }
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('TreeBase — Home/End (WAI-ARIA tree)', () => {
  it('Home focuses the first visible node', async () => {
    const { state, tree, unmount } = mountTree()
    await flush()
    state.focus('veggies')
    press(tree, 'Home')
    expect(state.focused()).toBe('fungi')
    unmount()
  })

  it('End focuses the LAST VISIBLE node, skipping collapsed subtrees', async () => {
    const { state, tree, unmount } = mountTree() // all collapsed
    await flush()
    state.focus('fungi')
    press(tree, 'End')
    // veggies is the last visible node; its child zucchini is inside a collapsed
    // subtree, so End must NOT land there.
    expect(state.focused()).toBe('veggies')
    unmount()
  })

  it('End reaches a nested node once its subtree is expanded', async () => {
    const { state, tree, unmount } = mountTree(['veggies'])
    await flush()
    state.focus('fungi')
    press(tree, 'End')
    // veggies expanded → its last child zucchini is now the last visible node.
    expect(state.focused()).toBe('zucchini')
    unmount()
  })
})

describe('TreeBase — `*` expand siblings (WAI-ARIA tree)', () => {
  it('expands all sibling nodes at the ROOT level (leaf siblings untouched)', async () => {
    const { state, tree, unmount } = mountTree()
    await flush()
    state.focus('fungi')
    press(tree, '*')
    // root siblings with children expand; fungi (leaf) is a no-op.
    expect(state.isExpanded('fruits')).toBe(true)
    expect(state.isExpanded('veggies')).toBe(true)
    // deeper nodes are NOT expanded — `*` is level-scoped.
    expect(state.isExpanded('apple')).toBe(false)
    unmount()
  })

  it('expands siblings at the FOCUSED node level, not the root', async () => {
    const { state, tree, unmount } = mountTree(['fruits'])
    await flush()
    state.focus('apple')
    press(tree, '*')
    // apple's siblings (apple, berries) both have children → expand both.
    expect(state.isExpanded('apple')).toBe(true)
    expect(state.isExpanded('berries')).toBe(true)
    // veggies is a ROOT sibling, a different level → untouched.
    expect(state.isExpanded('veggies')).toBe(false)
    unmount()
  })
})

describe('TreeBase — typeahead (WAI-ARIA tree)', () => {
  it('typing a letter moves focus to the first matching visible node', async () => {
    const { state, tree, unmount } = mountTree()
    await flush()
    // no initial focus → search from the top.
    press(tree, 'v')
    expect(state.focused()).toBe('veggies')
    unmount()
  })

  it('a repeated same letter cycles through matches', async () => {
    const { state, tree, unmount } = mountTree()
    await flush()
    state.focus('fungi')
    press(tree, 'f') // next "F*" after Fungi → Fruits
    expect(state.focused()).toBe('fruits')
    press(tree, 'f') // wraps back to Fungi
    expect(state.focused()).toBe('fungi')
    unmount()
  })

  it('a non-matching letter leaves focus put', async () => {
    const { state, tree, unmount } = mountTree()
    await flush()
    state.focus('veggies')
    press(tree, 'q') // nothing starts with "q"
    expect(state.focused()).toBe('veggies')
    unmount()
  })
})
