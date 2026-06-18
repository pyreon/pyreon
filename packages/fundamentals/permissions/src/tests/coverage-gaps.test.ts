import { popContext } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { PermissionsProvider, usePermissions } from '../context'
import { createPermissions } from '../permissions'

// `PermissionsProvider` is a plain function: it calls `provide(...)` then
// returns `props.children ?? null`. Called outside a component (no context
// owner), `provide()` pushes onto the request-scoped SSR stack, which
// `useContext()` resolves as a fallback — so the provide → useContext
// round-trip is observable here. Each test pops the frame it pushed so the
// shared SSR stack stays clean for sibling tests.
describe('PermissionsProvider — direct invocation', () => {
  afterEach(() => {
    // Drain any frame this file's tests pushed (no-op if already balanced).
    popContext()
  })

  it('provides its instance so usePermissions() reads it back (if@45 falsy arm — no throw)', () => {
    const can = createPermissions({ 'posts.read': true, 'posts.update': false })

    // Pushes `can` onto the context stack + returns the children value.
    PermissionsProvider({ instance: can })

    const resolved = usePermissions()
    expect(resolved).toBe(can)
    expect(resolved('posts.read')).toBe(true)
    expect(resolved('posts.update')).toBe(false)
  })

  it('returns its children when provided (props.children ?? null — left arm)', () => {
    const can = createPermissions({ feature: true })
    const child = 'rendered-child'

    const out = PermissionsProvider({ instance: can, children: child })

    expect(out).toBe(child)
  })

  it('returns null when no children given (props.children ?? null — right arm)', () => {
    const can = createPermissions({ feature: true })

    // `children` is undefined → nullish-coalesces to null.
    const out = PermissionsProvider({ instance: can })

    expect(out).toBeNull()
  })
})
