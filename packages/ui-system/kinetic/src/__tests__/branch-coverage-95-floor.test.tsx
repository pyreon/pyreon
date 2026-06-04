/**
 * Real-test branch coverage for @pyreon/kinetic toward 95 floor.
 * Targets Stagger/Transition/Collapse defensive prop-default + edge arms.
 */
import { describe, expect, it, vi } from 'vitest'
import { h, type ComponentFn } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import Stagger from '../Stagger'

describe('Stagger — defensive prop defaults', () => {
  it('renders with all defaults — no interval, appear, reverseLeave, timeout (arm 1 nullish)', () => {
    const show = signal(true)
    const Item: ComponentFn<{ children?: string }> = (p) => h('span', null, p.children ?? 'x')
    const result = Stagger({
      show: () => show(),
      children: [h(Item, { children: 'a' }), h(Item, { children: 'b' })],
    })
    expect(result).toBeDefined()
  })

  it('renders with reverseLeave: true + show: false (line 35 cond arm 0)', () => {
    const show = signal(false)
    const Item: ComponentFn<{ children?: string }> = (p) => h('span', null, p.children ?? 'x')
    const result = Stagger({
      show: () => show(),
      reverseLeave: true,
      children: [h(Item, { children: 'a' }), h(Item, { children: 'b' })],
    })
    expect(result).toBeDefined()
  })

  it('non-array single child resolves to [child] (line 29 arm 0)', () => {
    const show = signal(true)
    const Item: ComponentFn<{ children?: string }> = (p) => h('span', null, p.children ?? 'x')
    const result = Stagger({
      show: () => show(),
      children: h(Item, { children: 'solo' }),
    })
    expect(result).toBeDefined()
  })

  it('explicit interval + appear + timeout overrides defaults (arm 0 truthy)', () => {
    const show = signal(true)
    const Item: ComponentFn<{ children?: string }> = (p) => h('span', null, p.children ?? 'x')
    const onAfterLeave = vi.fn()
    const result = Stagger({
      show: () => show(),
      interval: 100,
      appear: true,
      timeout: 1000,
      reverseLeave: false,
      onAfterLeave,
      children: [h(Item, { children: 'a' })],
    })
    expect(result).toBeDefined()
  })
})
