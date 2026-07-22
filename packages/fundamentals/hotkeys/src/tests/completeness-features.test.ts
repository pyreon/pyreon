import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitShortcutList } from '../parse'
import {
  _resetHotkeys,
  getPressedKeys,
  isKeyPressed,
  registerHotkey,
  trigger,
} from '../registry'

// New completeness surface: keyup events, comma-lists, ignoreRepeat, once,
// selective enableOnInputs, element targets, pressed-key introspection,
// programmatic trigger. All dispatched through REAL DOM events (happy-dom).

const press = (
  key: string,
  init: KeyboardEventInit & { target?: EventTarget } = {},
  type: 'keydown' | 'keyup' = 'keydown',
) => {
  const { target, ...rest } = init
  const ev = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...rest })
  ;(target ?? window).dispatchEvent(ev)
  return ev
}

afterEach(() => {
  _resetHotkeys()
  document.body.innerHTML = ''
})

// ─── splitShortcutList ──────────────────────────────────────────────────────

describe('splitShortcutList', () => {
  it('splits comma-separated lists and trims', () => {
    expect(splitShortcutList('ctrl+s, mod+p')).toEqual(['ctrl+s', 'mod+p'])
    expect(splitShortcutList('a,b , c')).toEqual(['a', 'b', 'c'])
  })

  it('a literal comma KEY survives (`ctrl+,`, bare `,`, comma alias)', () => {
    expect(splitShortcutList('ctrl+,')).toEqual(['ctrl+,'])
    expect(splitShortcutList(',')).toEqual([','])
    expect(splitShortcutList('mod+comma')).toEqual(['mod+comma'])
    expect(splitShortcutList('ctrl+,, mod+s')).toEqual(['ctrl+,', 'mod+s'])
  })
})

// ─── comma-list registration ────────────────────────────────────────────────

