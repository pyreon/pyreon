/**
 * Regression lock: the REAL @pyreon/elements Portal must resolve owner-based
 * context for its children when it mounts through a reactive flip AFTER the
 * provider's setup frame has unwound (the dropdown/overlay-opens-later shape).
 *
 * Provenance: external finding PZ-03 ("Portals don't see context across the
 * reactive-thunk boundary") — NOT reproducible on main (0.39.0). This is the
 * ui-system half of the suite; the core mount paths (static, reactive-flip,
 * inner-flip, _tpl+_mountSlot, keyed-For row) are locked in
 * packages/core/runtime-dom/src/tests/portal-context-owner.test.ts. A
 * sensitivity bisect nulling the owner restore in runtime-dom's
 * mountReactive makes this spec fail with the context falling back to its
 * default — the owner-restore regression class from anti-patterns.md
 * ("Deferred island hydration that mounts WITHOUT re-establishing the
 * marker's context owner").
 */
import { createContext, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { Portal } from '../Portal'

const Ctx = createContext('DEFAULT')

describe('Portal — context resolution under a reactive flip (PZ-03 class)', () => {
  it('(g) child inside the elements Portal reads ancestor context when mounted on a later flip', async () => {
    let seen: string | undefined
    const domLocation = document.createElement('div')
    document.body.appendChild(domLocation)
    const open = signal(false)

    function Child() {
      seen = useContext(Ctx)
      return h('span', null, seen)
    }

    function Provider() {
      provide(Ctx, 'PROVIDED')
      return () => (open() ? h(Portal, { DOMLocation: domLocation }, h(Child, null)) : null)
    }

    const root = document.createElement('div')
    document.body.appendChild(root)
    const unmount = mount(h(Provider, null), root)
    expect(seen).toBeUndefined() // portal not mounted yet

    open.set(true)
    await new Promise((r) => setTimeout(r, 10))

    expect(seen).toBe('PROVIDED')
    expect(domLocation.textContent).toBe('PROVIDED')

    unmount()
    root.remove()
    domLocation.remove()
  })
})
