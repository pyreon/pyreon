/**
 * State-machine coverage for `TreeBase` — the headless tree primitive.
 *
 * The existing tree specs cover roving focus + some keyboard nav. This suite
 * exercises the rest of the `TreeState` machine DIRECTLY through the state
 * object: expand / collapse / toggle (+ onExpand), visibleNodes flattening,
 * single + multi select, ArrowRight/ArrowLeft expand-collapse, Enter/Space,
 * Home/End, `*` expand-siblings, and the treeProps / getItemProps helpers.
 * Pure signal logic → runs identically in happy-dom and Chromium, lifting the
 * gated (node) coverage where the previous 78/74 left off.
 *
 * `onKeyDown` is called directly with constructed events: `moveFocusTo` sets
 * `focused()` before its DOM-focus loop and bails when the event has no
 * container, so the STATE transition is fully observable without a real tree
 * DOM.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { TreeBase, type TreeNode, type TreeState } from './index'

const TREE: TreeNode[] = [
  {
    id: '1',
    label: 'One',
    children: [
      { id: '1a', label: 'Alpha' },
      { id: '1b', label: 'Beta' },
    ],
  },
  { id: '2', label: 'Two', children: [{ id: '2a', label: 'Gamma' }] },
  { id: '3', label: 'Three', disabled: true },
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

const kd = (key: string) => new KeyboardEvent('keydown', { key, cancelable: true })

describe('TreeBase — expand / collapse', () => {
  it('expand adds, collapse removes, toggleExpand flips; onExpand fires on expand only', () => {
    const expandCalls: string[] = []
    const s = mountTree({ onExpand: (id: string) => expandCalls.push(id) })
    expect(s.isExpanded('1')).toBe(false)
    s.expand('1')
    expect(s.isExpanded('1')).toBe(true)
    expect(s.expanded().has('1')).toBe(true)
    s.expand('1') // idempotent — already expanded, no second onExpand
    s.collapse('1')
    expect(s.isExpanded('1')).toBe(false)
    s.collapse('1') // idempotent — already collapsed
    s.toggleExpand('2')
    expect(s.isExpanded('2')).toBe(true)
    s.toggleExpand('2')
    expect(s.isExpanded('2')).toBe(false)
    // onExpand fired for: expand('1'), toggleExpand('2') — expand transitions only
    expect(expandCalls).toEqual(['1', '2'])
  })

  it('defaultExpanded seeds the expanded set', () => {
    const s = mountTree({ defaultExpanded: ['1'] })
    expect(s.isExpanded('1')).toBe(true)
    expect(s.isExpanded('2')).toBe(false)
  })
})

describe('TreeBase — visibleNodes', () => {
  it('shows only roots when nothing is expanded; reveals children with depth when expanded', () => {
    const s = mountTree()
    expect(s.visibleNodes().map((v) => v.node.id)).toEqual(['1', '2', '3'])
    s.expand('1')
    const vis = s.visibleNodes()
    expect(vis.map((v) => v.node.id)).toEqual(['1', '1a', '1b', '2', '3'])
    expect(vis.find((v) => v.node.id === '1a')?.depth).toBe(1)
    expect(vis.find((v) => v.node.id === '1')?.depth).toBe(0)
  })
})

describe('TreeBase — selection', () => {
  it('single select sets the id; onChange fires', () => {
    const calls: (string | string[])[] = []
    const s = mountTree({ onChange: (v: string | string[]) => calls.push(v) })
    s.select('1')
    expect(s.selected()).toBe('1')
    expect(s.isSelected('1')).toBe(true)
    expect(calls).toEqual(['1'])
  })

  it('multi select toggles membership', () => {
    const s = mountTree({ multiple: true })
    expect(s.selected()).toEqual([])
    s.select('1')
    s.select('2')
    expect(s.selected()).toEqual(['1', '2'])
    s.select('1')
    expect(s.selected()).toEqual(['2'])
  })
})

describe('TreeBase — keyboard navigation', () => {
  it('ArrowDown/ArrowUp move focus through visible nodes (clamped)', () => {
    const s = mountTree()
    s.onKeyDown(kd('ArrowDown')) // no focus yet → idx -1 → next 0 → focus first
    expect(s.focused()).toBe('1')
    s.onKeyDown(kd('ArrowDown'))
    expect(s.focused()).toBe('2')
    s.onKeyDown(kd('ArrowUp'))
    expect(s.focused()).toBe('1')
    s.onKeyDown(kd('ArrowUp')) // clamp at first
    expect(s.focused()).toBe('1')
  })

  it('ArrowRight expands a collapsed parent, then enters its first child; ArrowLeft collapses', () => {
    const s = mountTree()
    s.focus('1')
    s.onKeyDown(kd('ArrowRight')) // collapsed w/ children → expand
    expect(s.isExpanded('1')).toBe(true)
    expect(s.focused()).toBe('1')
    s.onKeyDown(kd('ArrowRight')) // already expanded → focus first child
    expect(s.focused()).toBe('1a')
    s.focus('1')
    s.onKeyDown(kd('ArrowLeft')) // expanded → collapse
    expect(s.isExpanded('1')).toBe(false)
  })

  it('Enter/Space select the focused node, but not a disabled one', () => {
    const calls: (string | string[])[] = []
    const s = mountTree({ onChange: (v: string | string[]) => calls.push(v) })
    s.focus('1')
    s.onKeyDown(kd('Enter'))
    expect(s.selected()).toBe('1')
    s.focus('2')
    s.onKeyDown(kd(' '))
    expect(s.selected()).toBe('2')
    s.focus('3') // disabled
    s.onKeyDown(kd('Enter'))
    expect(s.selected()).toBe('2') // unchanged
    expect(calls).toEqual(['1', '2'])
  })

  it('Home/End focus the first/last visible node', () => {
    const s = mountTree()
    s.focus('2')
    s.onKeyDown(kd('Home'))
    expect(s.focused()).toBe('1')
    s.onKeyDown(kd('End'))
    expect(s.focused()).toBe('3')
  })

  it('`*` expands all siblings (with children) at the focused level', () => {
    const s = mountTree()
    s.focus('1')
    s.onKeyDown(kd('*'))
    // '1' and '2' have children → expanded; '3' has none → untouched
    expect(s.isExpanded('1')).toBe(true)
    expect(s.isExpanded('2')).toBe(true)
    expect(s.isExpanded('3')).toBe(false)
  })

  it('a keydown from an editable target is ignored (no nav hijack)', () => {
    const s = mountTree()
    s.focus('1')
    const input = document.createElement('input')
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    Object.defineProperty(e, 'target', { value: input })
    s.onKeyDown(e)
    expect(s.focused()).toBe('1') // unchanged — the handler bailed
  })
})

describe('TreeBase — ARIA props helpers', () => {
  it('treeProps: role=tree (+ aria-multiselectable when multiple)', () => {
    expect(mountTree().treeProps().role).toBe('tree')
    expect(mountTree({ multiple: true }).treeProps()['aria-multiselectable']).toBe('true')
  })

  it('getItemProps: role=treeitem, aria-level, aria-expanded for parents, aria-selected', () => {
    const s = mountTree({ defaultValue: '1', defaultExpanded: ['1'] })
    const p1 = s.getItemProps('1', 0, true)
    expect(p1.role).toBe('treeitem')
    expect(p1['aria-level']).toBe(1)
    // runtime-changing ARIA is accessor-valued (stays live across a spread)
    expect((p1['aria-expanded'] as () => string)()).toBe('true')
    expect((p1['aria-selected'] as () => string)()).toBe('true')
    // leaf node (no children) → no aria-expanded
    expect(s.getItemProps('1a', 1, false)['aria-expanded']).toBeUndefined()
  })
})
