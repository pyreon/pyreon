/**
 * Compile-time type tests for the `@pyreon/i18n` typed-key helpers
 * (`MessageKeys` / `TranslationParams` / `TypedTranslationKey`) and the
 * opt-in typed `createI18n<typeof en>()` pattern.
 *
 * Recursion-cap contract: `MessageKeys` is depth-capped at 6 nesting levels
 * — the 5-level + wide fixtures below are the "realistic inputs must not
 * blow TS instantiation limits" locks required by the type-helpers audit.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  I18nInstance,
  InterpolationValue,
  InterpolationValues,
  MessageKeys,
  TranslationDictionary,
  TranslationParams,
  TypedTranslationKey,
} from '../index'
import { createI18n } from '../index'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const en = {
  greeting: 'Hello {{name}}',
  total: 'Total {{amount, currency}}',
  plain: 'No params here',
  items_one: '{{count}} item',
  items_other: '{{count}} items',
  nav: {
    home: 'Home',
    about: 'About',
  },
  deep: { l2: { l3: { l4: { l5: 'five levels down' } } } },
} as const

// A WIDE object (many siblings) — instantiation-cost lock.
const wide = {
  a1: 'x', a2: 'x', a3: 'x', a4: 'x', a5: 'x', a6: 'x', a7: 'x', a8: 'x',
  a9: 'x', a10: 'x', a11: 'x', a12: 'x', a13: 'x', a14: 'x', a15: 'x',
  g1: { b1: 'x', b2: 'x', b3: 'x', b4: 'x', b5: 'x' },
  g2: { c1: 'x', c2: 'x', c3: 'x', c4: 'x', c5: 'x' },
} as const

describe('MessageKeys — dot-path union with plural collapsing', () => {
  it('derives flat, nested, and deep keys', () => {
    type Keys = MessageKeys<typeof en>
    expectTypeOf<'greeting'>().toExtend<Keys>()
    expectTypeOf<'nav.home'>().toExtend<Keys>()
    expectTypeOf<'nav.about'>().toExtend<Keys>()
    expectTypeOf<'deep.l2.l3.l4.l5'>().toExtend<Keys>() // 5 levels — inside the 6-level cap
  })

  it('collapses plural suffixes to the base key', () => {
    type Keys = MessageKeys<typeof en>
    expectTypeOf<'items'>().toExtend<Keys>()
    // The raw suffixed keys are deliberately NOT in the union — you call
    // t('items', { count }) and the runtime picks the plural form.
    expectTypeOf<Extract<Keys, 'items_one' | 'items_other'>>().toEqualTypeOf<never>()
  })

  it('rejects typos (negative)', () => {
    type Keys = MessageKeys<typeof en>
    expectTypeOf<Extract<Keys, 'nav.hoem'>>().toEqualTypeOf<never>()
    const takesKey = (_k: Keys) => {}
    // @ts-expect-error — mistyped key is not in the union
    takesKey('nav.hoem')
  })

  it('handles a WIDE messages object (instantiation-cost lock)', () => {
    type Keys = MessageKeys<typeof wide>
    expectTypeOf<'a15'>().toExtend<Keys>()
    expectTypeOf<'g1.b5'>().toExtend<Keys>()
    expectTypeOf<'g2.c1'>().toExtend<Keys>()
  })

  it('degrades to string over a non-literal TranslationDictionary', () => {
    expectTypeOf<MessageKeys<TranslationDictionary>>().toEqualTypeOf<string>()
  })
})

describe('TranslationParams — {{param}} extraction', () => {
  it('extracts plain params', () => {
    expectTypeOf<TranslationParams<typeof en, 'greeting'>>().toEqualTypeOf<{
      name: InterpolationValue
    }>()
  })

  it('inline format specs contribute the NAME before the comma', () => {
    expectTypeOf<TranslationParams<typeof en, 'total'>>().toEqualTypeOf<{
      amount: InterpolationValue
    }>()
  })

  it('a param-less message yields an empty record', () => {
    expectTypeOf<keyof TranslationParams<typeof en, 'plain'>>().toEqualTypeOf<never>()
  })

  it('plural keys resolve through the suffix and require count: number', () => {
    type P = TranslationParams<typeof en, 'items'>
    expectTypeOf<P['count']>().toEqualTypeOf<number>()
  })

  it('nested dot-path keys resolve to their leaf message', () => {
    type P = TranslationParams<typeof en, 'nav.home'>
    expectTypeOf<keyof P>().toEqualTypeOf<never>()
  })

  it('degrades to InterpolationValues for unknown keys / non-literal values', () => {
    expectTypeOf<TranslationParams<typeof en, 'missing.key'>>().toEqualTypeOf<InterpolationValues>()
    expectTypeOf<
      TranslationParams<TranslationDictionary, 'anything'>
    >().toEqualTypeOf<InterpolationValues>()
  })
})

describe('createI18n<typeof en> — opt-in typed instance (additive)', () => {
  it('typed t accepts derived keys + namespaced strings, rejects typos', () => {
    const i18n = createI18n<typeof en>({ locale: 'en', messages: { en } })
    i18n.t('greeting', { name: 'Ada' })
    i18n.t('nav.home')
    i18n.t('items', { count: 2 })
    i18n.t('auth:errors.invalid') // namespaced keys stay unchecked (runtime-loaded)
    // @ts-expect-error — typo is a compile error on the typed instance
    i18n.t('nav.hoem')
    expect(i18n.t('nav.home')).toBe('Home')
  })

  it('untyped createI18n is unchanged (key stays string)', () => {
    const i18n = createI18n({ locale: 'en', messages: { en } })
    expectTypeOf(i18n).toEqualTypeOf<I18nInstance>()
    i18n.t('anything.goes')
    expect(i18n.t('nav.about')).toBe('About')
  })

  it('a typed instance is assignable where I18nInstance is expected (Provider contract)', () => {
    const typed = createI18n<typeof en>({ locale: 'en', messages: { en } })
    const untypedView: I18nInstance = typed // method-style t → bivariant → OK
    expect(untypedView.t('greeting', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('TypedTranslationKey degrades to string for index-signature messages', () => {
    expectTypeOf<TypedTranslationKey<TranslationDictionary>>().toEqualTypeOf<string>()
  })
})
