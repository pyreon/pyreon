import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../utils'
import { _resetStorageListener, useStorage } from '../local'
import { _resetRegistry } from '../registry'
import { useSessionStorage } from '../session'

// ─── Envelope round-trip (unit) ──────────────────────────────────────────────

describe('serialize/deserialize — versioned envelope', () => {
  it('wraps the value in an envelope only when `version` is set', () => {
    expect(serialize('dark', {})).toBe('"dark"')
    const enveloped = serialize('dark', { version: 2 })
    expect(enveloped).not.toBe('"dark"')
    const parsed = JSON.parse(enveloped)
    expect(parsed.__pyreonStorageV).toBe(2)
    expect(JSON.parse(parsed.__pyreonStorageD)).toBe('dark')
  })

  it('round-trips a versioned value at the matching version', () => {
    const raw = serialize({ a: 1 }, { version: 3 })
    expect(deserialize(raw, { a: 0 }, { version: 3 })).toEqual({ a: 1 })
  })

  it('runs migrate on a version mismatch, passing the old value + old version', () => {
    const raw = serialize({ name: 'Ada Lovelace' }, { version: 1 })
    const migrated = deserialize(
      raw,
      { first: '', last: '' },
      {
        version: 2,
        migrate: (old, from) => {
          expect(from).toBe(1)
          const name = (old as { name: string }).name
          const [first = '', last = ''] = name.split(' ')
          return { first, last }
        },
      },
    )
    expect(migrated).toEqual({ first: 'Ada', last: 'Lovelace' })
  })

  it('treats a legacy (un-enveloped) value as version 0 for migrate', () => {
    const legacy = JSON.stringify({ name: 'Grace Hopper' }) // written before versioning
    const migrated = deserialize(
      legacy,
      { first: '', last: '' },
      {
        version: 1,
        migrate: (old, from) => {
          expect(from).toBe(0)
          const [first = '', last = ''] = (old as { name: string }).name.split(' ')
          return { first, last }
        },
      },
    )
    expect(migrated).toEqual({ first: 'Grace', last: 'Hopper' })
  })

  it('best-effort returns the legacy value when version is set but no migrate given', () => {
    const legacy = JSON.stringify({ a: 1 })
    expect(deserialize(legacy, { a: 0 }, { version: 5 })).toEqual({ a: 1 })
  })

  it('best-effort deserializes an enveloped mismatch when no migrate given', () => {
    const raw = serialize({ a: 9 }, { version: 1 })
    // version bumped to 2, no migrate — falls back to a plain deserialize of inner
    expect(deserialize(raw, { a: 0 }, { version: 2 })).toEqual({ a: 9 })
  })

  it('best-effort uses the custom deserializer on an enveloped mismatch (no migrate)', () => {
    const opts = {
      version: 1,
      serializer: (v: { n: number }) => `N${v.n}`,
      deserializer: (s: string) => ({ n: Number(s.slice(1)) }),
    }
    const raw = serialize({ n: 9 }, opts)
    // bump version, keep the custom (de)serializer, no migrate → deserializer path
    expect(deserialize(raw, { n: 0 }, { ...opts, version: 2 })).toEqual({ n: 9 })
  })

  it('supports a custom serializer inside the envelope', () => {
    const opts = {
      version: 1,
      serializer: (v: { n: number }) => `N${v.n}`,
      deserializer: (s: string) => ({ n: Number(s.slice(1)) }),
    }
    const raw = serialize({ n: 7 }, opts)
    expect(deserialize(raw, { n: 0 }, opts)).toEqual({ n: 7 })
  })

  it('passes the raw persisted inner (loose-parsed) to migrate with a custom serializer', () => {
    const raw = serialize({ n: 7 }, { version: 1, serializer: (v: { n: number }) => `N${v.n}` })
    const migrated = deserialize(
      raw,
      { m: 0 },
      {
        version: 2,
        serializer: (v: { m: number }) => `M${v.m}`,
        migrate: (old) => {
          // custom (non-JSON) inner → loose-parse hands migrate the raw string
          expect(old).toBe('N7')
          return { m: 7 }
        },
      },
    )
    expect(migrated).toEqual({ m: 7 })
  })

  it('routes a corrupt envelope through onError', () => {
    const onError = () => ({ fallback: true })
    expect(deserialize('{not json', { fallback: false }, { version: 1, onError })).toEqual({
      fallback: true,
    })
  })
})

// ─── End-to-end through the hook ─────────────────────────────────────────────

describe('useStorage — version + migrate (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetRegistry()
    _resetStorageListener()
  })
  afterEach(() => {
    localStorage.clear()
    _resetRegistry()
    _resetStorageListener()
  })

  it('persists a versioned envelope on write', () => {
    const s = useStorage('cfg', { theme: 'light' }, { version: 2 })
    s.set({ theme: 'dark' })
    const raw = JSON.parse(localStorage.getItem('cfg')!)
    expect(raw.__pyreonStorageV).toBe(2)
    expect(JSON.parse(raw.__pyreonStorageD)).toEqual({ theme: 'dark' })
  })

  it('migrates a stored older version on read', () => {
    // Simulate a v1 value already on disk.
    localStorage.setItem('profile', serialize({ name: 'Alan Turing' }, { version: 1 }))
    _resetRegistry()
    const s = useStorage(
      'profile',
      { first: '', last: '' },
      {
        version: 2,
        migrate: (old, from) => {
          expect(from).toBe(1)
          const [first = '', last = ''] = (old as { name: string }).name.split(' ')
          return { first, last }
        },
      },
    )
    expect(s()).toEqual({ first: 'Alan', last: 'Turing' })
  })

  it('migrates a legacy (pre-versioning) value as version 0', () => {
    localStorage.setItem('legacy', JSON.stringify(1))
    _resetRegistry()
    const s = useStorage('legacy', 0, {
      version: 1,
      migrate: (old, from) => {
        expect(from).toBe(0)
        return (old as number) * 10
      },
    })
    expect(s()).toBe(10)
  })

  it('session storage supports version + migrate too', () => {
    sessionStorage.setItem('sv', serialize('a', { version: 1 }))
    _resetRegistry()
    const s = useSessionStorage('sv', 'z', {
      version: 2,
      migrate: (old) => `${old as string}-migrated`,
    })
    expect(s()).toBe('a-migrated')
  })
})
