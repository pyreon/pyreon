/**
 * The bounded caches added for the compiled `t()` path and the `Intl`
 * formatter tables: eviction, generation promotion and locale caps must never
 * change a result, and the nested `$t()` path (which still interpolates
 * through the inline-format callback) must keep formatting.
 */
import { describe, expect, it } from 'vitest'
import { createI18n } from '../create-i18n'

/** 70 distinct, well-formed `en-XX` locale tags (more than every locale cap). */
const LOCALES = Array.from(
  { length: 70 },
  (_, i) =>
    `en-${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`,
)

describe('i18n — nested $t() with inline format specs', () => {
  it('formats the outer template segments around a nested result', () => {
    const i18n = createI18n({
      locale: 'en',
      numberFormats: { en: { currency: { style: 'currency', currency: 'USD' } } },
      messages: { en: { unit: 'pts', total: '{{n, number}} $t(unit) / {{amount, currency}}' } },
    })
    expect(i18n.t('total', { n: 1234.5, amount: 9.99 })).toBe('1,234.5 pts / $9.99')
    // Second call: the formatter tables answer from their cache.
    expect(i18n.t('total', { n: 1234.5, amount: 9.99 })).toBe('1,234.5 pts / $9.99')
  })
})

describe('i18n — formatter table bounds', () => {
  it('reuses a named number format and stays correct past the options cap', () => {
    const i18n = createI18n({
      locale: 'en',
      numberFormats: { en: { price: { style: 'currency', currency: 'USD' } } },
      messages: { en: {} },
    })
    expect(i18n.n(5, 'price')).toBe('$5.00')
    expect(i18n.n(6, 'price')).toBe('$6.00')
    for (let i = 0; i < 70; i++) {
      const opts: Intl.NumberFormatOptions = {
        minimumIntegerDigits: 1 + Math.floor(i / 21),
        minimumFractionDigits: i % 21,
        maximumFractionDigits: 20,
      }
      expect(i18n.n(1.5, opts)).toBe(new Intl.NumberFormat('en', opts).format(1.5))
    }
  })

  it('stays correct when more locales are used than the per-locale table cap', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    for (const loc of [...LOCALES, ...LOCALES]) {
      i18n.locale.set(loc)
      expect(i18n.n(1234.5)).toBe(new Intl.NumberFormat(loc).format(1234.5))
    }
  })
})

describe('i18n — key resolution edges', () => {
  const i18n = createI18n({
    locale: 'en',
    messages: { en: { leaf: 'Leaf', section: { title: 'Title {{n}}' } } },
  })

  it('treats a path that walks through a string leaf as missing', () => {
    expect(i18n.t('leaf.deeper')).toBe('leaf.deeper')
  })

  it('treats a path that ends on a nested object as missing', () => {
    expect(i18n.t('section')).toBe('section')
  })

  it('leaves the compiled fast path for count / context values and still renders', () => {
    // Compile + cache the plain form first, then call with count and context.
    expect(i18n.t('section.title', { n: 1 })).toBe('Title 1')
    expect(i18n.t('section.title', { n: 2, count: 2 })).toBe('Title 2')
    expect(i18n.t('section.title', { n: 3, context: 'male' })).toBe('Title 3')
  })
})

describe('i18n — compiled message cache bounds', () => {
  it('evicts per-locale compiled caches and fallback chains without changing results', () => {
    const i18n = createI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: { hi: 'Hi {{name}}' } },
    })
    for (const loc of [...LOCALES, ...LOCALES]) {
      i18n.locale.set(loc)
      expect(i18n.t('hi', { name: loc })).toBe(`Hi ${loc}`)
    }
  })

  it('promotes an entry from the old generation and keeps its result', () => {
    const messages: Record<string, string> = {}
    for (let i = 0; i < 1200; i++) messages[`k${i}`] = `v${i} {{x}}`
    const i18n = createI18n({ locale: 'en', messages: { en: messages } })
    for (let i = 0; i < 1200; i++) expect(i18n.t(`k${i}`, { x: i })).toBe(`v${i} ${i}`)
    // k0..k999 rolled into the old generation; reading one promotes it.
    expect(i18n.t('k5', { x: 'a' })).toBe('v5 a')
    expect(i18n.t('k5', { x: 'b' })).toBe('v5 b')
  })
})
