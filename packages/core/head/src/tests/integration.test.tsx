import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { HeadContextValue } from '../index'
import { createHeadContext, HeadProvider, useHead } from '../index'

// ─── Integration tests ───────────────────────────────────────────────────────

describe('Head integration — CSR', () => {
  let container: HTMLElement
  let ctx: HeadContextValue

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ctx = createHeadContext()
    for (const el of document.head.querySelectorAll('[data-pyreon-head]')) el.remove()
    document.title = ''
  })

  afterEach(() => {
    container.remove()
  })

  it('useHead({ title }) updates document.title', () => {
    function Page() {
      useHead({ title: 'Page' })
      return h('div', null, 'content')
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.title).toBe('Page')
  })

  it('useHead({ meta }) injects meta tag into head', () => {
    function Page() {
      useHead({ meta: [{ name: 'description', content: 'Integration test' }] })
      return h('div', null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const meta = document.head.querySelector('meta[name="description"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('Integration test')
  })

  it('reactive useHead updates title when signal changes', () => {
    const title = signal('Initial')
    function Page() {
      useHead(() => ({ title: title() }))
      return h('div', null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.title).toBe('Initial')
    title.set('Updated via signal')
    expect(document.title).toBe('Updated via signal')
  })

  it('nested components: inner useHead overrides outer title', () => {
    function Inner() {
      useHead({ title: 'Inner Title' })
      return h('span', null)
    }
    function Outer() {
      useHead({ title: 'Outer Title' })
      return h('div', null, h(Inner, null))
    }
    mount(h(HeadProvider, { context: ctx, children: h(Outer, null) }), container)
    expect(document.title).toBe('Inner Title')
  })

  it('unmount removes head tags', () => {
    function Page() {
      useHead({ meta: [{ name: 'keywords', content: 'pyreon,test' }] })
      return h('div', null)
    }
    const cleanup = mount(
      h(HeadProvider, { context: ctx, children: h(Page, null) }),
      container,
    )
    expect(document.head.querySelector('meta[name="keywords"]')).not.toBeNull()
    cleanup()
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull()
  })
})
