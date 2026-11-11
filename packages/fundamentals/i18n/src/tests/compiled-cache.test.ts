/**
 * The compiled-message cache in `createI18n`: every message is resolved and
 * pre-split once per (active locale, key, plural/context variant), and `t()`
 * renders the cached form. These tests pin the invariants that cache must keep
 * — it may never return a stale, wrong-variant or wrong-locale result, and its
 * bounds must not change results.
 */
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from '../create-i18n'
import { interpolate } from '../interpolation'

describe('i18n compiled cache — rendering', () => {
  // [template, expected with `values`] — the semantics of the regex-based
  // interpolate() this cache replaced on the t() path.
  const cases: [string, string][] = [
    ['plain text', 'plain text'],
    ['Hello {{name}}!', 'Hello Ada!'],
    ['Hello {{ name }}!', 'Hello Ada!'],
    ['{{name}}{{name}}', 'AdaAda'],
    ['a {{not a key}} b {{name}}', 'a {{not a key}} b Ada'],
    ['{{{name}}}', '{Ada}'],
    ['{{name,}} empty spec', 'Ada empty spec'],
    ['{{toString}} inherited', '{{toString}} inherited'],
    ['{{missing}} stays', '{{missing}} stays'],
    ['{{undef}} undefined value', '{{undef}} undefined value'],
    ['{{obj}} object', '{"a":1} object'],
    ['{{name, unknownSpec}}', 'Ada'],
  ]
  const values = { name: 'Ada', undef: undefined, obj: { a: 1 } }

  for (const [tpl, want] of cases) {
    it(`renders ${JSON.stringify(tpl)}`, () => {
      const i18n = createI18n({ locale: 'en', messages: { en: { k: tpl } } })
      // Twice: the first call compiles, the second renders from the cache.
      expect(i18n.t('k', values)).toBe(want)
      expect(i18n.t('k', values)).toBe(want)
      // The public interpolate() agrees.
      expect(interpolate(tpl, values, { format: (v) => String(v) })).toBe(want)
      // No values → the raw template, also from the cache.
      expect(i18n.t('k')).toBe(tpl)
    })
  }
})

describe('i18n compiled cache — variants never bleed', () => {
  it('one key served alternately with different counts, zero and context', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          items: 'one item',
          items_other: '{{count}} items',
          items_zero: 'no items',
          items_male: 'his item',
          items_male_other: 'his {{count}} items',
        },
      },
    })
    for (let round = 0; round < 3; round++) {
      expect(i18n.t('items', { count: 1 })).toBe('one item')
      expect(i18n.t('items', { count: 5 })).toBe('5 items')
      expect(i18n.t('items', { count: 0 })).toBe('no items')
      expect(i18n.t('items')).toBe('one item')
      expect(i18n.t('items', { context: 'male', count: 1 })).toBe('his item')
      expect(i18n.t('items', { context: 'male', count: 7 })).toBe('his 7 items')
      expect(i18n.t('items', { context: 'male' })).toBe('his item')
    }
  })

  it('keys named like Object.prototype members are plain cache keys', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { toString: 'TS', valueOf: 'VO' } } })
    for (let round = 0; round < 2; round++) {
      expect(i18n.t('toString')).toBe('TS')
      expect(i18n.t('valueOf')).toBe('VO')
      expect(i18n.t('__proto__')).toBe('__proto__')
      expect(i18n.t('constructor')).toBe('constructor')
      expect(i18n.t('hasOwnProperty')).toBe('hasOwnProperty')
    }
  })

  it('a namespaced key and a same-named default-namespace key stay distinct', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { title: 'Common' } } })
    i18n.addMessages('en', { title: 'Admin' }, 'admin')
    expect(i18n.t('title')).toBe('Common')
    expect(i18n.t('admin:title')).toBe('Admin')
    expect(i18n.t('title')).toBe('Common')
  })

  it('stays correct past the variant bound (many contexts on one key)', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { k: 'base', k_c5: 'five' } } })
    for (let round = 0; round < 2; round++) {
      for (let c = 0; c < 100; c++) {
        expect(i18n.t('k', { context: `c${c}` })).toBe(c === 5 ? 'five' : 'base')
      }
    }
  })
})

