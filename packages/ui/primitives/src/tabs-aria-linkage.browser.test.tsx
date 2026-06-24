/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium proof for the WAI-ARIA Tabs pattern tab↔panel relationship.
 *
 * Headless primitives' a11y contract is the rendered `role` + `aria-*`
 * wiring, which a static linter can't verify — so the gate is a real-browser
 * mount asserting the linkage lands in the DOM. Kept in its own file (not the
 * shared `ui-primitives.browser.test.tsx` smoke) to stay conflict-free with
 * other in-flight primitive PRs.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { TabBase, TabPanelBase, TabsBase } from './index'

function mountTabs(testid: string) {
  return mountInBrowser(
    h(
      TabsBase as never,
      { defaultValue: 'a', id: testid, role: 'tablist' },
      h(TabBase as never, { value: 'a', children: 'Tab A' }),
      h(TabBase as never, { value: 'b', children: 'Tab B' }),
      h(TabPanelBase as never, { value: 'a', children: 'Panel A' }),
      h(TabPanelBase as never, { value: 'b', children: 'Panel B' }),
    ),
  )
}

describe('TabsBase — WAI-ARIA tab↔panel relationship (real Chromium)', () => {
  it('wires aria-controls (tab→panel) and aria-labelledby (panel→tab) with matching ids', () => {
    const { container, unmount } = mountTabs('tabs-linkage')

    const activeTab = query<HTMLElement>(container, '[data-value="a"]')
    // Tab must have an id AND point at its panel via aria-controls.
    const tabId = activeTab.getAttribute('id')
    const ariaControls = activeTab.getAttribute('aria-controls')
    expect(tabId).toBeTruthy()
    expect(ariaControls).toBeTruthy()

    // Only the active panel renders (conditional mount).
    const panel = query<HTMLElement>(container, '[role="tabpanel"]')
    const panelId = panel.getAttribute('id')
    const ariaLabelledby = panel.getAttribute('aria-labelledby')
    expect(panelId).toBeTruthy()
    expect(ariaLabelledby).toBeTruthy()

    // The relationship must close the loop: tab.aria-controls === panel.id
    // and panel.aria-labelledby === tab.id.
    expect(ariaControls).toBe(panelId)
    expect(ariaLabelledby).toBe(tabId)

    unmount()
  })

  it('inactive tab still carries aria-controls pointing at its (unmounted) panel id', () => {
    const { container, unmount } = mountTabs('tabs-inactive')
    const inactiveTab = query<HTMLElement>(container, '[data-value="b"]')
    expect(inactiveTab.getAttribute('aria-selected')).toBe('false')
    // The relationship is declared regardless of active state (the panel is
    // conditionally mounted, but the tab's aria-controls is stable).
    expect(inactiveTab.getAttribute('aria-controls')).toBe(
      inactiveTab.getAttribute('id')!.replace('-tab-', '-panel-'),
    )
    unmount()
  })

  it('two TabsBase instances get distinct baseIds → no id collision across instances', () => {
    const a = mountTabs('tabs-one')
    const b = mountTabs('tabs-two')
    const tabA = query<HTMLElement>(a.container, '[data-value="a"]').getAttribute('id')
    const tabB = query<HTMLElement>(b.container, '[data-value="a"]').getAttribute('id')
    expect(tabA).toBeTruthy()
    expect(tabB).toBeTruthy()
    // Same value 'a' in two instances must NOT produce the same DOM id.
    expect(tabA).not.toBe(tabB)
    a.unmount()
    b.unmount()
  })
})
