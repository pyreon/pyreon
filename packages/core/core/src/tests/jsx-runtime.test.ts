/**
 * Direct tests for the JSX automatic runtime `jsx()` / `jsxs()` entry.
 * Covers both the fast path (no getter props) and the slow path
 * (getter-shaped reactive props that must survive the destructure).
 */
import { describe, expect, it } from 'vitest'
import { Fragment, jsx, jsxs } from '../jsx-runtime'

describe('jsx — fast path (no getter props)', () => {
  it('builds a VNode for a string tag with plain props', () => {
    const v = jsx('div', { class: 'box' })
    expect(v.type).toBe('div')
    expect((v.props as any).class).toBe('box')
    expect(v.children).toEqual([])
  })

  it('separates children from rest props', () => {
    const v = jsx('div', { class: 'box', children: 'hi' } as any)
    expect((v.props as any).class).toBe('box')
    expect((v.props as any).children).toBeUndefined()
    expect(v.children).toEqual(['hi'])
  })

  it('accepts an array of children (jsxs alias)', () => {
    const v = jsxs('ul', { children: ['a', 'b', 'c'] } as any)
    expect(v.children).toEqual(['a', 'b', 'c'])
  })

  it('attaches the explicit key argument', () => {
    const v = jsx('li', { children: 'item' } as any, 'k1')
    expect(v.key).toBe('k1')
  })

  it('passes children to component-type props (not into children array)', () => {
    const Comp = (props: { children?: unknown }) =>
      ({ type: 'div', props: {}, children: [String(props.children)], key: null }) as any
    const v = jsx(Comp as any, { children: 'wrapped' } as any)
    // Component path: children is on props, not on v.children.
    expect((v.props as any).children).toBe('wrapped')
  })

  it('exposes Fragment re-export', () => {
    expect(typeof Fragment).toBe('symbol')
  })
})

describe('jsx — slow path (getter-shaped reactive props)', () => {
  it('preserves a getter prop through the destructure', () => {
    let calls = 0
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'reactiveValue', {
      enumerable: true,
      configurable: true,
      get() {
        calls++
        return 'live'
      },
    })
    const v = jsx('div', props as any)
    // Reading should still trigger the getter — not a frozen snapshot.
    expect((v.props as any).reactiveValue).toBe('live')
    expect((v.props as any).reactiveValue).toBe('live')
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('forwards children + key on the slow path', () => {
    const props: Record<string, unknown> = { children: 'child' }
    Object.defineProperty(props, 'getterProp', {
      enumerable: true,
      configurable: true,
      get: () => 'val',
    })
    const v = jsx('span', props as any, 'k2')
    expect(v.children).toEqual(['child'])
    expect(v.key).toBe('k2')
    expect((v.props as any).getterProp).toBe('val')
  })

  it('routes children to component props on the slow path (not v.children)', () => {
    const Comp = (props: { children?: unknown }) =>
      ({ type: 'div', props: {}, children: [], key: null }) as any
    const props: Record<string, unknown> = { children: 'wrapped' }
    Object.defineProperty(props, 'reactive', {
      enumerable: true,
      configurable: true,
      get: () => 1,
    })
    const v = jsx(Comp as any, props as any)
    expect((v.props as any).children).toBe('wrapped')
  })
})
