// @vitest-environment happy-dom
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawerWhere } from '../drawer'
import { addHeadingAnchors, codeOf, selectCodeGroupTab } from '../enhance'
import Playground from '../playground'
import { searchKeyAction } from '../search'
import { activeSlug } from '../toc'

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('search shortcut', () => {
  it('⌘K / Ctrl+K toggle anywhere; "/" opens outside a text field and when closed', () => {
    expect(searchKeyAction({ key: 'k', metaKey: true, ctrlKey: false }, true, false)).toBe('toggle')
    expect(searchKeyAction({ key: 'K', metaKey: false, ctrlKey: true }, false, true)).toBe('toggle')
    expect(searchKeyAction({ key: '/', metaKey: false, ctrlKey: false }, false, false)).toBe('open')
    expect(searchKeyAction({ key: '/', metaKey: false, ctrlKey: false }, true, false)).toBeNull()
    expect(searchKeyAction({ key: '/', metaKey: false, ctrlKey: false }, false, true)).toBeNull()
    expect(searchKeyAction({ key: 'k', metaKey: false, ctrlKey: false }, false, false)).toBeNull()
  })
})

describe('scroll-spy', () => {
  it('marks the last heading past the line, the first before any has passed', () => {
    const tops = [
      { id: 'a', top: 300 },
      { id: 'b', top: 900 },
    ]
    expect(activeSlug(tops, 96)).toBe('a')
    expect(activeSlug([{ id: 'a', top: 40 }, { id: 'b', top: 97 }], 96)).toBe('b')
    expect(activeSlug([{ id: 'a', top: -400 }, { id: 'b', top: 500 }], 96)).toBe('a')
    expect(activeSlug([], 96)).toBeUndefined()
  })
})

describe('drawer label', () => {
  it('names the group and page, or the product for a sub-page', () => {
    expect(drawerWhere('/docs/ssr')).toBe('Build / Zero')
    expect(drawerWhere('/docs/no-such-page')).toBe('Docs')
  })
})

describe('the enhance island over zero-content markup', () => {
  const codeGroup = () => {
    document.body.innerHTML = `
      <section class="code-group"><div class="code-group__tabs" role="tablist">
        <button class="code-group__tab code-group__tab--active" role="tab" aria-selected="true" tabindex="0">npm</button>
        <button class="code-group__tab" role="tab" aria-selected="false" tabindex="-1">bun</button>
      </div><div class="code-group__panels" data-active="0">
        <div class="code-block"><div class="code-block__pre"><pre><code>npm i x\n</code></pre></div><button class="code-block__copy">Copy</button></div>
        <div class="code-block"><div class="code-block__pre"><pre><code>bun add x</code></pre></div><button class="code-block__copy">Copy</button></div>
      </div></section>`
    return document.querySelector('.code-group')!
  }

  it('selects a code-group tab the way zero-content does (aria-selected, tabindex, class, data-active)', () => {
    const group = codeGroup()
    selectCodeGroupTab(group, 1)
    const tabs = [...group.querySelectorAll<HTMLElement>('.code-group__tab')]
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0])
    expect(tabs[1]!.classList.contains('code-group__tab--active')).toBe(true)
    expect(group.querySelector('.code-group__panels')!.getAttribute('data-active')).toBe('1')
  })

  it('copies the code a block prints, without the trailing newline', () => {
    const group = codeGroup()
    const [first, second] = group.querySelectorAll('.code-block__copy')
    expect(codeOf(first!)).toBe('npm i x')
    expect(codeOf(second!)).toBe('bun add x')
  })

  it('adds one "#" anchor per section heading, never inside an island', () => {
    document.body.innerHTML = '<div id="a"><h2 id="x">X</h2><h3 id="y">Y</h3><h2>no id</h2><pyreon-island><h2 id="z">Z</h2></pyreon-island></div>'
    const root = document.getElementById('a')!
    addHeadingAnchors(root)
    addHeadingAnchors(root)
    expect([...root.querySelectorAll('.dx-anchor')].map((a) => a.getAttribute('href'))).toEqual(['#x', '#y'])
  })
})

describe('Playground', () => {
  it('shows the "firing" pill while edits are pending, and clears it when the snippet re-runs', () => {
    vi.useFakeTimers()
    const root = document.createElement('div')
    document.body.append(root)
    mount(h(Playground, { code: 'const x = 1', title: 'Demo' }), root)
    const pill = root.querySelector('.playground__firing')!
    expect(pill.classList.contains('playground__firing--on')).toBe(false)
    const area = root.querySelector('textarea')!
    area.value = 'const x = 2'
    area.dispatchEvent(new Event('input', { bubbles: true }))
    expect(pill.classList.contains('playground__firing--on')).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(pill.classList.contains('playground__firing--on')).toBe(false)
  })
})
