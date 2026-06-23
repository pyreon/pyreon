// Modern string ID / encoding format checks: cuid2 / ulid / nanoid / emoji /
// base64 / jwt. Each routes through the client/server format registry seam.
import { afterEach, describe, expect, it } from 'vitest'
import { s } from '../v1'
import { installFormatValidator, uninstallFormatValidator } from '../core/registry'

const ok = (schema: { parse: (v: unknown) => { ok: boolean } }, v: string) => schema.parse(v).ok

describe('cuid2', () => {
  const schema = s.string().cuid2()
  it('accepts a valid cuid2', () => {
    expect(ok(schema, 'tz4a98xxat96iws9zmbrgj3a')).toBe(true)
  })
  it('rejects uppercase / leading-digit / symbols', () => {
    expect(ok(schema, 'TZ4A98')).toBe(false) // uppercase
    expect(ok(schema, '4a98xx')).toBe(false) // leading digit
    expect(ok(schema, 'has space')).toBe(false)
  })
})

describe('ulid', () => {
  const schema = s.string().ulid()
  it('accepts a valid 26-char ULID (case-insensitive)', () => {
    expect(ok(schema, '01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true)
    expect(ok(schema, '01arz3ndektsv4rrffq69g5fav')).toBe(true)
  })
  it('rejects wrong length or excluded letters (I/L/O/U)', () => {
    expect(ok(schema, '01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false) // 25 chars
    expect(ok(schema, '01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false) // contains I
  })
})

describe('nanoid', () => {
  const schema = s.string().nanoid()
  it('accepts URL-safe alphabet', () => {
    expect(ok(schema, 'V1StGXR8_Z5jdHi6B-myT')).toBe(true)
  })
  it('rejects out-of-alphabet chars', () => {
    expect(ok(schema, 'has space')).toBe(false)
    expect(ok(schema, 'plus+slash/')).toBe(false)
  })
})

describe('emoji', () => {
  const schema = s.string().emoji()
  it('accepts emoji-only strings', () => {
    expect(ok(schema, '🎉')).toBe(true)
    expect(ok(schema, '👍🔥✨')).toBe(true)
  })
  it('rejects text or mixed', () => {
    expect(ok(schema, 'hi')).toBe(false)
    expect(ok(schema, '🎉 party')).toBe(false)
  })
})

describe('base64', () => {
  const schema = s.string().base64()
  it('accepts valid base64 (with + without padding)', () => {
    expect(ok(schema, 'aGVsbG8=')).toBe(true) // "hello"
    expect(ok(schema, 'YWJjZA==')).toBe(true)
    expect(ok(schema, 'YWJjZGVm')).toBe(true) // no padding needed
  })
  it('rejects non-base64 / wrong length', () => {
    expect(ok(schema, 'not base64!')).toBe(false)
    expect(ok(schema, 'abc')).toBe(false) // length not multiple of 4
  })
})

describe('jwt', () => {
  const schema = s.string().jwt()
  it('accepts a three-segment token shape', () => {
    expect(ok(schema, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-_DEF')).toBe(true)
  })
  it('rejects wrong segment count', () => {
    expect(ok(schema, 'only.two')).toBe(false)
    expect(ok(schema, 'a.b.c.d')).toBe(false)
  })
})

describe('client/server registry seam', () => {
  afterEach(() => {
    uninstallFormatValidator('ulid')
  })

  it('a registered validator upgrades the format check (server tier)', () => {
    const schema = s.string().ulid()
    const valid = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    expect(ok(schema, valid)).toBe(true)
    // Install a stricter server validator that rejects everything.
    installFormatValidator('ulid', () => false)
    expect(ok(schema, valid)).toBe(false) // now upgraded → rejects
  })
})

describe('compose with other checks', () => {
  it('cuid2 + min length', () => {
    const schema = s.string().cuid2().min(10)
    expect(ok(schema, 'tz4a98xxat96iws9zmbrgj3a')).toBe(true)
    expect(ok(schema, 'abc')).toBe(false) // valid cuid2 shape but too short
  })

  it('field-level format check carries the path under an object', () => {
    const schema = s.object({ id: s.string().ulid() })
    const r = schema.parse({ id: 'nope' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual(['id'])
  })
})