describe('i18n compiled cache — invalidation and locale', () => {
  it('a cached message is recompiled after addMessages changes it', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { k: 'Hi {{name}}' } } })
    expect(i18n.t('k', { name: 'Ada' })).toBe('Hi Ada')
    i18n.addMessages('en', { k: 'Bye {{name}}' })
    expect(i18n.t('k', { name: 'Ada' })).toBe('Bye Ada')
  })

  it('a cached MISS is re-resolved after loadNamespace adds the key', async () => {
    const i18n = createI18n({
      locale: 'en',
      loader: async () => ({ k: 'loaded' }),
    })
    expect(i18n.t('auth:k')).toBe('auth:k')
    await i18n.loadNamespace('auth')
    expect(i18n.t('auth:k')).toBe('loaded')
  })

  it('switching locale back and forth serves each locale its own compiled message', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { k: 'Hi {{name}}' }, de: { k: 'Hallo {{name}}' } },
    })
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(i18n.t('k', { name: 'Ada' }))
    })
    i18n.locale.set('de')
    i18n.locale.set('en')
    i18n.locale.set('de')
    expect(seen).toEqual(['Hi Ada', 'Hallo Ada', 'Hi Ada', 'Hallo Ada'])
    fx.dispose()
  })

  it('stays correct past the per-locale and per-generation bounds', () => {
    const en: Record<string, string> = {}
    for (let i = 0; i < 2500; i++) en[`k${i}`] = `v${i}`
    const messages: Record<string, Record<string, string>> = { en }
    for (let l = 0; l < 12; l++) messages[`x${l}`] = { k0: `x${l}` }
    const i18n = createI18n({ locale: 'en', fallbackLocale: 'en', messages })
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 2500; i++) expect(i18n.t(`k${i}`)).toBe(`v${i}`)
    }
    for (let round = 0; round < 2; round++) {
      for (let l = 0; l < 12; l++) {
        i18n.locale.set(`x${l}`)
        expect(i18n.t('k0')).toBe(`x${l}`)
        expect(i18n.t('k1')).toBe('v1') // from the fallback locale
      }
    }
  })
})

describe('i18n compiled cache — per-call semantics are not cached', () => {
  it('onMissingKey runs on every miss, not only the first', () => {
    const onMissingKey = vi.fn(() => 'custom')
    const i18n = createI18n({ locale: 'en', messages: { en: {} }, onMissingKey })
    i18n.t('nope')
    i18n.t('nope')
    expect(onMissingKey).toHaveBeenCalledTimes(2)
  })

  it('defaultValue is per call, even for a cached miss', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    expect(i18n.t('nope', { defaultValue: 'A {{x}}', x: 1 })).toBe('A 1')
    expect(i18n.t('nope', { defaultValue: 'B {{x}}', x: 2 })).toBe('B 2')
    expect(i18n.t('nope')).toBe('nope')
  })

  it('a custom formatter is called per render (its output is not cached)', () => {
    let n = 0
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { k: 'n={{v, tick}}' } },
      formats: { tick: () => String(++n) },
    })
    expect(i18n.t('k', { v: 0 })).toBe('n=1')
    expect(i18n.t('k', { v: 0 })).toBe('n=2')
  })
})

describe('i18n formatter registry', () => {
  it('number / date formatters stay correct across many locales and option sets', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    const tags = ['en', 'de', 'fr', 'cs', 'ja']
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 100; i++) {
        const tag = tags[i % tags.length] as string
        const want = new Intl.NumberFormat(tag, { minimumFractionDigits: i % 7 }).format(1234.5)
        i18n.locale.set(tag)
        expect(i18n.n(1234.5, { minimumFractionDigits: i % 7 })).toBe(want)
        expect(i18n.n(1234.5)).toBe(new Intl.NumberFormat(tag).format(1234.5))
      }
    }
  })
})
