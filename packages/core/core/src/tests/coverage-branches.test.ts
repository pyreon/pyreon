// Branch coverage for paths no other spec reaches node-side: `runWithHooks`
// merging `onCleanup` with lifecycle hooks, `<For>`'s missing-`by` message in
// production and for a non-function `by`, and `jsx()`'s slow path with a key.
import { onCleanup } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { runWithHooks } from '../component'
import { For } from '../for'
import { h } from '../h'
import { jsx } from '../jsx-runtime'
import { onMount, onUnmount } from '../lifecycle'
import type { ComponentFn, VNode } from '../types'

describe('runWithHooks — onCleanup next to lifecycle hooks', () => {
  it('onCleanup with onMount: the cleanups become the unmount list', () => {
    const order: string[] = []
    const { hooks } = runWithHooks(() => {
      onMount(() => undefined)
      onCleanup(() => order.push('cleanup'))
      return null
    }, {})
    expect(hooks.mount).toHaveLength(1)
    expect(hooks.unmount).toHaveLength(1)
    for (const fn of hooks.unmount!) fn()
    expect(order).toEqual(['cleanup'])
  })

  it('onCleanup with onUnmount: both run on unmount, hooks first', () => {
    const order: string[] = []
    const { hooks } = runWithHooks(() => {
      onUnmount(() => order.push('unmount'))
      onCleanup(() => order.push('cleanup'))
      return null
    }, {})
    for (const fn of hooks.unmount!) fn()
    expect(order).toEqual(['unmount', 'cleanup'])
  })
})

describe('<For> without a usable `by`', () => {
  it('names the type it got', () => {
    expect(() => For({ each: [1], by: 'id' as never, children: () => h('i', null) })).toThrow(/got string/)
  })

  it('throws the short message in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(() => For({ each: [1], children: () => h('i', null) } as never)).toThrow(
        /^\[Pyreon\] <For> requires a `by` prop$/,
      )
    } finally {
      if (prev === undefined) delete (process.env as { NODE_ENV?: string }).NODE_ENV
      else process.env.NODE_ENV = prev
    }
  })
})

describe('jsx() slow path (a non-enumerable prop, no getters) with a key', () => {
  const Comp: ComponentFn<{ a?: number }> = () => null
  const withHidden = (props: Record<string, unknown>) =>
    Object.defineProperty(props, 'hidden', { value: true, enumerable: false })

  it('a component gets the key and its children', () => {
    const v = jsx(Comp as ComponentFn, withHidden({ a: 1, children: 'c' }), 'k') as VNode
    expect(v.key).toBe('k')
    expect((v.props as { children: string }).children).toBe('c')
  })

  it('a component without children', () => {
    const v = jsx(Comp as ComponentFn, withHidden({ a: 2 }), 'k2') as VNode
    expect(v.key).toBe('k2')
    expect('children' in (v.props as object)).toBe(false)
  })
})
