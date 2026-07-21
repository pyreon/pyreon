/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the APG roving-tabindex contract: EXACTLY ONE tab
 * stop per composite widget, with a FIRST-ENABLED-ITEM fallback when nothing
 * is selected/focused yet.
 *
 * The bugs these pin (2026-07-21 audit): an initially-unselected TabsBase /
 * untouched TreeBase rendered ZERO tab stops (every item `tabIndex=-1` — the
 * widget was unreachable by keyboard), and an unchecked RadioGroupBase put
 * EVERY enabled radio in the tab order (Tab walked the whole group instead
 * of entering once and arrow-navigating).
 *
 * Kept in its own file (not the shared smoke) to stay conflict-free with
 * other in-flight primitive PRs.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import {
  RadioBase,
  RadioGroupBase,
  TabBase,
  TabListBase,
  TabPanelBase,
  TabsBase,
  TreeBase,
  type TreeState,
} from './index'

const tabStops = (root: HTMLElement, selector: string): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => el.tabIndex === 0)
    .map((el) => el.dataset['value'] ?? el.id)

describe('TabsBase — roving tabindex + tablist (real Chromium)', () => {
  it('with NO selection, exactly the FIRST enabled tab is the tab stop', () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        {},
        h(
          TabListBase as never,
          {},
          h(TabBase as never, { value: 'a', children: 'A' }),
          h(TabBase as never, { value: 'b', children: 'B' }),
          h(TabBase as never, { value: 'c', children: 'C' }),
        ),
      ),
    )
    expect(tabStops(container, '[role="tab"]')).toEqual(['a'])
    unmount()
  })

  it('with NO selection and the first tab DISABLED, the second tab is the stop', () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        {},
        h(
          TabListBase as never,
          {},
          h(TabBase as never, { value: 'a', disabled: true, children: 'A' }),
          h(TabBase as never, { value: 'b', children: 'B' }),
        ),
      ),
    )
    expect(tabStops(container, '[role="tab"]')).toEqual(['b'])
    unmount()
  })

  it('with a selection, ONLY the active tab is the stop — and it moves on change', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        { defaultValue: 'b' },
        h(
          TabListBase as never,
          {},
          h(TabBase as never, { value: 'a', children: 'A' }),
          h(TabBase as never, { value: 'b', children: 'B' }),
        ),
        h(TabPanelBase as never, { value: 'a', children: 'PA' }),
        h(TabPanelBase as never, { value: 'b', children: 'PB' }),
      ),
    )
    expect(tabStops(container, '[role="tab"]')).toEqual(['b'])

    // Selecting a different tab MOVES the single stop (accessor-live tabIndex).
    container.querySelector<HTMLElement>('[data-value="a"]')!.click()
    await flush()
    expect(tabStops(container, '[role="tab"]')).toEqual(['a'])
    unmount()
  })

  it('TabListBase renders role="tablist"; vertical orientation is advertised', () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        { orientation: 'vertical' },
        h(TabListBase as never, {}, h(TabBase as never, { value: 'a', children: 'A' })),
      ),
    )
    const list = container.querySelector('[role="tablist"]')
    expect(list).not.toBeNull()
    expect(list!.getAttribute('aria-orientation')).toBe('vertical')
    unmount()
  })

  it('horizontal (default) omits aria-orientation (ARIA implicit default)', () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        {},
        h(TabListBase as never, {}, h(TabBase as never, { value: 'a', children: 'A' })),
      ),
    )
    expect(container.querySelector('[role="tablist"]')!.getAttribute('aria-orientation')).toBeNull()
    unmount()
  })
})

describe('RadioGroupBase — roving tabindex (real Chromium)', () => {
  it('UNCHECKED group: exactly the first enabled radio is the tab stop', () => {
    const { container, unmount } = mountInBrowser(
      h(
        RadioGroupBase as never,
        {},
        h(RadioBase as never, { value: 'x', disabled: true, children: 'X' }),
        h(RadioBase as never, { value: 'y', children: 'Y' }),
        h(RadioBase as never, { value: 'z', children: 'Z' }),
      ),
    )
    expect(tabStops(container, '[role="radio"]')).toEqual(['y'])
    unmount()
  })

  it('CHECKED group: only the checked radio is the stop', () => {
    const { container, unmount } = mountInBrowser(
      h(
        RadioGroupBase as never,
        { defaultValue: 'z' },
        h(RadioBase as never, { value: 'y', children: 'Y' }),
        h(RadioBase as never, { value: 'z', children: 'Z' }),
      ),
    )
    expect(tabStops(container, '[role="radio"]')).toEqual(['z'])
    unmount()
  })
})

describe('TreeBase — initial tab stop (real Chromium)', () => {
  const data = [
    { id: 'n1', label: 'One' },
    { id: 'n2', label: 'Two' },
  ]

  it('before any focus, the FIRST visible node is the single tab stop', () => {
    const { container, unmount } = mountInBrowser(
      h(TreeBase as never, {
        data,
        children: (s: TreeState) =>
          h(
            'div',
            { ...s.treeProps() },
            // Static render + accessor-valued item props (the documented shape).
            ...data.map((n) => h('div', { ...s.getItemProps(n.id, 0, false), children: n.label })),
          ),
      }),
    )
    const stops = Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
      (el) => el.tabIndex === 0,
    )
    expect(stops.length).toBe(1)
    expect(stops[0]!.id.endsWith('-item-n1')).toBe(true)
    unmount()
  })
})
