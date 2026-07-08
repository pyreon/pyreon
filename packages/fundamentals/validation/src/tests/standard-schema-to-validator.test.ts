import { describe, expect, it } from 'vitest'
import { isStandardSchema, standardSchemaToValidator } from '../schema'
import type { StandardSchemaLike } from '../types'

// `standardSchemaToValidator` is the bridge that lets any consumer
// (@pyreon/form, @pyreon/store) accept a RAW Standard Schema (zod/valibot/
// arktype/`s`) with no adapter and no cast. It flattens issue paths to
// dot-strings so a nested error routes to its ancestor field downstream.

const emailSchema: StandardSchemaLike<{ email: string }> = {
  '~standard': {
    validate: (v: unknown) => {
      const email = (v as { email?: string }).email
      return email ? { value: v } : { issues: [{ message: 'Email required', path: ['email'] }] }
    },
  },
}

describe('isStandardSchema', () => {
  it('true for a `~standard`-bearing object', () => {
    expect(isStandardSchema(emailSchema)).toBe(true)
  })
  it('false for a plain function / object / null', () => {
    expect(isStandardSchema(() => ({}))).toBe(false)
    expect(isStandardSchema({ foo: 1 })).toBe(false)
    expect(isStandardSchema(null)).toBe(false)
  })
})

describe('standardSchemaToValidator', () => {
  it('returns {} when the schema accepts', async () => {
    const v = standardSchemaToValidator<{ email: string }>(emailSchema)
    expect(await v({ email: 'a@b.com' })).toEqual({})
  })
  it('maps issues to a keyed error record', async () => {
    const v = standardSchemaToValidator<{ email: string }>(emailSchema)
    expect(await v({ email: '' })).toEqual({ email: 'Email required' })
  })
  it('flattens a nested path to a dot-string', async () => {
    const nested: StandardSchemaLike = {
      '~standard': {
        validate: () => ({ issues: [{ message: 'City required', path: ['address', 'city'] }] }),
      },
    }
    const v = standardSchemaToValidator<Record<string, unknown>>(nested)
    expect(await v({})).toEqual({ 'address.city': 'City required' })
  })
  it('handles the object-segment path shape `{ key }`', async () => {
    const s: StandardSchemaLike = {
      '~standard': {
        validate: () => ({ issues: [{ message: 'bad', path: [{ key: 'items' }, { key: 0 }] }] }),
      },
    }
    const v = standardSchemaToValidator<Record<string, unknown>>(s)
    expect(await v({})).toEqual({ 'items.0': 'bad' })
  })
  it('awaits an async Standard Schema', async () => {
    const asyncSchema: StandardSchemaLike = {
      '~standard': {
        validate: async () => ({ issues: [{ message: 'nope', path: ['x'] }] }),
      },
    }
    const v = standardSchemaToValidator<Record<string, unknown>>(asyncSchema)
    expect(await v({})).toEqual({ x: 'nope' })
  })
  it('first message per path wins', async () => {
    const s: StandardSchemaLike = {
      '~standard': {
        validate: () => ({
          issues: [
            { message: 'first', path: ['x'] },
            { message: 'second', path: ['x'] },
          ],
        }),
      },
    }
    const v = standardSchemaToValidator<Record<string, unknown>>(s)
    expect(await v({})).toEqual({ x: 'first' })
  })
})
