import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createPermissions, PermissionsProvider, usePermissions } from '../index'
import type { Permissions } from '../types'

describe('usePermissions([]) — an explicit empty grant list is deny-all', () => {
  it('does not fall back to the provider instance', () => {
    const provided = createPermissions({ '*': true })
    let seeded: Permissions | undefined
    let fromProvider: Permissions | undefined
    const Child = () => {
      seeded = usePermissions([])
      fromProvider = usePermissions()
      return null
    }
    const el = document.createElement('div')
    const unmount = mount(h(PermissionsProvider, { value: provided }, h(Child, null)), el)
    expect(fromProvider).toBe(provided)
    expect(seeded).not.toBe(provided)
    expect(seeded!('anything')).toBe(false)
    expect(seeded!.granted()).toEqual([])
    unmount()
  })

  it('works without a provider (self-contained, like any seeded call)', () => {
    let seeded: Permissions | undefined
    const el = document.createElement('div')
    const unmount = mount(
      h(() => {
        seeded = usePermissions([])
        return null
      }, null),
      el,
    )
    expect(seeded!('posts.read')).toBe(false)
    unmount()
  })
})

describe('resolve memo — re-enabled once patch removes the last predicate', () => {
  it('a wildcard check becomes a single memo lookup after the predicate is patched away', () => {
    const can = createPermissions({ 'a.**': true, edit: () => true })
    can.patch({ edit: true }) // the only predicate is now a static boolean
    expect(can('a.b.c.d')).toBe(true) // populate the memo
    const get = vi.spyOn(Map.prototype, 'get')
    try {
      expect(can('a.b.c.d')).toBe(true)
      // Memo hit = exactly one Map.get (the resolve cache). A disabled memo
      // walks exact → recursive ancestors (4+ gets).
      expect(get.mock.calls.length).toBe(1)
    } finally {
      get.mockRestore()
    }
  })

  it('stays disabled while any predicate remains', () => {
    let calls = 0
    const can = createPermissions({
      one: () => {
        calls++
        return true
      },
      two: () => true,
    })
    can.patch({ two: true }) // `one` is still a predicate
    can('one')
    can('one')
    expect(calls).toBe(2)
  })

  it('a patch that ADDS a predicate disables it again', () => {
    let calls = 0
    const can = createPermissions({ edit: true })
    can('edit')
    can.patch({
      edit: () => {
        calls++
        return true
      },
    })
    can('edit')
    can('edit')
    expect(calls).toBe(2)
  })
})

describe('can.all / can.any — context-bearing array form', () => {
  const can = createPermissions({
    read: true,
    edit: (ctx) => (ctx as { owner?: boolean } | undefined)?.owner === true,
  })

  it('passes the context to every predicate', () => {
    expect(can.all(['read', 'edit'], { owner: true })).toBe(true)
    expect(can.all(['read', 'edit'], { owner: false })).toBe(false)
    expect(can.any(['edit'], { owner: true })).toBe(true)
    expect(can.any(['edit', 'missing'], { owner: false })).toBe(false)
  })

  it('the rest-args form is unchanged', () => {
    expect(can.all('read')).toBe(true)
    expect(can.all('read', 'edit')).toBe(false)
    expect(can.any('read', 'edit')).toBe(true)
    expect(can.all()).toBe(true)
    expect(can.any()).toBe(false)
  })
})
