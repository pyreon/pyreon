/**
 * The RATCHET behind `EVENT_HANDLER_ATTRS`.
 *
 * The set is a hand-maintained list of a moving target, which is how it came to
 * be HTML-only: every SVG SMIL handler (`onbegin`/`onend`/`onrepeat`) and every
 * vendor-legacy one a shipping engine still compiles (`onmousewheel`,
 * `onwebkit*`, `onbeforecopy`, `onsearch`, …) was an unguarded sink — 36 names,
 * measured by running exactly this enumeration against the pre-fix set.
 *
 * So the vocabulary is DERIVED rather than remembered: enumerate every `on*` IDL
 * event handler a real browser exposes on the HTML, SVG and Window prototype
 * chains and require the set to be a superset. A future browser adding one reds
 * this gate instead of quietly becoming a hole.
 *
 * Direction matters: superset only. Extra names cost nothing (refusing more is
 * always safe), and the set deliberately carries SVG 1.1 and Gecko/WebKit names
 * that Chromium does not expose — asserting equality would delete exactly the
 * cross-engine coverage this fix added.
 */
import { describe, expect, it } from 'vitest'
import { EVENT_HANDLER_ATTRS, isEventHandlerAttr } from '@pyreon/core'

const SVG_NS = 'http://www.w3.org/2000/svg'

function collectHandlerNames(o: object | null, into: Set<string>): void {
  let cur: object | null = o
  while (cur) {
    for (const n of Object.getOwnPropertyNames(cur)) {
      // `on` + a lowercase letter: the IDL spelling of a handler. camelCase
      // members are not handler attributes, and `on`/`once` cannot appear here.
      if (n.length > 2 && n.startsWith('on') && n.charCodeAt(2) >= 97 && n.charCodeAt(2) <= 122) {
        into.add(n)
      }
    }
    cur = Object.getPrototypeOf(cur)
  }
}

describe('EVENT_HANDLER_ATTRS covers the browser vocabulary', () => {
  it('every `on*` IDL handler this browser exposes is in the set', () => {
    const names = new Set<string>()
    // One element per prototype family that adds handlers of its own: HTML
    // globals, <body> (Window-reflecting), media, form controls, <dialog>,
    // plus SVG's root / animation / graphics elements, plus Window itself.
    for (const tag of ['div', 'body', 'video', 'input', 'dialog']) {
      collectHandlerNames(document.createElement(tag), names)
    }
    for (const tag of ['svg', 'animate', 'rect']) {
      collectHandlerNames(document.createElementNS(SVG_NS, tag), names)
    }
    collectHandlerNames(window as unknown as object, names)

    expect(names.size, 'the enumeration itself must not silently collapse').toBeGreaterThan(100)

    const missing = [...names].filter((n) => !EVENT_HANDLER_ATTRS.has(n)).sort()
    expect(
      missing,
      `Unguarded event-handler names — add them to EVENT_HANDLER_ATTRS in ` +
        `packages/core/core/src/url-guard.ts. Each one is a live sink: writing it ` +
        `as an attribute executes its value.`,
    ).toEqual([])
  })

  it('and `isEventHandlerAttr` agrees with the set on every one of them', () => {
    // The predicate is what the sinks actually call; a name in the set that the
    // probe rejects (or vice versa) would be a set nobody consults.
    for (const n of EVENT_HANDLER_ATTRS) {
      expect(isEventHandlerAttr(n), n).toBe(true)
    }
    for (const n of ['once', 'onyx', 'only', 'on', 'onX', 'class', 'href']) {
      expect(isEventHandlerAttr(n), n).toBe(n === 'onX')
    }
  })
})
