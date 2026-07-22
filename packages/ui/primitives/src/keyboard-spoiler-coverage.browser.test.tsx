/**
 * Coverage for `navigateByRole` (keyboard.ts — the shared roving-arrow helper
 * used by Radio/Tabs) across all key modes, and for `SpoilerBase`'s
 * expand/collapse state machine + prop helpers.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { navigateByRole } from './keyboard'
import { SpoilerBase, type SpoilerState } from './index'

describe('navigateByRole', () => {
  let container: HTMLElement | null = null
  afterEach(() => {
    container?.remove()
    container = null
  })

  const setup = (opts?: { disableIdx?: number }) => {
    container = document.createElement('div')
    container.setAttribute('role', 'tablist')
    document.body.appendChild(container)
    const items = ['a', 'b', 'c'].map((v, i) => {
      const el = document.createElement('div')
      el.setAttribute('role', 'tab')
      el.setAttribute('data-value', v)
      el.tabIndex = 0
      if (opts?.disableIdx === i) el.setAttribute('aria-disabled', 'true')
      container!.appendChild(el)
      return el
    })
    return items
  }

  const nav = (
    item: HTMLElement,
    key: string,
    keys: 'horizontal' | 'vertical' | 'both',
  ) =>
    navigateByRole(
      { currentTarget: item, key, preventDefault() {} } as unknown as KeyboardEvent,
      {
        containerSelector: '[role="tablist"]',
        itemSelector: '[role="tab"]',
        keys,
      },
    )

  it('horizontal: ArrowRight/ArrowLeft wrap; Home/End jump', () => {
    const items = setup()
    expect(nav(items[0]!, 'ArrowRight', 'horizontal')).toBe('b')
    expect(nav(items[0]!, 'ArrowLeft', 'horizontal')).toBe('c') // wraps to last
    expect(nav(items[2]!, 'ArrowRight', 'horizontal')).toBe('a') // wraps to first
    expect(nav(items[1]!, 'Home', 'horizontal')).toBe('a')
    expect(nav(items[1]!, 'End', 'horizontal')).toBe('c')
    expect(nav(items[0]!, 'ArrowDown', 'horizontal')).toBeNull() // ignores vertical
  })

  it('vertical: ArrowDown/ArrowUp; both: all four arrows', () => {
    const items = setup()
    expect(nav(items[0]!, 'ArrowDown', 'vertical')).toBe('b')
    expect(nav(items[0]!, 'ArrowUp', 'vertical')).toBe('c')
    expect(nav(items[0]!, 'ArrowRight', 'both')).toBe('b')
    expect(nav(items[0]!, 'ArrowDown', 'both')).toBe('b')
    expect(nav(items[0]!, 'Tab', 'both')).toBeNull() // unhandled key
  })

  it('skips aria-disabled items and returns null when the target is not an item', () => {
    const items = setup({ disableIdx: 1 })
    expect(nav(items[0]!, 'ArrowRight', 'horizontal')).toBe('c') // b disabled → skip to c
    const orphan = document.createElement('div')
    expect(nav(orphan, 'ArrowRight', 'horizontal')).toBeNull()
  })
})

describe('SpoilerBase', () => {
  const mount = (props: Record<string, unknown> = {}): SpoilerState => {
    let s: SpoilerState | undefined
    mountInBrowser(
      h(SpoilerBase as never, {
        ...props,
        children: (st: SpoilerState) => ((s = st), h('div', null)),
      }),
    )
    if (!s) throw new Error('no state')
    return s
  }

  it('expand/collapse/toggle drive the expanded signal', () => {
    const s = mount()
    expect(s.expanded()).toBe(false)
    s.expand()
    expect(s.expanded()).toBe(true)
    s.collapse()
    expect(s.expanded()).toBe(false)
    s.toggle()
    expect(s.expanded()).toBe(true)
    s.toggle()
    expect(s.expanded()).toBe(false)
  })

  it('rootProps carries data-spoiler + an accessor data-expanded; clipProps is an accessor style', () => {
    const s = mount()
    const rp = s.rootProps()
    expect(rp['data-spoiler']).toBe('')
    expect((rp['data-expanded'] as () => string | undefined)()).toBeUndefined()
    s.expand()
    expect((rp['data-expanded'] as () => string | undefined)()).toBe('')
    const style = (s.clipProps().style as () => string)()
    expect(style).toMatch(/max-height/)
    expect(typeof s.needsToggle()).toBe('boolean')
    expect(typeof s.contentHeight()).toBe('number')
  })
})
