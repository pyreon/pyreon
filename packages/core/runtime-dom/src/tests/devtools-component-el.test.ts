/**
 * Regression lock: the devtools registry records each component's OWN first
 * element. `mountComponent` used to register `parent.firstElementChild`,
 * which is the first SIBLING's element for every component after the first:
 * `highlight(id)`, the hover picker and the devtools extension's inspector
 * all pointed at the wrong DOM.
 */
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '../index'

interface Entry {
  name: string
  el: Element | null
}

function entries(): Entry[] {
  const dt = (globalThis as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
    getAllComponents(): Entry[]
  }
  return dt.getAllComponents()
}

function elOf(name: string): Element | null | undefined {
  return entries().find((e) => e.name === name)?.el
}

let dispose: (() => void) | null = null
afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ''
})

function Header() {
  return h('header', { id: 'h' }, 'Inbox')
}
function Composer() {
  return h('form', { id: 'composer' }, h('input', null))
}
function Footer() {
  return h(Fragment, null, 'text first, ', h('footer', { id: 'f' }))
}
function NoDom() {
  return null
}
function TextOnly() {
  return 'just text'
}

describe('devtools registry — component el', () => {
  it('each sibling component gets its own first element', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    function App() {
      return h('main', null, h(Header, null), h(Composer, null), h(NoDom, null), h(TextOnly, null), h(Footer, null))
    }
    dispose = mount(h(App, null), c)
    expect(elOf('Header')?.id).toBe('h')
    expect(elOf('Composer')?.id).toBe('composer')
    // Leading text is skipped; the first ELEMENT is recorded.
    expect(elOf('Footer')?.id).toBe('f')
    expect(elOf('NoDom')).toBeNull()
    expect(elOf('TextOnly')).toBeNull()
    expect(elOf('App')?.tagName).toBe('MAIN')
  })

  it('a component mounted before an anchor records its element, not a later sibling', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const show = signal(false)
    function App() {
      return h('section', null, () => (show() ? h(Composer, null) : null), h('aside', { id: 'after' }))
    }
    dispose = mount(h(App, null), c)
    show.set(true)
    expect(elOf('Composer')?.id).toBe('composer')
  })
})

describe('devtools registry — parent of a component mounted later', () => {
  it('a <For> row added after mount is registered under its owner, not as a root', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const items = signal([{ id: 1 }])
    function Row() {
      return h('li', null, 'row')
    }
    function List() {
      return h('ul', null, h(For, { each: items, by: (i: { id: number }) => i.id }, () => h(Row, null)))
    }
    dispose = mount(h(List, null), c)
    items.set([{ id: 1 }, { id: 2 }])
    const all = (globalThis as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      getAllComponents(): { id: string; name: string; parentId: string | null }[]
    }
    const comps = all.getAllComponents()
    const rows = comps.filter((e) => e.name === 'Row')
    expect(rows).toHaveLength(2)
    const byId = new Map(comps.map((e) => [e.id, e]))
    for (const r of rows) {
      // Up the chain to List, whatever sits in between (For).
      let p = r.parentId
      const names: string[] = []
      while (p) {
        names.push(byId.get(p)?.name ?? '?')
        p = byId.get(p)?.parentId ?? null
      }
      expect(names[names.length - 1]).toBe('List')
    }
  })

  it('a component a <Show>-like accessor turns on later is a child of its owner', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const on = signal(false)
    function Late() {
      return h('em', { id: 'late' }, 'late')
    }
    function Host() {
      return h('div', null, () => (on() ? h(Late, null) : null))
    }
    dispose = mount(h(Host, null), c)
    on.set(true)
    const comps = (
      (globalThis as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
        getAllComponents(): { id: string; name: string; parentId: string | null }[]
      }
    ).getAllComponents()
    const host = comps.find((e) => e.name === 'Host')
    expect(comps.find((e) => e.name === 'Late')?.parentId).toBe(host?.id)
  })
})
