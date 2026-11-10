/**
 * Lean component instances: a component with no unmount work keeps neither a
 * hooks object nor `mountComponent`'s whole closure context alive, and render
 * bindings register their bare disposer with the scope. Every spec checks the
 * teardown still happens — the leak-class contract for lazy allocation.
 */
import { h, onMount, onUnmount } from '@pyreon/core'
import { _hasSubscribers, effect, effectScope, onCleanup, renderEffect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

describe('lean component unmount', () => {
  it('a hook-less component still disposes its bindings and removes its DOM', () => {
    const s = signal('a')
    const Leaf = () => h('b', null, () => s())
    const host = document.createElement('div')
    const dispose = mount(h('div', null, h(Leaf, null), h(Leaf, null)), host)
    expect(host.textContent).toBe('aa')
    expect(_hasSubscribers(s)).toBe(true)
    dispose()
    expect(_hasSubscribers(s)).toBe(false)
    expect(host.textContent).toBe('')
  })

  it('an effect in a hook-less component body is stopped with the component scope', () => {
    const s = signal(0)
    let runs = 0
    const Comp = () => {
      effect(() => {
        s()
        runs++
      })
      return h('i', null, 'x')
    }
    const host = document.createElement('div')
    const dispose = mount(h('div', null, h(Comp, null)), host)
    s.set(1)
    expect(runs).toBe(2)
    dispose()
    s.set(2)
    expect(runs).toBe(2)
    expect(_hasSubscribers(s)).toBe(false)
  })

  it('a setup onCleanup as the ONLY registration still runs on unmount', () => {
    let cleaned = 0
    const Comp = () => {
      onCleanup(() => cleaned++)
      return h('i', null, 'x')
    }
    const host = document.createElement('div')
    const dispose = mount(h(Comp, null), host)
    expect(cleaned).toBe(0)
    dispose()
    expect(cleaned).toBe(1)
  })

  it('setup onCleanup, onUnmount and onMount cleanups all run on unmount', () => {
    const log: string[] = []
    const Comp = () => {
      onCleanup(() => log.push('cleanup'))
      onUnmount(() => log.push('unmount'))
      onMount(() => () => log.push('mount-cleanup'))
      return h('i', null, 'x')
    }
    const host = document.createElement('div')
    const dispose = mount(h(Comp, null), host)
    expect(log).toEqual([])
    dispose()
    expect(log.sort()).toEqual(['cleanup', 'mount-cleanup', 'unmount'])
  })

  it('a bare disposer registered with a scope runs on stop', () => {
    const scope = effectScope()
    let ran = 0
    scope.add(() => ran++)
    scope.add({ dispose: () => ran++ })
    scope.stop()
    expect(ran).toBe(2)
  })

  it('a render binding in a scope is torn down by scope.stop()', () => {
    const s = signal(0)
    const scope = effectScope()
    let runs = 0
    scope.runInScope(() => renderEffect(() => { s(); runs++ }))
    s.set(1)
    expect(runs).toBe(2)
    scope.stop()
    s.set(2)
    expect(runs).toBe(2)
    expect(_hasSubscribers(s)).toBe(false)
  })
})
