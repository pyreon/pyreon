// toFormValidator — adapt an `s` schema into a @pyreon/form `schema` validator.
import { describe, expect, it } from 'vitest'
import { toFormValidator } from '../format'
import { s } from '../v1'

const schema = s.object({
  email: s.string().email(),
  age: s.number().int().min(18),
})

describe('toFormValidator', () => {
  const validate = toFormValidator(schema)

  it('returns {} for valid values', () => {
    expect(validate({ email: 'a@b.co', age: 21 })).toEqual({})
  })

  it('maps each failing field to its error message', () => {
    const errors = validate({ email: 'nope', age: 5 })
    expect(Object.keys(errors).sort()).toEqual(['age', 'email'])
    expect(errors.email).toBeTruthy()
    expect(errors.age).toBeTruthy()
  })

  it('only reports the fields that actually fail', () => {
    const errors = validate({ email: 'a@b.co', age: 5 })
    expect(errors).toEqual({ age: errors.age })
    expect(errors.email).toBeUndefined()
  })

  it('routes messages through the i18n t when keys resolve', () => {
    // formatErrorsByPath uses formatError(issue, t); Pyreon issues carry a `key`.
    const t = (key: string) => (key === 'validate.string.email' ? 'Bad email!' : key)
    const errors = toFormValidator(schema, t)({ email: 'nope', age: 21 })
    expect(errors.email).toBe('Bad email!')
  })

  it('produces a shape assignable to form\'s SchemaValidateFn return', () => {
    // The form expects Partial<Record<keyof TValues, string | undefined>>;
    // Record<string,string> is assignable. Smoke the structural contract.
    const out: Partial<Record<'email' | 'age', string | undefined>> = validate({ email: 'x', age: 1 })
    expect(typeof out).toBe('object')
  })
})
