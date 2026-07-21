/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for two APG keyboard edges (2026-07-21 audit, roadmap
 * B4):
 *
 * - TreeBase's container-sanctioned onKeyDown hijacked typing in editable
 *   descendants (inline rename / filter inputs lost arrows, Space, and every
 *   printable char to tree navigation) — it now bails on
 *   INPUT/TEXTAREA/SELECT/contentEditable targets (the code-style
 *   container-keydown rule).
 * - ComboboxBase: ArrowUp on a CLOSED listbox did nothing — APG requires it
 *   to open with the LAST option active (the upward mirror of ArrowDown).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { ComboboxBase, TreeBase, type ComboboxState, type TreeState } from './index'

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

describe('TreeBase — editable-target keydown bail (real Chromium)', () => {
  it('typing in an input INSIDE the tree does not trigger tree navigation/typeahead', async () => {
    const data = [
      { id: 'alpha', label: 'Alpha' },
      { id: 'beta', label: 'Beta' },
    ]
    let api: TreeState | null = null
    const { container, unmount } = mountInBrowser(
      h(TreeBase as never, {
        data,
        children: (s: TreeState) => {
          api = s
          return h(
            'div',
            // onKeyDown wired explicitly — treeProps carries role/aria only
            // (the JSDoc-sanctioned container wiring).
            { ...s.treeProps(), onKeyDown: s.onKeyDown, 'data-testid': 'tree-root' },
            h('input', { 'data-testid': 'rename', type: 'text' }),
            ...data.map((n) =>
              h('div', { ...s.getItemProps(n.id, 0, false), children: n.label }),
            ),
          )
        },
      }),
    )
    await flush()
    const input = container.querySelector('[data-testid="rename"]') as HTMLInputElement
    input.focus()

    // Arrows + a printable char from INSIDE the input must NOT move tree focus
    // (pre-fix: ArrowDown moved focus to a tree item, stealing it from the
    // input; 'b' typeahead-jumped to Beta).
    key(input, 'ArrowDown')
    key(input, 'b')
    await flush()
    expect(api!.focused(), 'tree focus must not move while typing in the input').toBeNull()
    expect(document.activeElement, 'the input must keep focus').toBe(input)

    // Sanity: the same keys ON A TREE ITEM still navigate.
    const first = container.querySelector('[role="treeitem"]') as HTMLElement
    key(first, 'ArrowDown')
    await flush()
    expect(api!.focused(), 'tree keys on items still navigate').not.toBeNull()
    unmount()
  })
})

describe('ComboboxBase — ArrowUp opens a closed listbox (real Chromium)', () => {
  it('ArrowUp while closed opens with the LAST option active', async () => {
    let api: ComboboxState | null = null
    const { container, unmount } = mountInBrowser(
      h(ComboboxBase as never, {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ],
        children: (s: ComboboxState) => {
          api = s
          // Minimal wiring — the spec locks the KEYBOARD contract; aria props
          // are covered by the combobox a11y suite (and a JS spread of
          // inputProps() would fire its getters — the #2383 trap).
          return h('input', { role: 'combobox', onKeyDown: s.onKeyDown, 'data-testid': 'cb-input' })
        },
      }),
    )
    await flush()
    const input = container.querySelector('[data-testid="cb-input"]') as HTMLElement
    expect(api!.isOpen()).toBe(false)

    key(input, 'ArrowUp')
    await flush()
    expect(api!.isOpen(), 'ArrowUp must OPEN the closed listbox').toBe(true)
    expect(api!.highlightedIndex(), 'with the LAST option active').toBe(2)
    unmount()
  })
})
