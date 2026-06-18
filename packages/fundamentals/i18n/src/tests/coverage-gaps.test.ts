// Normal-mode (__DEV__ true) coverage: install the perf-counter sink so the
// `?.()` call-side of every `if (NODE_ENV !== 'production') __pyreon_count__?.()`
// gate runs, plus the deep-merge proto guard.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../create-i18n'

beforeAll(() => {
  ;(globalThis as { __pyreon_count__?: (n: string) => void }).__pyreon_count__ = () => {}
})
afterAll(() => {
  delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
})

describe('i18n — perf-counter sink call-sides + deep-merge proto guard', () => {
  it('exercises t / lookup / fallback / namespaceLoad with the counter installed', async () => {
    const i18n = createI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: {
        en: { hello: 'Hi {{name}}', items_one: 'one', items_other: 'many' },
        de: {},
      },
      loader: async () => ({ loaded: 'value' }),
    })
    expect(i18n.t('hello', { name: 'x' })).toBe('Hi x')
    i18n.t('totally.missing.key') // fallback lookup path
    i18n.t('items', { count: 1 }) // plural
    await i18n.loadNamespace('auth') // namespaceLoad counter
  })

  it('addMessages ignores prototype-polluting keys (deep-merge proto guard)', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { a: '1' } } })
    // keys __proto__/constructor/prototype are skipped by deepMerge
    i18n.addMessages('en', JSON.parse('{"__proto__":{"polluted":true},"safe":"ok"}'))
    expect(i18n.t('safe')).toBe('ok')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
