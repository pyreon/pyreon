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
})
