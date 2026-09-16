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
import { isEventHandlerAttr } from '../url-guard'

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
