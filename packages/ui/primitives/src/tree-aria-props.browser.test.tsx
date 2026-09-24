/**
 * `TreeBase`'s ARIA props and its roving tab stop.
 *
 * These are the surface assistive tech actually reads, and two of the
 * contracts here fail in ways a sighted mouse user never sees:
 *
 *   * **Exactly one tab stop, always.** APG roving tabindex makes the
 *     focused node THE tab stop — but before any focus, `focused()` is
 *     null, and without the fallback to the first visible node the tree
 *     renders ZERO tab stops. An untouched tree is then completely
 *     unreachable by keyboard, which is the most severe a11y failure a
 *     widget can have and is invisible to every mouse-driven test.
 *   * **ARIA state values are STRINGS.** `aria-selected={true}` renders as
 *     presence-only `aria-selected=""`, which assistive tech does NOT read
 *     as "true" — it falls back to the default, so a selected node is
 *     announced as unselected. The repo's own rule spells this out, and
 *     the only way to hold it is to assert the VALUE, never
 *     `hasAttribute`.
 *
 * `aria-expanded` carries the third: it must be ABSENT on a leaf, not
 * `"false"`. A leaf advertising `aria-expanded="false"` tells a screen
 * reader there is a collapsed subtree to open, and the user presses right
 * arrow into nothing.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { TreeBase, type TreeNode, type TreeState } from './index'

const TREE: TreeNode[] = [
  {
    id: 'p1',
    label: 'Parent one',
    children: [
      { id: 'c1', label: 'Child one' },
      { id: 'c2', label: 'Child two' },
    ],
  },
  { id: 'leaf', label: 'Leaf' },
  { id: 'off', label: 'Disabled', disabled: true },
]

const mountTree = (props: Record<string, unknown> = {}): TreeState => {
  let captured: TreeState | undefined
  mountInBrowser(
    h(TreeBase as never, {
      data: TREE,
      ...props,
      children: (s: TreeState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

/** Resolve an ARIA value that may be an accessor. */
const val = (v: unknown): unknown => (typeof v === 'function' ? (v as () => unknown)() : v)

/**
 * `getItemProps(id, depth, hasChildren)` — the renderer supplies the shape it
 * already knows from walking `visibleNodes()`, so `depth` and `hasChildren`
 * are ARGUMENTS rather than lookups. Checked against the signature rather
 * than assumed: a one-argument call yields `aria-level: NaN`.
 */
const DEPTH: Record<string, number> = { p1: 0, c1: 1, c2: 1, leaf: 0, off: 0, ghost: 0 }
const KIDS: Record<string, boolean> = { p1: true, c1: false, c2: false, leaf: false, off: false, ghost: false }
const itemProps = (s: TreeState, id: string): Record<string, unknown> =>
  s.getItemProps(id, DEPTH[id] ?? 0, KIDS[id] ?? false)

describe('the tree always has exactly one tab stop', () => {
  it('before ANY focus, the first visible node is the tab stop', () => {
    // Without this fallback an untouched tree has zero tab stops and is
    // unreachable by keyboard — invisible to any mouse-driven test.
    const s = mountTree()
    expect(s.focused(), 'nothing focused yet').toBeNull()

    const stops = ['p1', 'leaf', 'off'].map((id) => val(itemProps(s, id).tabIndex))
    expect(stops, 'the first visible node takes it').toEqual([0, -1, -1])
  })

  it('the focused node takes over as the tab stop', () => {
    const s = mountTree()
    s.expand('p1')
    s.focus('c2')

    expect(val(itemProps(s, 'c2').tabIndex)).toBe(0)
    expect(val(itemProps(s, 'p1').tabIndex), 'and the fallback yields').toBe(-1)
  })

  it('never renders TWO tab stops', () => {
    // Two would make Tab land inside the tree twice, which reads as the
    // widget swallowing focus.
    const s = mountTree()
    s.expand('p1')
    s.focus('p1')

    const zeros = ['p1', 'c1', 'c2', 'leaf', 'off']
      .map((id) => val(itemProps(s, id).tabIndex))
      .filter((t) => t === 0)
    expect(zeros).toHaveLength(1)
  })
})

