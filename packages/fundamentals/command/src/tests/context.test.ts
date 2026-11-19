import { _resetHotkeys, getRegisteredHotkeys } from '@pyreon/hotkeys'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetDefaultCommands, createCommands, provideCommands, useCommand, useCommands } from '../index'
import type { Commands } from '../index'

let root: HTMLElement
let unmounts: (() => void)[]

const mountApp = (vnode: unknown): (() => void) => {
  const un = mount(vnode as never, root) as unknown as () => void
  unmounts.push(un)
  return un
}

beforeEach(() => {
  root = document.createElement('div')
  document.body.append(root)
  unmounts = []
  _resetHotkeys()
})

afterEach(() => {
  for (const u of unmounts) u()
  root.remove()
  _resetHotkeys()
  _resetDefaultCommands()
})

describe('useCommand and the registry context', () => {
  it('registers for the lifetime of the component, in the default registry', () => {
    const Page = (): unknown => {
      useCommand({ id: 'page', title: 'Page action', shortcut: 'ctrl+p' })
      return h('p', null, 'x')
    }
    const un = mountApp(h(Page as never, null))
    expect(useCommands().commands().map((c) => c.id)).toEqual(['page'])
    expect(getRegisteredHotkeys()).toHaveLength(1)
    un()
    expect(useCommands().commands()).toEqual([])
    expect(getRegisteredHotkeys()).toHaveLength(0)
  })

  it('uses the registry provided above it, and only that one', () => {
    const mine = createCommands()
    const Page = (): unknown => {
      useCommand({ id: 'scoped', title: 'Scoped' })
      return h('p', null)
    }
    const Root = (): unknown => {
      provideCommands(mine)
      return h(Page as never, null)
    }
    mountApp(h(Root as never, null))
    expect(mine.commands().map((c) => c.id)).toEqual(['scoped'])
    expect(useCommands().commands()).toEqual([])
    mine.dispose()
  })

  it('the commands of the screen that is on show are the commands that are registered', () => {
    const screen = signal<'a' | 'b'>('a')
    const A = (): unknown => {
      useCommand({ id: 'a-only', title: 'A only' })
      return h('i', null, 'a')
    }
    const B = (): unknown => {
      useCommand({ id: 'b-only', title: 'B only' })
      return h('i', null, 'b')
    }
    mountApp(h('div', null, () => (screen() === 'a' ? h(A as never, null) : h(B as never, null))))
    const ids = (): string[] => useCommands().commands().map((c) => c.id)
    expect(ids()).toEqual(['a-only'])
    screen.set('b')
    expect(ids()).toEqual(['b-only'])
    screen.set('a')
    expect(ids()).toEqual(['a-only'])
  })

  it('accepts a function: fields follow signals, the shortcut moves only when it changed', () => {
    const label = signal('Save draft')
    const key = signal('ctrl+1')
    const Page = (): unknown => {
      useCommand(() => ({ id: 'save', title: label(), shortcut: key() }))
      return h('i', null)
    }
    mountApp(h(Page as never, null))
    const cmds: Commands = useCommands()
    expect(cmds.get('save')?.title).toBe('Save draft')
    label.set('Save')
    expect(cmds.get('save')?.title).toBe('Save')
    expect(getRegisteredHotkeys().map((h2) => h2.shortcut)).toEqual(['ctrl+1'])
    key.set('ctrl+2')
    expect(getRegisteredHotkeys().map((h2) => h2.shortcut)).toEqual(['ctrl+2'])
  })
})
