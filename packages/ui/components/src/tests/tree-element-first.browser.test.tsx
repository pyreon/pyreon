/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the Tree Element-first conversion (EF-5): out of
 * the box `<Tree data />` renders a full WAI-ARIA tree — roving tabindex,
 * arrow-key navigation with REAL DOM focus, expand/collapse, selection via
 * live `aria-selected` CSS — with layout from Element content-axis props
 * (zero hand-written display CSS) and the render-prop escape hatch intact.
 *
 * The critical regression these specs pin: rows render through a KEYED
 * `<For by>` so per-row state changes (focus/selection/caret) never remount
 * the row — DOM focus must SURVIVE arrow keys.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import type { TreeNode, TreeState } from '@pyreon/ui-primitives'
import { describe, expect, it } from 'vitest'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__
import Tree from '../components/Tree'

const data: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'app', label: 'App.tsx' },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'pkg', label: 'package.json' },
]

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

describe('Tree — Element-first batteries-included (real Chromium)', () => {
  it('renders a labeled WAI-ARIA tree OUT OF THE BOX (a11y + i18n label passthrough)', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Tree as never, { data, defaultExpanded: ['src'], 'aria-label': 'Soubory' }),
      ),
    )
    await flush()
    const tree = container.querySelector('[role="tree"]')!
    expect(tree, 'role=tree container renders').not.toBeNull()
    expect(tree.getAttribute('aria-label'), 'localizable label reaches the container').toBe(
      'Soubory',
    )
    const items = container.querySelectorAll('[role="treeitem"]')
    expect(items.length, 'expanded root + 2 children + sibling leaf').toBe(4)
    expect(items[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(items[0]!.getAttribute('aria-level')).toBe('1')
    expect(items[1]!.getAttribute('aria-level'), 'children carry depth').toBe('2')
    // Exactly ONE tab stop (roving tabindex; first visible before any focus).
    const stops = Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
      (e) => e.tabIndex === 0,
    )
    expect(stops.length).toBe(1)
    unmount()
  })

  it('arrow keys move REAL DOM focus (rows keep identity); click toggles expand', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Tree as never, { data, defaultExpanded: ['src'] })),
    )
    await flush()
    const items = () => container.querySelectorAll<HTMLElement>('[role="treeitem"]')
    const first = items()[0]!
    first.focus()
    key(first, 'ArrowDown')
    await flush()
    expect(document.activeElement, 'DOM focus followed the arrow (keyed rows)').toBe(items()[1])
    expect(items()[1]!.tabIndex, 'tab stop moved with it').toBe(0)
    expect(first.tabIndex).toBe(-1)

    // Collapse via click on the parent row — membership shrinks, caret flips.
    expect(first.textContent).toContain('▼')
    first.click()
    await flush()
    expect(items().length, 'collapse removes the children').toBe(2)
    expect(first.textContent, 'caret flipped in place').toContain('▶')
    unmount()
  })

  it('Enter selects; aria-selected styling is LIVE without remount', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Tree as never, { data, defaultExpanded: ['src'] })),
    )
    await flush()
    const items = container.querySelectorAll<HTMLElement>('[role="treeitem"]')
    const leaf = items[1]! // App.tsx
    leaf.focus()
    leaf.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    leaf.dispatchEvent(new Event('focus'))
    await flush()
    key(leaf, 'Enter')
    await flush()
    expect(leaf.getAttribute('aria-selected'), 'selection is live on the SAME element').toBe('true')
    if (isBrowser) {
      // Selected row picks up the aria-selected CSS (no state= remount needed).
      const selBg = getComputedStyle(leaf).backgroundColor
      const otherBg = getComputedStyle(items[3]!).backgroundColor
      expect(selBg, 'selected row is visually distinct').not.toBe(otherBg)
    }
    unmount()
  })

  it.skipIf(!isBrowser)('layout comes from Element content-axis props (column tree, row items)', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Tree as never, { data, defaultExpanded: ['src'] })),
    )
    await flush()
    const tree = container.querySelector('[role="tree"]') as HTMLElement
    const cs = getComputedStyle(tree)
    expect(cs.display).toContain('flex')
    expect(cs.flexDirection, 'tree stacks rows as a column').toBe('column')
    const item = container.querySelector('[role="treeitem"]') as HTMLElement
    const ics = getComputedStyle(item)
    expect(ics.flexDirection, 'glyph + label sit inline').toBe('row')
    expect(ics.alignItems).toBe('center')
    unmount()
  })

  it('render-prop escape hatch replaces the built-in markup', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Tree as never, {
          data,
          children: (s: TreeState) =>
            h('div', { 'data-testid': 'custom-tree' }, `${s.visibleNodes().length} nodes`),
        }),
      ),
    )
    await flush()
    expect(container.querySelector('[data-testid="custom-tree"]')).not.toBeNull()
    expect(container.querySelector('[role="treeitem"]'), 'built-in rows replaced').toBeNull()
    unmount()
  })
})
