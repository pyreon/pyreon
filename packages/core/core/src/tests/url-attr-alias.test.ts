import { describe, expect, it } from 'vitest'

import { EVENT_HANDLER_ATTRS, isUrlAttr, URL_ATTRS } from '../url-guard'

/**
 * `isUrlAttr` exists because the guard call sites are handed the JSX PROP name
 * while `URL_ATTRS` holds ATTRIBUTE names, and for `formaction` the two differ.
 * `formAction` is an advertised typed prop, so the idiomatic TSX spelling was
 * the one that missed the set — and `formaction` overrides `<form action>`,
 * which is in the set precisely because `javascript:` executes on submit.
 */
describe('isUrlAttr resolves the attribute name before asking', () => {
  it('accepts the attribute spelling directly', () => {
    for (const a of URL_ATTRS) expect(isUrlAttr(a), a).toBe(true)
  })

  it('accepts the camelCase alias', () => {
    expect(isUrlAttr('formAction')).toBe(true)
  })

  it('rejects an ordinary prop', () => {
    for (const k of ['title', 'id', 'class', 'value', 'alt']) {
      expect(isUrlAttr(k), k).toBe(false)
    }
  })

  // The fast path only pays the `toLowerCase` when the key CONTAINS an
  // uppercase character. Both sides of that branch matter: a camelCase key that
  // is not a URL attribute must still be rejected, and an all-lowercase key
  // must never take the lowercase path at all.
  it('rejects a camelCase key that is not a URL attribute', () => {
    expect(isUrlAttr('onClick')).toBe(false)
    expect(isUrlAttr('tabIndex')).toBe(false)
    expect(isUrlAttr('formMethod')).toBe(false)
  })

  it('rejects an all-lowercase non-URL key without the alias lookup', () => {
    expect(isUrlAttr('placeholder')).toBe(false)
    expect(isUrlAttr('')).toBe(false)
  })
})

/**
 * A NAME SET rather than `/^on[a-z]/`, because the broad regex also eats `once`
 * and `onyx`, which are ordinary attributes an existing SSR spec asserts must
 * still render. Every real handler name is refused; an unknown `on*` is kept.
 */
describe('EVENT_HANDLER_ATTRS', () => {
  it('holds the handler names, lowercase', () => {
    for (const n of ['onclick', 'onerror', 'onload', 'onsubmit', 'onmouseover', 'onfocus']) {
      expect(EVENT_HANDLER_ATTRS.has(n), n).toBe(true)
    }
  })

  it('does NOT hold on-prefixed non-handlers', () => {
    for (const n of ['once', 'onyx', 'only', 'on']) {
      expect(EVENT_HANDLER_ATTRS.has(n), n).toBe(false)
    }
  })

  it('is lowercase throughout — the camelCase form is matched by shape, not by name', () => {
    for (const n of EVENT_HANDLER_ATTRS) expect(n, n).toBe(n.toLowerCase())
  })
})
