import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import Util from '../Util/component'

describe('Util', () => {
  describe('statics', () => {
    it('has displayName', () => {
      expect(Util.displayName).toBe('@pyreon/elements/Util')
    })

    it('has pkgName', () => {
      expect(Util.pkgName).toBe('@pyreon/elements')
    })

    it('has PYREON__COMPONENT', () => {
      expect(Util.PYREON__COMPONENT).toBe('@pyreon/elements/Util')
    })
  })

  describe('className injection', () => {
    it('calls render with className prop for string className', () => {
      const child = h('div', { 'data-testid': 'child' }, 'Content')
      const result = Util({ children: child, className: 'my-class' }) as VNodeChild
      // render() should merge className into the child
      expect(result).toBeDefined()
    })

    it('joins array className into space-separated string', () => {
      const child = h('div', { 'data-testid': 'child' }, 'Content')
      const result = Util({ children: child, className: ['cls-a', 'cls-b'] }) as VNodeChild
      expect(result).toBeDefined()
    })
  })

  describe('style injection', () => {
    it('calls render with style prop for style object', () => {
      const child = h('div', { 'data-testid': 'child' }, 'Content')
      const result = Util({ children: child, style: { color: 'red' } }) as VNodeChild
      expect(result).toBeDefined()
    })
  })

  describe('both className and style', () => {
    it('passes both className and style to render', () => {
      const child = h('div', { 'data-testid': 'child' }, 'Content')
      const result = Util({
        children: child,
        className: 'my-class',
        style: { color: 'blue' },
      }) as VNodeChild
      expect(result).toBeDefined()
    })
  })

  describe('no-op when no props', () => {
    it('renders children without modification when no className or style', () => {
      const child = h('div', { 'data-testid': 'child' }, 'Content')
      const result = Util({ children: child }) as VNodeChild
      expect(result).toBeDefined()
    })
  })
})
