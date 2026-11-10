import { effect } from '@pyreon/reactivity'
import { createI18n } from '../create-i18n'
import { localeDirection } from '../direction'

describe('i18n.l() — list formatting', () => {
  it('joins with the locale conjunction (en vs de)', () => {
    expect(createI18n({ locale: 'en' }).l(['Ann', 'Bob', 'Cy'])).toBe('Ann, Bob, and Cy')
    expect(createI18n({ locale: 'de' }).l(['Ann', 'Bob', 'Cy'])).toBe('Ann, Bob und Cy')
  })

  it('accepts Intl.ListFormatOptions and any iterable', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.l(['tea', 'coffee'], { type: 'disjunction' })).toBe('tea or coffee')
    expect(i18n.l(new Set(['a', 'b']))).toBe('a and b')
    expect(i18n.l([])).toBe('')
  })

  it('treats a bare string as ONE item, not a list of characters', () => {
    const i18n = createI18n({ locale: 'en' })
    // `Intl.ListFormat#format('abc')` iterates the string → "a, b, and c".
    expect(i18n.l('abc' as unknown as string[])).toBe('abc')
  })

  it('resolves a named listFormats entry, with fallbackLocale', () => {
    const i18n = createI18n({
      locale: 'de',
      fallbackLocale: 'en',
      listFormats: { en: { or: { type: 'disjunction' } } },
    })
    expect(i18n.l(['Tee', 'Kaffee'], 'or')).toBe('Tee oder Kaffee')
  })

  it('is reactive to locale changes', () => {
    const i18n = createI18n({ locale: 'en' })
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(i18n.l(['a', 'b']))
    })
    i18n.locale.set('fr')
    expect(seen).toEqual(['a and b', 'a et b'])
    fx.dispose()
  })
})

describe('inline {{val, list}} spec', () => {
  const messages = {
    en: {
      and: 'Invited: {{names, list}}',
      or: 'Pick {{opts, list, disjunction}}',
      unit: '{{parts, list, unit, narrow}}',
      named: 'Pick {{opts, orList}}',
    },
  }

  it('formats conjunction, disjunction and unit lists', () => {
    const i18n = createI18n({ locale: 'en', messages })
    expect(i18n.t('and', { names: ['Ann', 'Bob', 'Cy'] })).toBe('Invited: Ann, Bob, and Cy')
    expect(i18n.t('or', { opts: ['red', 'blue'] })).toBe('Pick red or blue')
    expect(i18n.t('unit', { parts: ['5 lb', '12 oz'] })).toBe('5 lb 12 oz')
  })

  it('resolves a configured listFormats name inline', () => {
    const i18n = createI18n({
      locale: 'en',
      messages,
      listFormats: { en: { orList: { type: 'disjunction' } } },
    })
    expect(i18n.t('named', { opts: ['red', 'blue'] })).toBe('Pick red or blue')
  })

  it('coerces items, drops nullish entries, wraps a scalar', () => {
    const i18n = createI18n({ locale: 'en', messages })
    expect(i18n.t('and', { names: [1, null, 'two', undefined, 3] })).toBe('Invited: 1, two, and 3')
    expect(i18n.t('and', { names: 'Ann' })).toBe('Invited: Ann')
    expect(i18n.t('and', { names: null })).toBe('Invited: ')
  })

  it('an invalid list type renders the raw placeholder with a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({ locale: 'en', messages: { en: { bad: '{{x, list, bogus}}' } } })
    expect(i18n.t('bad', { x: ['a', 'b'] })).toBe('{{x, list, bogus}}')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('i18n.dir() / localeDirection()', () => {
  it('detects RTL languages, regional tags and explicit scripts', () => {
    for (const tag of ['ar', 'he', 'fa-IR', 'ur-PK', 'ckb', 'az-Arab', 'yi']) {
      expect(localeDirection(tag), tag).toBe('rtl')
    }
    for (const tag of ['en', 'en-US', 'de', 'ja', 'zh-Hant', 'az', 'ku-Latn']) {
      expect(localeDirection(tag), tag).toBe('ltr')
    }
  })

  it('reads the current locale reactively when called without an argument', () => {
    const i18n = createI18n({ locale: 'en' })
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(i18n.dir())
    })
    i18n.locale.set('ar-EG')
    expect(seen).toEqual(['ltr', 'rtl'])
    expect(i18n.dir('he')).toBe('rtl')
    fx.dispose()
  })

  it('falls back to the language list for a tag Intl.Locale rejects', () => {
    expect(localeDirection('ar_EG')).toBe('rtl')
    expect(localeDirection('not a locale')).toBe('ltr')
  })

  describe('runtimes without getTextInfo()', () => {
    const RealLocale = Intl.Locale
    afterEach(() => {
      ;(Intl as { Locale: typeof Intl.Locale }).Locale = RealLocale
    })
    function stubLocale(extend: (loc: Intl.Locale) => object): void {
      ;(Intl as { Locale: unknown }).Locale = function StubLocale(tag: string) {
        const real = new RealLocale(tag)
        return Object.assign(
          { language: real.language, maximize: () => real.maximize() },
          extend(real),
        )
      }
    }

    it('uses the older textInfo getter', () => {
      stubLocale(() => ({ textInfo: { direction: 'rtl' } }))
      expect(localeDirection('xx')).toBe('rtl')
    })

    it('uses the likely script from maximize()', () => {
      stubLocale(() => ({}))
      expect(localeDirection('ar')).toBe('rtl')
      expect(localeDirection('en')).toBe('ltr')
    })

    it('uses the language list when maximize() yields no script', () => {
      stubLocale((real) => ({ maximize: () => ({ script: undefined }), language: real.language }))
      expect(localeDirection('ps')).toBe('rtl')
      expect(localeDirection('en')).toBe('ltr')
    })
  })
})
