// `<Tabs>` / `<Tab>` / `<Split>` — the web half of the navigation primitives.
//
// The contract under test is the one the native targets share: a visited tab
// stays MOUNTED while another is shown (its state survives), selection is a
// signal the app owns, and a split keeps both panes mounted while showing one.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Fragment, h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { Split, Tab, Tabs } from '../index'

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

function render(vnode: ReturnType<typeof h>): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(vnode, container)
  cleanup = () => {
    unmount()
    container.remove()
  }
  return container
}

const threeTabs = (tab: ReturnType<typeof signal<string>>) =>
  h(
    Tabs,
    { value: tab, onChange: (v: string) => tab.set(v), 'data-testid': 'tabs' },
    h(Tab, { value: 'feed', label: 'Feed', icon: 'home', 'data-testid': 'tab-feed' }, h('input', { id: 'feed-input' })),
    h(Tab, { value: 'search', label: 'Search', 'data-testid': 'tab-search' }, h('p', { id: 'search-body' }, 'search')),
    h(Tab, { value: 'me', label: 'Me' }, h('p', { id: 'me-body' }, 'me')),
  )

const tabsOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
const panelsOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLDivElement>('[role="tabpanel"]')]

describe('<Tabs>', () => {
  it('renders the WAI-ARIA tabs pattern with linked ids and a roving tabindex', () => {
    const tab = signal('feed')
    const c = render(threeTabs(tab))
    const list = c.querySelector('[role="tablist"]')
    expect(list).not.toBeNull()
    const tabs = tabsOf(c)
    const panels = panelsOf(c)
    expect(tabs.map((t) => t.textContent)).toEqual(['Feed', 'Search', 'Me'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    tabs.forEach((t, i) => {
      expect(t.getAttribute('aria-controls')).toBe(panels[i]!.id)
      expect(panels[i]!.getAttribute('aria-labelledby')).toBe(t.id)
    })
    expect(panels.map((p) => p.hasAttribute('hidden'))).toEqual([false, true, true])
    expect(c.querySelector('[data-testid="tabs"]')).not.toBeNull()
    expect(c.querySelector('[data-testid="tab-search"]')).toBe(tabs[1])
    // The icon renders through <Icon>, decorative.
    expect(tabs[0]!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('mounts a panel lazily, on its first selection', () => {
    const tab = signal('feed')
    const c = render(threeTabs(tab))
    expect(c.querySelector('#search-body')).toBeNull()
    tab.set('search')
    expect(c.querySelector('#search-body')?.textContent).toBe('search')
  })

  it('a click calls onChange with the tab value and moves aria-selected', () => {
    const tab = signal('feed')
    const c = render(threeTabs(tab))
    tabsOf(c)[2]!.click()
    expect(tab()).toBe('me')
    expect(tabsOf(c).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(panelsOf(c).map((p) => p.hasAttribute('hidden'))).toEqual([true, true, false])
  })

  it('keeps a visited tab mounted: its DOM node and typed text survive a round trip', () => {
    const tab = signal('feed')
    const c = render(threeTabs(tab))
    const input = c.querySelector<HTMLInputElement>('#feed-input')!
    input.value = 'typed before switching'
    tab.set('search')
    tab.set('feed')
    const again = c.querySelector<HTMLInputElement>('#feed-input')!
    expect(again).toBe(input)
    expect(again.value).toBe('typed before switching')
  })

  it('does not call onChange when the selected tab is clicked again', () => {
    const onChange = vi.fn()
    const c = render(
      h(Tabs, { value: 'feed', onChange }, h(Tab, { value: 'feed', label: 'Feed' }, 'x')),
    )
    tabsOf(c)[0]!.click()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('arrow keys, Home and End select and focus a tab (automatic activation)', () => {
    const tab = signal('feed')
    const c = render(threeTabs(tab))
    const list = c.querySelector<HTMLElement>('[role="tablist"]')!
    const key = (k: string) => list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    key('ArrowRight')
    expect(tab()).toBe('search')
    expect(document.activeElement).toBe(tabsOf(c)[1])
    key('ArrowLeft')
    expect(tab()).toBe('feed')
    key('ArrowLeft') // wraps
    expect(tab()).toBe('me')
    key('Home')
    expect(tab()).toBe('feed')
    key('End')
    expect(tab()).toBe('me')
    key('ArrowDown') // the rail's axis wraps too
    expect(tab()).toBe('feed')
    key('a') // ignored
    expect(tab()).toBe('feed')
  })

  it('accepts a plain value and a reactive label, and flattens fragments', () => {
    const label = signal('One')
    const c = render(
      h(
        Tabs,
        { value: 'a', onChange: () => {} },
        h(Fragment, null, h(Tab, { value: 'a', label: () => label() }, 'A'), [
          h(Tab, { value: 'b', label: 'Two' }, 'B'),
        ]),
      ),
    )
    expect(tabsOf(c).map((t) => t.textContent)).toEqual(['One', 'Two'])
    label.set('Uno')
    expect(tabsOf(c)[0]!.textContent).toBe('Uno')
  })

  it('warns about, and drops, a child that is not a <Tab>', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = render(
      h(Tabs, { value: 'a', onChange: () => {} }, h(Tab, { value: 'a', label: 'A' }, 'A'), h('p', null, 'stray')),
    )
    expect(tabsOf(c)).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Pyreon] <Tabs> children must be <Tab>'))
    warn.mockRestore()
  })

  it('a bare <Tab> outside <Tabs> renders its children', () => {
    const c = render(h(Tab, { value: 'a', label: 'A' }, h('b', null, 'body')))
    expect(c.innerHTML).toBe('<b>body</b>')
  })
})

describe('<Split>', () => {
  it('keeps both panes mounted and flips which one a narrow window shows', () => {
    const detail = signal(false)
    const c = render(
      h(
        Split,
        {
          sidebar: h('ul', { id: 'list' }, h('li', null, 'row')),
          showDetail: detail,
          onBack: () => detail.set(false),
          'data-testid': 'split',
        },
        h('p', { id: 'detail' }, 'detail'),
      ),
    )
    const root = c.querySelector<HTMLElement>('[data-testid="split"]')!
    expect(root.getAttribute('data-split-pane')).toBe('sidebar')
    expect(c.querySelector('#list')).not.toBeNull()
    expect(c.querySelector('#detail')).not.toBeNull()
    detail.set(true)
    expect(root.getAttribute('data-split-pane')).toBe('detail')
    expect(c.querySelector('#list')).not.toBeNull()
  })

  it('the back button calls onBack and takes the backLabel', () => {
    const detail = signal(true)
    const c = render(
      h(Split, { sidebar: 'list', showDetail: () => detail(), onBack: () => detail.set(false), backLabel: 'Inbox' }, 'detail'),
    )
    const back = c.querySelector<HTMLButtonElement>('.pyreon-split__back')!
    expect(back.textContent).toBe('Inbox')
    back.click()
    expect(detail()).toBe(false)
    expect(c.querySelector('.pyreon-split')!.getAttribute('data-split-pane')).toBe('sidebar')
  })

  it('moves focus to the back button on entering the detail of a narrow window', async () => {
    const narrow = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((q: string) => ({ matches: false, media: q }) as MediaQueryList)
    const detail = signal(false)
    const c = render(h(Split, { sidebar: 'list', showDetail: detail, onBack: () => {} }, 'detail'))
    // Not on the first render: nothing has moved yet.
    expect(document.activeElement).not.toBe(c.querySelector('.pyreon-split__back'))
    detail.set(true)
    await Promise.resolve()
    expect(document.activeElement).toBe(c.querySelector('.pyreon-split__back'))
    narrow.mockRestore()
  })

  it('leaves focus alone on a wide window, where both panes stay visible', async () => {
    const wide = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((q: string) => ({ matches: true, media: q }) as MediaQueryList)
    const detail = signal(false)
    const c = render(h(Split, { sidebar: 'list', showDetail: detail, onBack: () => {} }, 'detail'))
    detail.set(true)
    await Promise.resolve()
    expect(document.activeElement).not.toBe(c.querySelector('.pyreon-split__back'))
    wide.mockRestore()
  })
})
