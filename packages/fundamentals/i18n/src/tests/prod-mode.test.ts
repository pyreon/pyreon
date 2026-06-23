// Production-mode coverage: the normal run is NODE_ENV=test (the
// `if (NODE_ENV !== 'production')` perf-counter gates take their TRUE side).
// This file flips NODE_ENV to production BEFORE the module loads so the
// FALSE (production) side of each gate is exercised.
import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('NODE_ENV', 'production')
const { createI18n } = await import('../create-i18n')

describe('i18n — production-mode (NODE_ENV=production) gate false-sides', () => {
  it('t / lookup / fallback / namespaceLoad run with dev counters off', async () => {
    const i18n = createI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: {
        en: { hello: 'Hi {{name}}', items_one: 'one', items_other: 'many' },
        de: {},
      },
      loader: async () => ({ loaded: 'value' }),
    })
    expect(i18n.t('hello', { name: 'y' })).toBe('Hi y')
    i18n.t('totally.missing.key')
    i18n.t('items', { count: 2 })
    await i18n.loadNamespace('auth')
  })

  it('formatters + inline formats + error paths run with dev gates off', () => {
    const i18n = createI18n({
      locale: 'en',
      formats: {
        boom: () => {
          throw new Error('x')
        },
      },
      numberFormats: { en: { cur: { style: 'currency', currency: 'USD' } } },
      messages: { en: { price: '{{a, cur}}', bad: '{{v, boom}}', circ: '{{o}}' } },
    })
    // n/d/rt counter gates take their production (false) side.
    expect(i18n.n(1234.5)).toBe('1,234.5')
    expect(i18n.d(new Date('2024-01-15T12:00:00Z'), { year: 'numeric', timeZone: 'UTC' })).toBe('2024')
    expect(i18n.rt(-1, 'day')).toBe('1 day ago')
    expect(i18n.t('price', { a: 9.99 })).toBe('$9.99')
    // Throwing formatter: production → no warn, raw placeholder.
    expect(i18n.t('bad', { v: 'x' })).toBe('{{v, boom}}')
    // Circular value: production → no warn, raw placeholder.
    const circ: Record<string, unknown> = {}
    circ.self = circ
    expect(i18n.t('circ', { o: circ as never })).toBe('{{o}}')
  })

  it('cross-locale fallback runs with the fallback counter gated off', () => {
    const i18n = createI18n({
      locale: 'de',
      fallbackLocale: 'en',
      messages: { en: { only: 'EN' }, de: {} },
    })
    expect(i18n.t('only')).toBe('EN')
  })
})
