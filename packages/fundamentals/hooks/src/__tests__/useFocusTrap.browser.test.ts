/**
 * Real-Chromium regression lock for `useFocusTrap`.
 *
 * The node/happy-dom suite (`useFocusTrap.test.ts`) mocks `@pyreon/core` and
 * runs under happy-dom, where focus / `document.activeElement` / real Tab
 * movement / `Element.checkVisibility` / the actual focusability of a
 * `contenteditable` region or a `<video controls>` are all unreliable (per
 * `.claude/rules/test-environment-parity.md`). This suite mounts a REAL trap
 * in real Chromium, drives real Tab / Shift+Tab keydown, and asserts the REAL
 * `document.activeElement` + real visibility filtering.
 *
 * Bisect lines (each capability) are documented per `describe`.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { useFocusTrap, type UseFocusTrapOptions } from '../useFocusTrap'

const disposers: Array<() => void> = []
const strayNodes: HTMLElement[] = []

/** Register a trap on `getEl` inside a real mounted component (for onMount). */
function armTrap(
  getEl: () => HTMLElement | null,
  options?: UseFocusTrapOptions | boolean | (() => boolean),
): void {
  const { unmount } = mountInBrowser(
    h(
      () => {
        useFocusTrap(getEl, options)
        return null
      },
      {},
    ),
  )
  disposers.push(unmount)
}

/** Build a detached-then-appended trap container from an HTML fragment. */
function makeContainer(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  strayNodes.push(el)
  return el
}

function focusOutside(): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = 'outside'
  document.body.appendChild(btn)
  strayNodes.push(btn)
  btn.focus()
  return btn
}

function pressTab(shift = false): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }),
  )
}

afterEach(() => {
  // Dispose every trap (detaches its document keydown listener) BEFORE clearing
  // the DOM, so no leftover always-active listener leaks into the next test.
  disposers.splice(0).forEach((d) => d())
  strayNodes.splice(0).forEach((n) => n.remove())
  document.body.innerHTML = ''
})

describe('useFocusTrap (real Chromium) — Tab cycling', () => {
  // Bisect: break the edge wrap (e.g. wrap `last` to `last`) → focus escapes /
  // stays put and the wrap specs fail.
  it('Tab at the last focusable wraps to the first', async () => {
    const c = makeContainer(
      '<button id="b1">1</button><button id="b2">2</button><button id="b3">3</button>',
    )
    armTrap(() => c)
    await flush()

    const b3 = c.querySelector<HTMLButtonElement>('#b3')!
    b3.focus()
    expect(document.activeElement).toBe(b3)

    pressTab()
    expect(document.activeElement).toBe(c.querySelector('#b1'))
  })

  it('Shift+Tab at the first focusable wraps to the last', async () => {
    const c = makeContainer(
      '<button id="b1">1</button><button id="b2">2</button><button id="b3">3</button>',
    )
    armTrap(() => c)
    await flush()

    const b1 = c.querySelector<HTMLButtonElement>('#b1')!
    b1.focus()
    expect(document.activeElement).toBe(b1)

    pressTab(true)
    expect(document.activeElement).toBe(c.querySelector('#b3'))
  })
})

describe('useFocusTrap (real Chromium) — initial focus', () => {
  // Bisect: revert the initialFocus option (default = no move) → focus stays on
  // the outside trigger and the assertion fails.
  it('moves focus to the first focusable on activate when initialFocus:true', async () => {
    const trigger = focusOutside()
    expect(document.activeElement).toBe(trigger)

    const c = makeContainer(
      '<button id="b1">1</button><button id="b2">2</button>',
    )
    armTrap(() => c, { initialFocus: true })
    await flush()

    expect(document.activeElement).toBe(c.querySelector('#b1'))
  })

  it('leaves focus on the trigger by default (backward-compatible)', async () => {
    const trigger = focusOutside()

    const c = makeContainer('<button id="b1">1</button>')
    armTrap(() => c) // no options → no focus move
    await flush()

    expect(document.activeElement).toBe(trigger)
  })

  it('honors a selector initialFocus target', async () => {
    focusOutside()
    const c = makeContainer(
      '<button id="b1">1</button><input id="field" /><button id="b2">2</button>',
    )
    armTrap(() => c, { initialFocus: '#field' })
    await flush()

    expect(document.activeElement).toBe(c.querySelector('#field'))
  })
})

describe('useFocusTrap (real Chromium) — active gating', () => {
  // Bisect: remove the `if (!isActive()) return` gate + the watch attach/detach
  // → the inactive trap still wraps and the "no wrap while inactive" assertion
  // fails.
  it('does not trap while inactive, then traps once active flips true', async () => {
    const active = signal(false)
    const c = makeContainer(
      '<button id="b1">1</button><button id="b2">2</button><button id="b3">3</button>',
    )
    armTrap(() => c, () => active())
    await flush()

    const b3 = c.querySelector<HTMLButtonElement>('#b3')!
    b3.focus()
    pressTab()
    // Inactive: the listener isn't armed, native Tab doesn't fire on a synthetic
    // event, so focus is unchanged.
    expect(document.activeElement).toBe(b3)

    active.set(true)
    await flush()

    b3.focus()
    pressTab()
    expect(document.activeElement).toBe(c.querySelector('#b1'))
  })
})

describe('useFocusTrap (real Chromium) — robust focusable query', () => {
  // Bisect: revert the strengthened FOCUSABLE selector + visibility filter →
  // contenteditable / video are skipped (initial focus lands on the wrong
  // node) and hidden nodes are treated as focusable (focusing them is a no-op
  // in a real browser → activeElement falls to <body>).
  it('treats a contenteditable region as focusable', async () => {
    focusOutside()
    const c = makeContainer(
      '<div id="ce" contenteditable="true">edit me</div><button id="b">x</button>',
    )
    armTrap(() => c, { initialFocus: true })
    await flush()

    expect(document.activeElement).toBe(c.querySelector('#ce'))
  })

  it('treats a video[controls] element as focusable', async () => {
    focusOutside()
    const c = makeContainer(
      '<video id="vid" controls></video><button id="b">x</button>',
    )
    armTrap(() => c, { initialFocus: true })
    await flush()

    expect(document.activeElement).toBe(c.querySelector('#vid'))
  })

  it('skips display:none / [hidden] / inert nodes when placing initial focus', async () => {
    focusOutside()
    const c = makeContainer(`
      <button id="none" style="display:none">x</button>
      <button id="attr" hidden>x</button>
      <div inert><button id="inert-btn">x</button></div>
      <button id="visible">x</button>
    `)
    armTrap(() => c, { initialFocus: true })
    await flush()

    // The first three are un-focusable; focus must land on #visible, not fall
    // through to <body> (which is what focusing a display:none node produces).
    expect(document.activeElement).toBe(c.querySelector('#visible'))
  })

  it('wraps onto the last VISIBLE focusable, skipping a trailing hidden node', async () => {
    const c = makeContainer(
      '<button id="b1">1</button><button id="b2">2</button><button id="hidden" style="display:none">h</button>',
    )
    armTrap(() => c)
    await flush()

    // #b2 is the last VISIBLE focusable; Tab there must wrap to #b1. With the
    // old (no-visibility-filter) query, the display:none button would count as
    // "last", #b2 wouldn't be the edge, and no wrap would happen.
    const b2 = c.querySelector<HTMLButtonElement>('#b2')!
    b2.focus()
    pressTab()
    expect(document.activeElement).toBe(c.querySelector('#b1'))
  })
})