describe('ARIA state values are strings, never booleans', () => {
  it('aria-selected is "true" / "false", not presence-only', () => {
    // A boolean renders as `aria-selected=""`, which assistive tech reads
    // as the DEFAULT — so a selected node is announced as unselected.
    const s = mountTree()
    s.select('leaf')

    expect(val(itemProps(s, 'leaf')['aria-selected'])).toBe('true')
    expect(val(itemProps(s, 'p1')['aria-selected'])).toBe('false')
  })

  it('aria-expanded reflects the expansion, as a string', () => {
    const s = mountTree()
    expect(val(itemProps(s, 'p1')['aria-expanded'])).toBe('false')
    s.expand('p1')
    expect(val(itemProps(s, 'p1')['aria-expanded'])).toBe('true')
  })

  it('aria-expanded is ABSENT on a leaf, not "false"', () => {
    // A leaf advertising a collapsed subtree sends the user right-arrowing
    // into nothing.
    expect(itemProps(mountTree(), 'leaf')['aria-expanded']).toBeUndefined()
  })

  it('aria-disabled is "true" when disabled and ABSENT otherwise', () => {
    const s = mountTree()
    expect(val(itemProps(s, 'off')['aria-disabled'])).toBe('true')
    expect(itemProps(s, 'leaf')['aria-disabled'], 'not "false"').toBeUndefined()
  })

  it('aria-level is 1-based, and deeper for a child', () => {
    // 0-based levels make a screen reader announce "level 0", and the
    // relationship between parent and child is what the level conveys.
    const s = mountTree()
    s.expand('p1')
    expect(itemProps(s, 'p1')['aria-level']).toBe(1)
    expect(itemProps(s, 'c1')['aria-level']).toBe(2)
  })
})

describe('multi-select tracks a set, not a single id', () => {
  it('aria-selected is true for EVERY member', () => {
    // The `Array.isArray(sel)` arm. Reading a multi-selection as a single
    // id would announce all but one selected node as unselected.
    const s = mountTree({ multiple: true })
    s.select('leaf')
    s.select('p1')

    expect(val(itemProps(s, 'leaf')['aria-selected'])).toBe('true')
    expect(val(itemProps(s, 'p1')['aria-selected'])).toBe('true')
  })

  it('selecting an already-selected id REMOVES it', () => {
    const s = mountTree({ multiple: true })
    s.select('leaf')
    s.select('leaf')
    expect(val(itemProps(s, 'leaf')['aria-selected'])).toBe('false')
  })

  it('the FIRST multi-select works from the initial (non-array) state', () => {
    // `Array.isArray(selected()) ? … : []` — the uncontrolled default is
    // not an array yet, so the first selection is the arm that has to
    // seed one. Getting it wrong makes the first click do nothing.
    const s = mountTree({ multiple: true })
    s.select('c1')
    expect(val(itemProps(s, 'c1')['aria-selected'])).toBe('true')
  })
})

describe('lookups for an id the tree does not contain', () => {
  it('getItemProps for an unknown id does not throw', () => {
    // Ids come from render callbacks and can lag a data change by a tick.
    const s = mountTree()
    expect(() => itemProps(s, 'ghost')).not.toThrow()
  })

  it('treeProps carries role=tree, and aria-multiselectable only when multiple', () => {
    expect(mountTree().treeProps().role).toBe('tree')
    expect(
      mountTree()['treeProps']()['aria-multiselectable'],
      'absent for a single-select tree',
    ).toBeUndefined()
    expect(val(mountTree({ multiple: true }).treeProps()['aria-multiselectable'])).toBe('true')
  })
})
