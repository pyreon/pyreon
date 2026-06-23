// A5 completion: url / uuid / iso.date / iso.dateTime / iso.time now route
// through the client/server format registry (previously hardcoded regex), so a
// server can upgrade ANY of them in place via installFormatValidator.
import { afterEach, describe, expect, it } from 'vitest'
import { s } from '../v1'
import { installFormatValidator, uninstallFormatValidator } from '../core/registry'

const ok = (schema: { parse: (v: unknown) => { ok: boolean } }, v: string) => schema.parse(v).ok

describe('url/uuid/iso still validate correctly (client default)', () => {
  it('url', () => {
    expect(ok(s.string().url(), 'https://example.com/x')).toBe(true)
    expect(ok(s.string().url(), 'not a url')).toBe(false)
  })
  it('uuid', () => {
    expect(ok(s.string().uuid(), '550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(ok(s.string().uuid(), 'nope')).toBe(false)
  })
  it('iso.date / iso.dateTime / iso.time', () => {
    expect(ok(s.string().iso.date(), '2026-06-23')).toBe(true)
    expect(ok(s.string().iso.date(), '06/23/2026')).toBe(false)
    expect(ok(s.string().iso.dateTime(), '2026-06-23T12:00:00Z')).toBe(true)
    expect(ok(s.string().iso.time(), '12:00:00')).toBe(true)
    expect(ok(s.string().iso.time(), '25:99')).toBe(false)
  })
})

describe('registry seam — a registered validator upgrades each format', () => {
  const formats: Array<[string, () => { parse: (v: unknown) => { ok: boolean } }, string]> = [
    ['url', () => s.string().url(), 'https://example.com'],
    ['uuid', () => s.string().uuid(), '550e8400-e29b-41d4-a716-446655440000'],
    ['iso-date', () => s.string().iso.date(), '2026-06-23'],
    ['iso-datetime', () => s.string().iso.dateTime(), '2026-06-23T12:00:00Z'],
    ['iso-time', () => s.string().iso.time(), '12:00:00'],
  ]

  afterEach(() => {
    for (const [name] of formats) uninstallFormatValidator(name)
  })

  for (const [name, make, valid] of formats) {
    it(`${name} is upgradeable`, () => {
      expect(ok(make(), valid)).toBe(true) // client default accepts
      installFormatValidator(name, () => false) // server tier rejects everything
      expect(ok(make(), valid)).toBe(false) // now upgraded → rejects
    })
  }

  it('a stricter server validator can ALSO accept what the client rejects', () => {
    const schema = s.string().uuid()
    expect(ok(schema, 'custom-id-format')).toBe(false) // client regex rejects
    installFormatValidator('uuid', (v) => v === 'custom-id-format')
    expect(ok(schema, 'custom-id-format')).toBe(true) // server validator accepts
  })
})
