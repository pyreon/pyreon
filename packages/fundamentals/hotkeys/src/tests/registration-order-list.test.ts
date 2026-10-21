/**
 * The registry keeps every entry in an intrusive linked list (registration
 * order) instead of a Set, and keeps emptied key buckets around for the next
 * mount. These specs lock what that must not change: order after removals from
 * the head, middle and tail, idempotent unregister, a reset that a stale
 * unregister cannot corrupt, re-registration on a key whose bucket was emptied,
 * and a comma list that still reaches every shortcut once its parts are cached.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { _resetHotkeys, getHotkeyConflicts, getRegisteredHotkeys, registerHotkey } from '../registry'

const press = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
const names = () => getRegisteredHotkeys().map((h) => h.shortcut)

afterEach(() => _resetHotkeys())

describe('registration-order list', () => {
  it('keeps registration order after removing the head, a middle entry and the tail', () => {
    const offs = ['ctrl+a', 'ctrl+b', 'ctrl+c', 'ctrl+d', 'ctrl+e'].map((s) =>
      registerHotkey(s, () => {}),
    )
    offs[2]!()
    expect(names()).toEqual(['ctrl+a', 'ctrl+b', 'ctrl+d', 'ctrl+e'])
    offs[0]!()
    expect(names()).toEqual(['ctrl+b', 'ctrl+d', 'ctrl+e'])
    offs[4]!()
    expect(names()).toEqual(['ctrl+b', 'ctrl+d'])
    registerHotkey('ctrl+f', () => {})
    expect(names()).toEqual(['ctrl+b', 'ctrl+d', 'ctrl+f'])
  })

  it('removes the last entry and accepts new ones afterwards', () => {
    const off = registerHotkey('ctrl+a', () => {})
    off()
    expect(names()).toEqual([])
    registerHotkey('ctrl+b', () => {})
    expect(names()).toEqual(['ctrl+b'])
  })

  it('treats a second unregister as a no-op', () => {
    const offA = registerHotkey('ctrl+a', () => {})
    registerHotkey('ctrl+b', () => {})
    offA()
    offA()
    expect(names()).toEqual(['ctrl+b'])
  })

  it('is not corrupted by an unregister held across a reset', () => {
    // A non-head entry: its stale links point at entries from before the
    // reset, so unlinking it would rewrite the new list's tail.
    registerHotkey('ctrl+a', () => {})
    const stale = registerHotkey('ctrl+b', () => {})
    _resetHotkeys()
    registerHotkey('ctrl+c', () => {})
    registerHotkey('ctrl+d', () => {})
    stale()
    registerHotkey('ctrl+e', () => {})
    expect(names()).toEqual(['ctrl+c', 'ctrl+d', 'ctrl+e'])
  })

  it('fires again after a key whose bucket was emptied is registered anew', () => {
    let hits = 0
    for (let cycle = 0; cycle < 3; cycle++) {
      const off = registerHotkey('ctrl+k', () => hits++)
      press({ key: 'k', ctrlKey: true })
      off()
      press({ key: 'k', ctrlKey: true })
    }
    expect(hits).toBe(3)
  })

  it('removes an entry from the middle of a shared bucket and keeps the others firing in order', () => {
    const order: string[] = []
    registerHotkey('ctrl+k', () => order.push('a'), { preventDefault: false })
    const offB = registerHotkey('ctrl+k', () => order.push('b'), { preventDefault: false })
    registerHotkey('ctrl+k', () => order.push('c'), { preventDefault: false })
    offB()
    press({ key: 'k', ctrlKey: true })
    expect(order).toEqual(['a', 'c'])
  })

  it('still splits a comma list once its parts are already cached', () => {
    let hits = 0
    registerHotkey('ctrl+s', () => {})()
    registerHotkey('ctrl+p', () => {})()
    const off = registerHotkey('ctrl+s, ctrl+p', () => hits++)
    expect(names()).toEqual(['ctrl+s', 'ctrl+p'])
    press({ key: 's', ctrlKey: true })
    press({ key: 'p', ctrlKey: true })
    expect(hits).toBe(2)
    off()
    expect(names()).toEqual([])
  })

  it('reports conflicts by walking the list', () => {
    registerHotkey('ctrl+s', () => {})
    registerHotkey('ctrl+x', () => {})
    registerHotkey('control+s', () => {})
    expect(getHotkeyConflicts().map((c) => c.shortcuts)).toEqual([['ctrl+s', 'control+s']])
  })
})

describe('dispatch and trigger edges', () => {
  it('does not trigger a sequence when only its first key is given', async () => {
    const { trigger } = await import('../registry')
    let hits = 0
    registerHotkey('g t', () => hits++)
    expect(trigger('g')).toBe(0)
    expect(trigger('g t')).toBe(1)
    expect(hits).toBe(1)
  })

  it('reads the event target when composedPath is missing or empty, and skips a target-less event', () => {
    // happy-dom's own dispatch needs composedPath, so call the registry's
    // listener directly with plain event objects.
    let listener: ((e: Event) => void) | undefined
    const add = window.addEventListener.bind(window)
    window.addEventListener = ((type: string, fn: (e: Event) => void, o?: unknown) => {
      if (type === 'keydown') listener = fn
      return add(type, fn as EventListener, o as AddEventListenerOptions)
    }) as typeof window.addEventListener
    let hits = 0
    try {
      registerHotkey('k', () => hits++)
    } finally {
      window.addEventListener = add
    }
    const base = {
      key: 'k',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
      preventDefault() {},
      stopPropagation() {},
      getModifierState: () => false,
    }
    listener!({ ...base, target: document.body } as unknown as Event)
    listener!({ ...base, target: document.body, composedPath: () => [] } as unknown as Event)
    // No target at all: not an editable field, so it still fires.
    listener!({ ...base, target: null } as unknown as Event)
    expect(hits).toBe(3)
  })
})
