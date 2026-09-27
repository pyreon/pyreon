/**
 * `.url({ protocol })` and the float-safe `.multipleOf(step)` are chain methods
 * like any other, so they must be COPY-ON-WRITE: they return a new schema and
 * leave the receiver untouched. `.url({ protocol })` goes through its own
 * `_formatWithProtocol` path rather than the shared `_format`, which is exactly
 * where a push-onto-`this._ops` could survive a refactor unnoticed.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../index'

describe('url({ protocol }) / multipleOf(fractional) do not mutate the receiver', () => {
  it('url({ protocol }) returns a new schema; the base still accepts non-URIs', () => {
    const base = s.string()
    const uri = base.url({ protocol: /^mailto$/ })
    expect(uri).not.toBe(base)
    expect(base.parse('not a uri').ok).toBe(true)
    expect(base.is('not a uri')).toBe(true)
    expect(uri.parse('mailto:a@b.co').ok).toBe(true)
    expect(uri.parse('https://x.io').ok).toBe(false)
  })

  it('two protocol-filtered siblings from one base stay independent', () => {
    const base = s.string()
    const mail = base.url({ protocol: /^mailto$/ })
    const web = base.url({ protocol: /^https$/ })
    expect(mail.parse('mailto:a@b.co').ok).toBe(true)
    expect(web.parse('https://x.io').ok).toBe(true)
    expect(mail.parse('https://x.io').ok).toBe(false)
    expect(web.parse('mailto:a@b.co').ok).toBe(false)
  })

  it('multipleOf(0.01) returns a new schema; the base still accepts 0.005', () => {
    const base = s.number()
    // Compile + cache the base first, so a mutation would also have to beat
    // the JIT cache to be visible.
    expect(base.parse(0.005).ok).toBe(true)
    const cents = base.multipleOf(0.01)
    expect(cents).not.toBe(base)
    expect(cents.parse(19.99).ok).toBe(true)
    expect(cents.parse(0.005).ok).toBe(false)
    expect(base.parse(0.005).ok).toBe(true)
    expect(base.is(0.005)).toBe(true)
  })
})
