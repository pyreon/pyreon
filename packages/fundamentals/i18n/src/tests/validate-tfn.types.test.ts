/**
 * #4822 — `TFn` accepts `@pyreon/i18n`'s `t` directly. Its `values` parameter
 * is `InterpolationValues`, narrower than the old `Record<string, unknown>`,
 * so under `strictFunctionTypes` the plain function type refused it (TS2345)
 * and every app needed a cast wrapper. These are compile-time assertions:
 * `tsc --noEmit` (the package `typecheck`) fails if any line regresses; the
 * runtime bodies also run under vitest. Lives in @pyreon/i18n (which takes
 * @pyreon/validate as a devDependency) rather than the other way round: a
 * devDependency of validate would be walked by `pyreon-native wire` and add
 * i18n's Swift/Kotlin sources to every native app that uses validate.
 */
import {
  formatError,
  formatErrors,
  formatErrorsByPath,
  resolveMetaField,
  s,
  type TFn,
  toFormValidator,
} from '@pyreon/validate'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createI18n } from '../create-i18n'

const messages = { en: { v: { email: 'Type an e-mail address' } } }

describe('TFn accepts @pyreon/i18n t', () => {
  it('an untyped instance t is assignable to TFn', () => {
    const i18n = createI18n({ locale: 'en', messages })
    expectTypeOf(i18n.t).toExtend<TFn>()
    const schema = s.object({ email: s.string().email({ key: 'v.email' }) })
    const r = schema.parse({ email: 'x' })
    if (!r.ok) {
      expect(formatErrorsByPath(r.issues, i18n.t)).toEqual({ email: 'Type an e-mail address' })
      expect(formatErrors(r.issues, i18n.t)).toEqual(['Type an e-mail address'])
      expect(formatError(r.issues[0]!, i18n.t)).toBe('Type an e-mail address')
    } else {
      throw new Error('expected a failing parse')
    }
    expect(toFormValidator(schema, i18n.t)({ email: 'x' })).toEqual({ email: 'Type an e-mail address' })
    expect(resolveMetaField(s.string(), 'label', i18n.t)).toBeUndefined()
  })

  it('a key-typed t (narrow key union, InterpolationValues) is assignable', () => {
    type Keyed = (key: 'v.email' | 'v.min', values?: Record<string, string | number>) => string
    expectTypeOf<Keyed>().toExtend<TFn>()
  })

  it('a function of a different shape is still rejected', () => {
    expectTypeOf<(key: number) => string>().not.toExtend<TFn>()
    expectTypeOf<(key: string) => number>().not.toExtend<TFn>()
    expectTypeOf<(key: string, params: { min: number }, extra: boolean) => string>().not.toExtend<TFn>()
  })
})
