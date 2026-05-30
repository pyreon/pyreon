import { describe, expect, it } from 'vitest'
import { validateRuleOptions } from '../utils/validate-options'
import type { Rule } from '../types'

const mkRule = (schema?: Record<string, string>): Rule =>
  ({
    meta: {
      id: 'test/example',
      category: 'architecture',
      description: 'x',
      severity: 'warn',
      fixable: false,
      ...(schema && { schema }),
    },
    create() {
      return {}
    },
  }) as unknown as Rule

describe('validateRuleOptions', () => {
  it('returns empty errors/warnings when rule has no schema', () => {
    const r = mkRule()
    const v = validateRuleOptions(r, { foo: 'bar' })
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
  })

  it('warns on unknown option keys', () => {
    const r = mkRule({ knownKey: 'string' })
    const v = validateRuleOptions(r, { unknownKey: 'value' })
    expect(v.warnings.length).toBe(1)
    expect(v.warnings[0]).toContain('unknown option "unknownKey"')
  })

  it('errors on type mismatch — string', () => {
    const r = mkRule({ path: 'string' })
    const v = validateRuleOptions(r, { path: 42 })
    expect(v.errors.length).toBe(1)
    expect(v.errors[0]).toContain('must be string')
  })

  it('errors on type mismatch — string[]', () => {
    const r = mkRule({ paths: 'string[]' })
    const v = validateRuleOptions(r, { paths: 'not-array' })
    expect(v.errors.length).toBe(1)
    expect(v.errors[0]).toContain('must be string[]')
  })

  it('accepts a valid string[] array', () => {
    const r = mkRule({ paths: 'string[]' })
    const v = validateRuleOptions(r, { paths: ['a', 'b'] })
    expect(v.errors).toEqual([])
  })

  it('errors on string[] containing non-strings', () => {
    const r = mkRule({ paths: 'string[]' })
    const v = validateRuleOptions(r, { paths: ['ok', 42] })
    expect(v.errors.length).toBe(1)
  })

  it('errors on type mismatch — number (with Number.isFinite check)', () => {
    const r = mkRule({ size: 'number' })
    const v = validateRuleOptions(r, { size: 'big' })
    expect(v.errors.length).toBe(1)
  })

  it('errors on NaN / Infinity for number type (isFinite branch)', () => {
    const r = mkRule({ size: 'number' })
    expect(validateRuleOptions(r, { size: NaN }).errors.length).toBe(1)
    expect(validateRuleOptions(r, { size: Infinity }).errors.length).toBe(1)
  })

  it('accepts a valid number', () => {
    const r = mkRule({ size: 'number' })
    expect(validateRuleOptions(r, { size: 42 }).errors).toEqual([])
  })

  it('errors on type mismatch — boolean', () => {
    const r = mkRule({ strict: 'boolean' })
    const v = validateRuleOptions(r, { strict: 'yes' })
    expect(v.errors.length).toBe(1)
  })

  it('accepts a valid boolean', () => {
    const r = mkRule({ strict: 'boolean' })
    expect(validateRuleOptions(r, { strict: true }).errors).toEqual([])
  })

  it('describe() handles null', () => {
    const r = mkRule({ path: 'string' })
    const v = validateRuleOptions(r, { path: null as unknown })
    expect(v.errors[0]).toContain('null')
  })

  it('describe() handles arrays — labels element types', () => {
    const r = mkRule({ paths: 'string' })
    const v = validateRuleOptions(r, { paths: [1, 'a', null] })
    expect(v.errors[0]).toContain('Array<')
  })
})
