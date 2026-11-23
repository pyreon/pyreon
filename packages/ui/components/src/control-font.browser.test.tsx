import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionIcon, Button, Code, Input, Kbd, PinInputCell, Switch, Tab, TabList, Tabs, Textarea } from './index'

/**
 * Real-Chromium lock for #4426: native form controls do not inherit
 * `font-family` (the UA gives them the system control font), so every
 * `<button>` / `<input>` / `<textarea>`-based component rendered in a font
 * other than the page's. The `el` base sets `fontFamily: 'inherit'` once.
 * happy-dom has no UA stylesheet, so only a real browser shows the bug.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true
const PAGE_FONT = '"Courier New", serif'

describe.skipIf(!IS_BROWSER_RUNNER)('form-control components use the page font (real Chromium)', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  function fontOf(child: unknown, selector: string): { own: string; parent: string } {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h('div', { 'data-host': '', style: `font-family: ${PAGE_FONT}` }, child as never)),
    )
    cleanup = unmount
    const host = container.querySelector<HTMLElement>('[data-host]')!
    const el = host.querySelector<HTMLElement>(selector)!
    expect(el, selector).toBeTruthy()

    return { own: getComputedStyle(el).fontFamily, parent: getComputedStyle(host).fontFamily }
  }

  const controls: [string, unknown, string][] = [
    ['Button', h(Button as never, {}, 'Save'), 'button'],
    ['ActionIcon', h(ActionIcon as never, { 'aria-label': 'x' }, 'x'), 'button'],
    [
      'Tab',
      h(Tabs as never, { defaultValue: 'a' }, h(TabList as never, {}, h(Tab as never, { value: 'a' }, 'One'))),
      '[role="tab"]',
    ],
    ['Switch', h(Switch as never, { 'aria-label': 's' }), 'button, [role="switch"]'],
    ['Input', h(Input as never, { 'aria-label': 'name' }), 'input'],
    ['Textarea', h(Textarea as never, { 'aria-label': 'bio' }), 'textarea'],
    ['PinInputCell', h(PinInputCell as never, { value: '4' }), 'input'],
  ]

  for (const [name, child, selector] of controls) {
    it(`${name} inherits the parent's font-family`, () => {
      const { own, parent } = fontOf(child, selector)
      expect(parent).toContain('Courier New')
      expect(own).toBe(parent)
    })
  }

  it('Kbd and Code stay monospace', () => {
    expect(fontOf(h(Kbd as never, {}, 'K'), 'kbd').own).toBe('monospace')
    cleanup?.()
    expect(fontOf(h(Code as never, {}, 'c'), 'code').own).toBe('monospace')
  })
})
