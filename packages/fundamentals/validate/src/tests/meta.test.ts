/**
 * Tests for `withField` + `getMeta` + `resolveMetaField`.
 *
 * Exercises against all three native StdSchema implementations (Zod,
 * Valibot, ArkType) so any future divergence in the protocol surface
 * surfaces here.
 */

import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { getMeta, resolveMetaField, withField } from '../meta'
import { META_SLOT } from '../types'

describe('withField + getMeta — Zod', () => {
  it('attaches metadata visible via getMeta', () => {
    const schema = z.string().email()
    const wrapped = withField(schema, { label: 'Email' })
    expect(getMeta(wrapped)).toEqual({ label: 'Email' })
  })

  it('preserves the original schema\'s `.parse()` semantics', () => {
    const schema = z.string().email()
    const wrapped = withField(schema, { label: 'Email' })
    expect(wrapped.parse('foo@bar.com')).toBe('foo@bar.com')
    expect(() => wrapped.parse('not-an-email')).toThrow()
  })

  it('preserves the original `~standard.validate` shape', () => {
    const schema = z.string().min(3)
    const wrapped = withField(schema, { label: 'Name' })
    const result = wrapped['~standard'].validate('ab')
    expect(result).toMatchObject({
      issues: expect.arrayContaining([expect.objectContaining({ message: expect.any(String) })]),
    })
  })

  it('returns a NEW schema and leaves the input untouched', () => {
    // withField used to mutate the input in place, so two labels on one shared
    // base clobbered each other and a frozen schema threw. A foreign schema is
    // now wrapped in a transparent Proxy (callable-safe for ArkType).
    const schema = z.string()
    const wrapped = withField(schema, { label: 'Name' })
    expect(wrapped).not.toBe(schema)
    expect(getMeta(wrapped)).toEqual({ label: 'Name' })
    expect(getMeta(schema)).toBeUndefined()
    expect(wrapped.safeParse('x').success).toBe(true)
  })

  it('merges metadata when re-wrapping', () => {
    const base = withField(z.string(), { label: 'Email', i18nLabel: 'auth.email.label' })
    const enriched = withField(base, { autoFocus: true, placeholder: 'you@example.com' })
    expect(getMeta(enriched)).toEqual({
      label: 'Email',
      i18nLabel: 'auth.email.label',
      autoFocus: true,
      placeholder: 'you@example.com',
    })
  })

  it('later keys win on collision when merging', () => {
    const base = withField(z.string(), { label: 'Email' })
    const overridden = withField(base, { label: 'Email Address' })
    expect(getMeta(overridden)?.label).toBe('Email Address')
  })

  it('metadata is invisible to key enumeration and JSON', () => {
    const base = v.pipe(v.string(), v.email())
    const wrapped = withField(base, { label: 'Email' })
    expect(Object.keys(wrapped)).toEqual(Object.keys(base))
    expect(Reflect.ownKeys(wrapped)).not.toContain(META_SLOT)
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(base))
  })
})

describe('withField + getMeta — Valibot', () => {
  it('attaches metadata visible via getMeta', () => {
    const schema = v.pipe(v.string(), v.email())
    const wrapped = withField(schema, { label: 'Email' })
    expect(getMeta(wrapped)).toEqual({ label: 'Email' })
  })

  it('preserves the original `~standard.validate` shape', () => {
    const schema = v.pipe(v.string(), v.email())
    const wrapped = withField(schema, { label: 'Email' })
    expect(wrapped['~standard'].validate('foo@bar.com')).toMatchObject({ value: 'foo@bar.com' })
  })
})

describe('withField + getMeta — ArkType', () => {
  it('attaches metadata visible via getMeta', () => {
    const schema = type('string.email')
    const wrapped = withField(schema, { label: 'Email' })
    expect(getMeta(wrapped)).toEqual({ label: 'Email' })
  })

  it('preserves the original `~standard.validate` shape', () => {
    const schema = type('string.email')
    const wrapped = withField(schema, { label: 'Email' })
    const result = wrapped['~standard'].validate('foo@bar.com')
    // ArkType's Standard Schema impl returns { value } on success.
    expect(result).toMatchObject({ value: 'foo@bar.com' })
  })
})

describe('getMeta defensive paths', () => {
  it('returns undefined for an unwrapped schema', () => {
    expect(getMeta(z.string())).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(getMeta(null as never)).toBeUndefined()
  })

  it('returns undefined for a primitive', () => {
    expect(getMeta('not a schema' as never)).toBeUndefined()
  })
})

describe('resolveMetaField', () => {
  const schema = withField(z.string(), {
    label: 'Email',
    hint: 'We never share this',
    placeholder: 'you@example.com',
    i18nLabel: 'auth.email.label',
    i18nHint: 'auth.email.hint',
    i18nPlaceholder: 'auth.email.placeholder',
  })

  it('returns the literal when no t is provided', () => {
    expect(resolveMetaField(schema, 'label')).toBe('Email')
    expect(resolveMetaField(schema, 'hint')).toBe('We never share this')
    expect(resolveMetaField(schema, 'placeholder')).toBe('you@example.com')
  })

  it('returns the i18n-resolved value when t resolves the key', () => {
    const t = (key: string) => (key === 'auth.email.label' ? 'Adresse e-mail' : key)
    expect(resolveMetaField(schema, 'label', t)).toBe('Adresse e-mail')
  })

  it('falls back to the literal when t echoes the key (no translation)', () => {
    const t = (key: string) => key // echoes — no translation present
    expect(resolveMetaField(schema, 'label', t)).toBe('Email')
  })

  it('falls back to the literal when meta has no i18n key', () => {
    const schema2 = withField(z.string(), { label: 'Just Label' })
    const t = (k: string) => `translated-${k}`
    expect(resolveMetaField(schema2, 'label', t)).toBe('Just Label')
  })

  it('returns undefined when neither i18n nor literal is set', () => {
    const schema3 = withField(z.string(), { label: 'L' })
    expect(resolveMetaField(schema3, 'hint')).toBeUndefined()
  })

  it('returns undefined for an unwrapped schema', () => {
    expect(resolveMetaField(z.string(), 'label')).toBeUndefined()
  })
})

describe('cross-library type inference', () => {
  it('Zod: wrapped schema type-infers as the original', () => {
    const schema = z.string()
    const wrapped = withField(schema, { label: 'X' })
    // Type-level only: the wrapped schema should still be assignable
    // to the original's type (passthrough generic).
    const _typecheck: typeof schema = wrapped
    expect(_typecheck).toBeDefined()
  })

  it('Valibot: wrapped schema type-infers as the original', () => {
    const schema = v.pipe(v.string(), v.email())
    const wrapped = withField(schema, { label: 'X' })
    const _typecheck: typeof schema = wrapped
    expect(_typecheck).toBeDefined()
  })
})
