// @vitest-environment happy-dom
/**
 * `?embed` and the shared theme preference — the two ways the workbench now
 * defers to the page around it.
 *
 * - Embedded (an iframe on a product page), it is a guest: it keeps `embed`
 *   across its own URL rewrites (a reload stays embedded), writes neither its
 *   own prefs nor the shared `pyreon-theme`, and takes its mode from the link.
 * - Standalone, its mode IS the shared preference: read on boot, written by
 *   the toggle, re-read when another tab writes it — unless a link chose the
 *   mode, which a sync must not undo.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog } from '../catalog'
import { focusables, trapTab } from '../focus-trap'
import { createModel } from '../model'
import { parseUrlState, serializeUrlState } from '../url-state'
import { componentVerdict } from '../verdict'

const CATALOG: WorkbenchCatalog = {
  components: [
    { id: 'button', name: 'Button', group: 'Actions', controls: [], render: () => 'button' },
    { id: 'badge', name: 'Badge', group: 'Actions', controls: [], render: () => 'badge' },
  ],
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('?embed in the URL state', () => {
  it('parses the bare flag, and `embed=0` opts out', () => {
    expect(parseUrlState('?embed').embed).toBe(true)
    expect(parseUrlState('?embed=1&c=button').embed).toBe(true)
    expect(parseUrlState('?embed=0').embed).toBeUndefined()
    expect(parseUrlState('?c=button').embed).toBeUndefined()
  })

  it('serialises it first and only when set', () => {
    expect(serializeUrlState({ embed: true, c: 'button' })).toBe('embed=1&c=button')
    expect(serializeUrlState({ c: 'button' })).toBe('c=button')
  })
})

describe('an embedded workbench is a guest', () => {
  it('keeps `embed` across its own URL rewrites, so a reload stays embedded', () => {
    history.replaceState(null, '', '/?embed')
    const m = createModel(CATALOG, {})
    expect(m.embed).toBe(true)
    m.selId.set('badge')
    const params = new URLSearchParams(location.search)
    expect(params.get('embed')).toBe('1')
    expect(params.get('c')).toBe('badge')
  })

  it('writes neither its own prefs nor the shared theme', () => {
    history.replaceState(null, '', '/?embed')
    const m = createModel(CATALOG, {})
    m.sidebarW.set(333)
    m.brandId.set('forest')
    m.toggleTheme()
    expect(localStorage.getItem('atlas:prefs')).toBeNull()
    expect(localStorage.getItem('pyreon-theme')).toBeNull()
  })

  it('takes its mode from the link — the host chooses', () => {
    localStorage.setItem('pyreon-theme', 'dark')
    history.replaceState(null, '', '/?embed&dark=0')
    const m = createModel(CATALOG, {})
    expect(m.dark()).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('a standalone workbench is not embedded', () => {
    expect(createModel(CATALOG, {}).embed).toBe(false)
  })
})

describe('the shared theme preference', () => {
  it('opens on the stored mode and mirrors it onto the root', () => {
    localStorage.setItem('pyreon-theme', 'light')
    const m = createModel(CATALOG, {})
    expect(m.dark()).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    localStorage.setItem('pyreon-theme', 'dark')
    expect(createModel(CATALOG, {}).dark()).toBe(true)
  })

  it('the toggle writes the shared key and flips the root', () => {
    localStorage.setItem('pyreon-theme', 'dark')
    const m = createModel(CATALOG, {})
    m.toggleTheme()
    expect(localStorage.getItem('pyreon-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    m.toggleTheme()
    expect(localStorage.getItem('pyreon-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('does not put the mode in the URL when it IS the preference', () => {
    localStorage.setItem('pyreon-theme', 'dark')
    const m = createModel(CATALOG, {})
    m.toggleTheme()
    m.selId.set('badge')
    expect(new URLSearchParams(location.search).has('dark')).toBe(false)
  })

  it('a sync picks up another tab’s choice', () => {
    localStorage.setItem('pyreon-theme', 'dark')
    const m = createModel(CATALOG, {})
    localStorage.setItem('pyreon-theme', 'light')
    m.syncTheme()
    expect(m.dark()).toBe(false)
  })

  it('a sync never undoes the mode a link chose', () => {
    localStorage.setItem('pyreon-theme', 'dark')
    history.replaceState(null, '', '/?dark=0')
    const m = createModel(CATALOG, {})
    m.syncTheme()
    expect(m.dark()).toBe(false)
  })
})

describe('componentVerdict', () => {
  const s = (verdict: 'ok' | 'fail' | 'unverified') => ({ id: verdict, name: verdict, args: {}, verdict })
  it('is ok only when every scenario passed', () => {
    expect(componentVerdict({ scenarios: [s('ok'), s('ok')] })).toBe('ok')
    expect(componentVerdict({ scenarios: [s('ok'), s('unverified')] })).toBe('unverified')
  })
  it('fails when any scenario failed', () => {
    expect(componentVerdict({ scenarios: [s('ok'), s('fail'), s('unverified')] })).toBe('fail')
  })
  it('treats "nothing examined" as unverified, never a pass', () => {
    expect(componentVerdict({ scenarios: [] })).toBe('unverified')
    expect(componentVerdict({})).toBe('unverified')
  })
})

describe('trapTab', () => {
  const setup = () => {
    const box = document.createElement('div')
    box.innerHTML = '<button id="a">a</button><input id="b"><button id="c" disabled>c</button><a id="d" href="#">d</a>'
    document.body.append(box)
    return box
  }
  const tab = (box: HTMLElement, shift = false) => {
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, cancelable: true })
    trapTab(e, box)
    return e.defaultPrevented
  }

  it('holds focus in a container with nothing focusable instead of letting Tab escape it', () => {
    const empty = document.createElement('div')
    empty.innerHTML = '<p>no controls</p>'
    document.body.append(empty)
    expect(tab(empty)).toBe(true)
    empty.remove()
  })

  it('lists the focusable elements, skipping disabled ones', () => {
    const box = setup()
    expect(focusables(box).map((el) => el.id)).toEqual(['a', 'b', 'd'])
    box.remove()
  })

  it('wraps Tab from the last to the first, and ⇧Tab from the first to the last', () => {
    const box = setup()
    ;(box.querySelector('#d') as HTMLElement).focus()
    expect(tab(box)).toBe(true)
    expect(document.activeElement?.id).toBe('a')
    expect(tab(box, true)).toBe(true)
    expect(document.activeElement?.id).toBe('d')
    box.remove()
  })

  it('leaves Tab alone in the middle', () => {
    const box = setup()
    ;(box.querySelector('#a') as HTMLElement).focus()
    expect(tab(box)).toBe(false)
    box.remove()
  })
})
