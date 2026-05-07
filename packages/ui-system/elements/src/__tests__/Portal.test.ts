import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { Portal } from '../Portal'

describe('Portal', () => {
  describe('wrapper element creation', () => {
    it('creates a per-instance wrapper appended to document.body by default', () => {
      const before = document.body.children.length
      const root = document.createElement('div')
      document.body.appendChild(root)

      const unmount = mount(h(Portal, { children: h('span', { id: 'pchild' }, 'modal') }), root)

      // Wrapper appended directly to document.body (not inside `root`).
      expect(document.body.children.length).toBe(before + 2) // root + portal wrapper
      const wrapper = document.body.querySelector('#pchild')!.parentElement!
      expect(wrapper).not.toBe(document.body)
      expect(wrapper.tagName).toBe('DIV')
      expect(wrapper.parentElement).toBe(document.body)

      unmount()
      root.remove()
    })

    it('uses the supplied tag for the wrapper element', () => {
      const root = document.createElement('div')
      document.body.appendChild(root)

      const unmount = mount(
        h(Portal, { tag: 'section', children: h('span', { id: 'tagchild' }, 'x') }),
        root,
      )

      const wrapper = document.body.querySelector('#tagchild')!.parentElement!
      expect(wrapper.tagName).toBe('SECTION')

      unmount()
      root.remove()
    })

    it('appends the wrapper to DOMLocation when provided', () => {
      const root = document.createElement('div')
      const customTarget = document.createElement('article')
      customTarget.id = 'custom-target'
      document.body.appendChild(root)
      document.body.appendChild(customTarget)

      const unmount = mount(
        h(Portal, { DOMLocation: customTarget, children: h('span', { id: 'cchild' }, 'inside') }),
        root,
      )

      const wrapper = customTarget.querySelector('#cchild')!.parentElement!
      expect(wrapper.parentElement).toBe(customTarget)

      unmount()
      root.remove()
      customTarget.remove()
    })

    it('renders children inside the wrapper', () => {
      const root = document.createElement('div')
      document.body.appendChild(root)

      const unmount = mount(
        h(Portal, { children: h('span', { id: 'inside-wrapper', class: 'modal' }, 'Modal') }),
        root,
      )

      const child = document.body.querySelector('#inside-wrapper')!
      expect(child.textContent).toBe('Modal')
      const wrapper = child.parentElement!
      expect(wrapper.parentElement).toBe(document.body)

      unmount()
      root.remove()
    })

    it('removes the wrapper from the DOM on unmount', () => {
      const root = document.createElement('div')
      document.body.appendChild(root)

      const before = document.body.children.length
      const unmount = mount(
        h(Portal, { children: h('span', { id: 'cleanup-child' }, 'x') }),
        root,
      )
      expect(document.body.children.length).toBe(before + 1) // wrapper added
      const wrapper = document.body.querySelector('#cleanup-child')!.parentElement!
      expect(wrapper.isConnected).toBe(true)

      unmount()
      expect(wrapper.isConnected).toBe(false)
      expect(document.body.contains(wrapper)).toBe(false)

      root.remove()
    })

    it('removes the wrapper from a custom DOMLocation on unmount', () => {
      const root = document.createElement('div')
      const customTarget = document.createElement('div')
      document.body.appendChild(root)
      document.body.appendChild(customTarget)

      const unmount = mount(
        h(Portal, { DOMLocation: customTarget, children: h('span', { id: 'cu' }, 'x') }),
        root,
      )
      expect(customTarget.children.length).toBe(1)

      unmount()
      expect(customTarget.children.length).toBe(0)

      root.remove()
      customTarget.remove()
    })

    it('isolates per-instance wrappers when multiple Portals share a DOMLocation', () => {
      const root = document.createElement('div')
      document.body.appendChild(root)

      const u1 = mount(h(Portal, { children: h('span', { id: 'p1' }, 'A') }), root)
      const u2 = mount(h(Portal, { children: h('span', { id: 'p2' }, 'B') }), root)

      const w1 = document.body.querySelector('#p1')!.parentElement!
      const w2 = document.body.querySelector('#p2')!.parentElement!
      expect(w1).not.toBe(w2)
      expect(w1.parentElement).toBe(document.body)
      expect(w2.parentElement).toBe(document.body)

      u1()
      // unmounting one Portal removes only its wrapper, not the sibling's
      expect(w1.isConnected).toBe(false)
      expect(w2.isConnected).toBe(true)

      u2()
      expect(w2.isConnected).toBe(false)
      root.remove()
    })
  })

  describe('statics', () => {
    it('has correct displayName', () => {
      expect(Portal.displayName).toBe('@pyreon/elements/Portal')
    })

    it('has correct pkgName', () => {
      expect(Portal.pkgName).toBe('@pyreon/elements')
    })

    it('has correct PYREON__COMPONENT', () => {
      expect(Portal.PYREON__COMPONENT).toBe('@pyreon/elements/Portal')
    })
  })
})