describe('comma-separated shortcut lists', () => {
  it('binds every listed shortcut to the handler; one unregister removes all', () => {
    const handler = vi.fn()
    const un = registerHotkey('ctrl+s, ctrl+p', handler)
    press('s', { ctrlKey: true })
    press('p', { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(2)
    un()
    press('s', { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('comma-lists of SEQUENCES work (`g d, g h`)', () => {
    const handler = vi.fn()
    registerHotkey('g d, g h', handler)
    press('g')
    press('d')
    press('g')
    press('h')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('`ctrl+,` binds the comma key (VS Code "open settings")', () => {
    const handler = vi.fn()
    registerHotkey('ctrl+,', handler)
    press(',', { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

// ─── keyup events ───────────────────────────────────────────────────────────

describe("event: 'keyup'", () => {
  it('fires on keyup only', () => {
    const handler = vi.fn()
    registerHotkey('escape', handler, { event: 'keyup' })
    press('Escape') // keydown — must NOT fire
    expect(handler).not.toHaveBeenCalled()
    press('Escape', {}, 'keyup')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keydown and keyup bindings on the same combo coexist independently', () => {
    const down = vi.fn()
    const up = vi.fn()
    registerHotkey('space', down)
    registerHotkey('space', up, { event: 'keyup' })
    press(' ')
    expect(down).toHaveBeenCalledTimes(1)
    expect(up).not.toHaveBeenCalled()
    press(' ', {}, 'keyup')
    expect(up).toHaveBeenCalledTimes(1)
    expect(down).toHaveBeenCalledTimes(1)
  })

  it('sequential shortcuts reject keyup at registration', () => {
    expect(() => registerHotkey('g t', () => {}, { event: 'keyup' })).toThrow(
      /keydown-only/,
    )
  })
})

// ─── ignoreRepeat ───────────────────────────────────────────────────────────

describe('ignoreRepeat', () => {
  it('skips auto-repeat events when on; fires them by default', () => {
    const oneShot = vi.fn()
    const machineGun = vi.fn()
    registerHotkey('ctrl+s', oneShot, { ignoreRepeat: true })
    registerHotkey('ctrl+d', machineGun)
    press('s', { ctrlKey: true })
    press('s', { ctrlKey: true, repeat: true })
    press('s', { ctrlKey: true, repeat: true })
    expect(oneShot).toHaveBeenCalledTimes(1)
    press('d', { ctrlKey: true })
    press('d', { ctrlKey: true, repeat: true })
    expect(machineGun).toHaveBeenCalledTimes(2)
  })
})

// ─── once ───────────────────────────────────────────────────────────────────

describe('once', () => {
  it('fires exactly once, then auto-unregisters', () => {
    const handler = vi.fn()
    registerHotkey('ctrl+k', handler, { once: true })
    press('k', { ctrlKey: true })
    press('k', { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a once entry mid-bucket does not skip its bucket-neighbour on the same keystroke', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerHotkey('ctrl+k', first, { once: true })
    registerHotkey('ctrl+k', second)
    press('k', { ctrlKey: true })
    // Both fire on the SAME keystroke even though `first`'s auto-unregister
    // splices it out of the shared bucket mid-iteration.
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('once works for sequences', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler, { once: true })
    press('g')
    press('t')
    press('g')
    press('t')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

// ─── selective enableOnInputs ───────────────────────────────────────────────

describe('enableOnInputs (selective array form)', () => {
  const focusIn = (el: HTMLElement) => {
    document.body.appendChild(el)
    return el
  }

  it("['input'] fires in text inputs but not textareas", () => {
    const handler = vi.fn()
    registerHotkey('ctrl+b', handler, { enableOnInputs: ['input'] })
    const input = focusIn(document.createElement('input'))
    const textarea = focusIn(document.createElement('textarea'))
    press('b', { ctrlKey: true, target: input })
    expect(handler).toHaveBeenCalledTimes(1)
    press('b', { ctrlKey: true, target: textarea })
    expect(handler).toHaveBeenCalledTimes(1) // unchanged — textarea not allowed
    press('b', { ctrlKey: true }) // outside any editable — always fires
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('boolean forms keep their existing semantics', () => {
    const off = vi.fn()
    const on = vi.fn()
    registerHotkey('ctrl+1', off) // default false
    registerHotkey('ctrl+2', on, { enableOnInputs: true })
    const input = focusIn(document.createElement('input'))
    press('1', { ctrlKey: true, target: input })
    press('2', { ctrlKey: true, target: input })
    expect(off).not.toHaveBeenCalled()
    expect(on).toHaveBeenCalledTimes(1)
  })
})

// ─── element targets ────────────────────────────────────────────────────────

describe('target (element-scoped hotkeys)', () => {
  it('fires only for events dispatched within the target element', () => {
    const handler = vi.fn()
    const panel = document.createElement('div')
    const outside = document.createElement('div')
    document.body.appendChild(panel)
    document.body.appendChild(outside)

    registerHotkey('ctrl+e', handler, { target: panel })
    press('e', { ctrlKey: true, target: panel })
    expect(handler).toHaveBeenCalledTimes(1)
    press('e', { ctrlKey: true, target: outside })
    expect(handler).toHaveBeenCalledTimes(1) // event never reached `panel`
  })

  it('detaches the per-target listener when its last hotkey unregisters', () => {
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const add = vi.spyOn(panel, 'addEventListener')
    const remove = vi.spyOn(panel, 'removeEventListener')
    const un1 = registerHotkey('a', () => {}, { target: panel })
    const un2 = registerHotkey('b', () => {}, { target: panel })
    expect(add).toHaveBeenCalledTimes(1) // ONE shared keydown listener
    un1()
    expect(remove).not.toHaveBeenCalled()
    un2()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

// ─── pressed-key introspection ──────────────────────────────────────────────

describe('getPressedKeys / isKeyPressed', () => {
  it('tracks held keys reactively; blur clears', () => {
    const pressed = getPressedKeys()
    press('a')
    press('Control')
    expect([...pressed()].sort()).toEqual(['a', 'control'])
    expect(isKeyPressed('a')).toBe(true)
    expect(isKeyPressed('ctrl')).toBe(true) // alias → modifier name
    press('a', {}, 'keyup')
    expect(pressed().has('a')).toBe(false)
    window.dispatchEvent(new Event('blur'))
    expect(pressed().size).toBe(0)
  })
})

// ─── trigger ────────────────────────────────────────────────────────────────

describe('trigger', () => {
  it('fires matching handlers programmatically, respecting scope + enabled', () => {
    const a = vi.fn()
    const off = vi.fn()
    const scoped = vi.fn()
    registerHotkey('ctrl+s', a)
    registerHotkey('ctrl+s', off, { enabled: false })
    registerHotkey('ctrl+s', scoped, { scope: 'editor' })
    expect(trigger('ctrl+s')).toBe(1) // active scopes only, enabled only
    expect(a).toHaveBeenCalledTimes(1)
    expect(off).not.toHaveBeenCalled()
    expect(scoped).not.toHaveBeenCalled()
    // Explicit scope targets the scoped binding even while inactive.
    expect(trigger('ctrl+s', { scope: 'editor' })).toBe(1)
    expect(scoped).toHaveBeenCalledTimes(1)
  })

  it('triggers sequences by their full spelling', () => {
    const handler = vi.fn()
    registerHotkey('g t', handler)
    expect(trigger('g t')).toBe(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns 0 for unbound shortcuts', () => {
    expect(trigger('ctrl+q')).toBe(0)
  })
})

// ─── bucketed dispatch semantics ────────────────────────────────────────────

describe('key-bucketed dispatch preserves ordering semantics', () => {
  it('same-combo entries fire in registration order', () => {
    const order: number[] = []
    registerHotkey('ctrl+m', () => order.push(1))
    registerHotkey('ctrl+m', () => order.push(2))
    press('m', { ctrlKey: true })
    expect(order).toEqual([1, 2])
  })

  it('a keystroke with no bucket touches nothing (miss fast path)', () => {
    const handler = vi.fn()
    const enabledProbe = vi.fn(() => true)
    registerHotkey('ctrl+n', handler, { enabled: enabledProbe })
    press('x', { ctrlKey: true })
    // The enabled() gate is never even consulted on a bucket miss.
    expect(enabledProbe).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })
})
