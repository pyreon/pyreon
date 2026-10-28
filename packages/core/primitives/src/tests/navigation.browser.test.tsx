// Real-Chromium checks for the navigation primitives' ADAPTIVE layout.
//
// The layout switch is a CSS media query, which happy-dom does not evaluate,
// so the breakpoint behaviour (bottom bar vs side rail; one pane vs two) can
// only be asserted against real computed geometry.

import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Split, Tab, Tabs } from '../index'

afterEach(async () => {
  await page.viewport(1024, 768)
})

const tabs = () => {
  const tab = signal('feed')
  return mountInBrowser(
    h(
      Tabs,
      { value: tab, onChange: (v: string) => tab.set(v), style: { height: '400px' } },
      h(Tab, { value: 'feed', label: 'Feed' }, h('p', { id: 'feed' }, 'feed')),
      h(Tab, { value: 'me', label: 'Me' }, h('p', { id: 'me' }, 'me')),
    ),
  )
}

describe('<Tabs> adaptive layout (real Chromium)', () => {
  it('is a bottom bar below 600px', async () => {
    await page.viewport(400, 700)
    const { container, unmount } = tabs()
    await flush()
    const list = container.querySelector<HTMLElement>('[role="tablist"]')!
    const panels = container.querySelector<HTMLElement>('.pyreon-tabs__panels')!
    const l = list.getBoundingClientRect()
    const p = panels.getBoundingClientRect()
    expect(l.top).toBeGreaterThanOrEqual(p.bottom - 1)
    const [a, b] = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect())
    expect(Math.abs(a!.top - b!.top)).toBeLessThan(1) // side by side
    unmount()
  })

  it('is a side rail at 600px and wider', async () => {
    await page.viewport(900, 700)
    const { container, unmount } = tabs()
    await flush()
    const list = container.querySelector<HTMLElement>('[role="tablist"]')!
    const panels = container.querySelector<HTMLElement>('.pyreon-tabs__panels')!
    expect(list.getBoundingClientRect().right).toBeLessThanOrEqual(panels.getBoundingClientRect().left + 1)
    const [a, b] = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect())
    expect(b!.top).toBeGreaterThan(a!.top) // stacked
    unmount()
  })

  it('a hidden panel is out of the layout', async () => {
    const { container, unmount } = tabs()
    await flush()
    ;(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!).click()
    await flush()
    expect(container.querySelector<HTMLElement>('#feed')!.getBoundingClientRect().height).toBe(0)
    expect(container.querySelector<HTMLElement>('#me')!.getBoundingClientRect().height).toBeGreaterThan(0)
    unmount()
  })
})

const split = (showDetail: ReturnType<typeof signal<boolean>>) =>
  mountInBrowser(
    h(
      Split,
      {
        sidebar: h('p', { id: 'list' }, 'list'),
        showDetail,
        onBack: () => showDetail.set(false),
      },
      h('p', { id: 'detail' }, 'detail'),
    ),
  )

const shown = (el: Element | null): boolean => el !== null && el.getBoundingClientRect().height > 0

describe('<Split> adaptive layout (real Chromium)', () => {
  it('shows ONE pane below 600px, chosen by showDetail, with a back button on the detail', async () => {
    await page.viewport(400, 700)
    const detail = signal(false)
    const { container, unmount } = split(detail)
    await flush()
    expect(shown(container.querySelector('#list'))).toBe(true)
    expect(shown(container.querySelector('#detail'))).toBe(false)
    detail.set(true)
    await flush()
    expect(shown(container.querySelector('#list'))).toBe(false)
    expect(shown(container.querySelector('#detail'))).toBe(true)
    const back = container.querySelector<HTMLButtonElement>('.pyreon-split__back')!
    expect(shown(back)).toBe(true)
    expect(document.activeElement).toBe(back)
    back.click()
    await flush()
    expect(shown(container.querySelector('#list'))).toBe(true)
    unmount()
  })

  it('shows BOTH panes side by side at 600px and wider, with no back button', async () => {
    await page.viewport(900, 700)
    const detail = signal(true)
    const { container, unmount } = split(detail)
    await flush()
    const list = container.querySelector('#list')!
    const det = container.querySelector('#detail')!
    expect(shown(list)).toBe(true)
    expect(shown(det)).toBe(true)
    expect(list.getBoundingClientRect().right).toBeLessThanOrEqual(det.getBoundingClientRect().left + 1)
    expect(shown(container.querySelector('.pyreon-split__back'))).toBe(false)
    unmount()
  })
})
