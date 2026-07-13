import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetHotkeys,
  disableScope,
  enableScope,
  getActiveScopes,
  registerHotkey,
} from '../registry'

function fire(key: string, mods: { ctrlKey?: boolean } = {}): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey: mods.ctrlKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  )
}

// Scope activation is reference-counted: a scope stays active until every
// enableScope (acquire) is matched by a disableScope (release). This fixes the
// stacked-component bug where the first component to unmount disabled the scope
// for every surviving component (the documented non-refcount gotcha).
describe('hotkeys — scope reference counting', () => {
  beforeEach(() => _resetHotkeys())
  afterEach(() => _resetHotkeys())

  it('two acquires keep the scope active until BOTH release (stacked components)', () => {
    let count = 0
    registerHotkey('ctrl+z', () => count++, { scope: 'editor' })

    enableScope('editor') // component A mounts
    enableScope('editor') // component B mounts
    expect(getActiveScopes().peek().has('editor')).toBe(true)

    disableScope('editor') // A unmounts — B still up
    expect(getActiveScopes().peek().has('editor')).toBe(true)
    fire('z', { ctrlKey: true })
    expect(count).toBe(1) // still fires for B

    disableScope('editor') // B unmounts — last release
    expect(getActiveScopes().peek().has('editor')).toBe(false)
    fire('z', { ctrlKey: true })
    expect(count).toBe(1) // no longer fires
  })

  it('a single acquire/release toggles the scope', () => {
    enableScope('modal')
    expect(getActiveScopes().peek().has('modal')).toBe(true)
    disableScope('modal')
    expect(getActiveScopes().peek().has('modal')).toBe(false)
  })

  it('releasing an un-acquired scope is a no-op (count clamps at zero)', () => {
    disableScope('never-enabled')
    expect(getActiveScopes().peek().size).toBe(1) // just 'global'
    // A subsequent acquire still activates cleanly (no negative-count leak).
    enableScope('never-enabled')
    expect(getActiveScopes().peek().has('never-enabled')).toBe(true)
  })

  it('activeScopes signal only writes on 0↔1 transitions (no spurious churn)', () => {
    let writes = 0
    const scopes = getActiveScopes()
    const unsub = scopes.subscribe(() => writes++)
    writes = 0 // ignore the initial subscribe emission if any

    enableScope('x') // 0→1 — one write
    enableScope('x') // 1→2 — no write
    enableScope('x') // 2→3 — no write
    disableScope('x') // 3→2 — no write
    disableScope('x') // 2→1 — no write
    disableScope('x') // 1→0 — one write
    unsub()

    expect(writes).toBe(2)
  })

  it("'global' is never counted and cannot be deactivated", () => {
    enableScope('global')
    disableScope('global')
    disableScope('global')
    expect(getActiveScopes().peek().has('global')).toBe(true)
  })
})
