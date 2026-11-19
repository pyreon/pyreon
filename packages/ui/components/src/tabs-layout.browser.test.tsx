import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { Tab, TabList, TabPanel, Tabs } from './index'

/**
 * Real-Chromium layout lock for `Tabs` (#4426). The root is a flex container,
 * and a flex container's default direction is a row, so the panel sat BESIDE
 * the tab list. Horizontal tabs stack list over panel (APG pattern); vertical
 * tabs put the list beside the panel and stack the tabs themselves.
 *
 * Layout needs a real browser: happy-dom computes no boxes, so the file is
 * skipped when the package's happy-dom suite picks it up.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

function renderTabs(orientation?: 'horizontal' | 'vertical') {
  return mountInBrowser(
    h(
      PyreonUI,
      { theme },
      h(
        Tabs as never,
        { defaultValue: 'a', ...(orientation ? { orientation } : {}) },
        h(
          TabList as never,
          {},
          h(Tab as never, { value: 'a' }, 'Overview'),
          h(Tab as never, { value: 'b' }, 'Settings'),
        ),
        h(TabPanel as never, { value: 'a' }, 'Welcome to the overview panel.'),
      ),
    ),
  )
}

const box = (root: HTMLElement, selector: string): DOMRect =>
  root.querySelector<HTMLElement>(selector)!.getBoundingClientRect()

describe.skipIf(!IS_BROWSER_RUNNER)('Tabs layout (real Chromium)', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('stacks the panel below the tab list by default', () => {
    const { container, unmount } = renderTabs()
    cleanup = unmount
    const list = box(container, '[role="tablist"]')
    const panel = box(container, '[role="tabpanel"]')
    expect(panel.top).toBeGreaterThanOrEqual(list.bottom - 0.5)
    // The tabs of a horizontal list stay on one row.
    const [a, b] = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) =>
      t.getBoundingClientRect(),
    )
    expect(b!.left).toBeGreaterThanOrEqual(a!.right - 0.5)
    // The layout rules add to the theme; they do not replace it.
    const root = container.querySelector<HTMLElement>('[data-rocketstyle="Tabs"]')!
    expect(getComputedStyle(root).borderBottomWidth).toBe('1px')
    expect(getComputedStyle(container.querySelector('[role="tablist"]')!).display).toBe('flex')
  })

  it('puts the panel beside a vertical tab list and stacks the tabs', () => {
    const { container, unmount } = renderTabs('vertical')
    cleanup = unmount
    const list = box(container, '[role="tablist"]')
    const panel = box(container, '[role="tabpanel"]')
    expect(panel.left).toBeGreaterThanOrEqual(list.right - 0.5)
    const [a, b] = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) =>
      t.getBoundingClientRect(),
    )
    expect(b!.top).toBeGreaterThanOrEqual(a!.bottom - 0.5)
  })
})
