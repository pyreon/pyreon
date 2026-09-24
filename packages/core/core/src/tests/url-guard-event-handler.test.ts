/**
 * `isEventHandlerAttr` is the ONE predicate every attribute sink consults, and
 * it is consumed from other packages — so core itself never executed it. Its
 * branches are the whole contract: the charCode probe must be cheap enough to
 * run per attribute per element, which is why it is not a regex, and why each
 * early exit deserves a case.
 *
 * The lowercase arm is the load-bearing one: only REAL handler names are
 * executable markup, so `once` / `onyx` / `only` must still render as ordinary
 * attributes rather than being dropped by a prefix test.
 */
import { describe, expect, it } from 'vitest'
import { isElementEventHandlerAttr, isEventHandlerAttr } from '../url-guard'

describe('isEventHandlerAttr', () => {
  it('refuses both spellings of a real handler', () => {
    expect(isEventHandlerAttr('onclick')).toBe(true)
    expect(isEventHandlerAttr('onClick')).toBe(true)
    expect(isEventHandlerAttr('onpointerrawupdate')).toBe(true)
  })

  it('passes ordinary attributes that merely start with "on"', () => {
    for (const name of ['once', 'onyx', 'only']) expect(isEventHandlerAttr(name)).toBe(false)
  })

  it('passes a short name, and one that is not "on"-prefixed', () => {
    for (const name of ['', 'o', 'on', 'id', 'class', 'href']) {
      expect(isEventHandlerAttr(name)).toBe(false)
    }
  })

  it('passes a name whose third character is neither a letter nor uppercase', () => {
    // `on-` / `on_` / `on1` are not handler spellings in any vocabulary.
    for (const name of ['on-click', 'on_click', 'on1click']) {
      expect(isEventHandlerAttr(name)).toBe(false)
    }
  })
})

/**
 * The CLIENT twin: asks the element which lowercase `on*` names are handlers
 * (`key in el`) instead of consulting the list. A plain object stands in for
 * the element — the predicate only ever uses `in`, so the object's own keys ARE
 * the "interface" under test. Real-browser coverage (every handler Chromium
 * defines, on 12 element families) lives in runtime-dom's
 * `event-handler-attr.browser.test.tsx`.
 */
describe('isElementEventHandlerAttr', () => {
  const el = { onclick: null, onload: null, once: 'data' } as unknown as Element

  it('refuses a lowercase name the element defines as a handler', () => {
    expect(isElementEventHandlerAttr(el, 'onclick')).toBe(true)
    expect(isElementEventHandlerAttr(el, 'onload')).toBe(true)
  })

  it('writes a lowercase on* name the element does NOT define', () => {
    // `onzoom` is in EVENT_HANDLER_ATTRS but this "element" has no such
    // handler, so the attribute would be inert — the element is the authority.
    expect(isElementEventHandlerAttr(el, 'onzoom')).toBe(false)
    expect(isElementEventHandlerAttr(el, 'onyx')).toBe(false)
  })

  it('refuses camelCase unconditionally (setAttribute would lowercase it)', () => {
    expect(isElementEventHandlerAttr(el, 'onClick')).toBe(true)
    expect(isElementEventHandlerAttr(el, 'onAnything')).toBe(true)
  })

  it('writes an ordinary on* PROPERTY a custom element defines (not a handler shape)', () => {
    // A web component with `online = false` / `onboarding = 'step-1'` must keep
    // its attribute: only a null-or-function value is an event-handler IDL slot.
    const custom = { online: false, onboarding: 'step-1', onthing: () => {} } as unknown as Element
    expect(isElementEventHandlerAttr(custom, 'online')).toBe(false)
    expect(isElementEventHandlerAttr(custom, 'onboarding')).toBe(false)
    expect(isElementEventHandlerAttr(custom, 'onthing')).toBe(true)
  })

  it('never treats short or non-on names as handlers', () => {
    for (const k of ['', 'o', 'on', 'once', 'href', 'class', 'Onclick', 'on1', 'on-x']) {
      expect(isElementEventHandlerAttr(el, k), k).toBe(false)
    }
  })
})
