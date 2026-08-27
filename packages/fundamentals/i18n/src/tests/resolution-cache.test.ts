import { describe, expect, it } from 'vitest'
import { createI18n } from '../create-i18n'

/**
 * The resolution cache in `lookupKey` memoizes (locale, namespace, keyPath) →
 * resolved string. It is a pure function of the messages, so it MUST be cleared
 * whenever the messages change (`addMessages` / `loadNamespace`). These specs
 * pin that invalidation — the load-bearing case is a key that resolved to a MISS
 * (cached) and then becomes present: without the clear it would return the stale
 * miss forever.
 */
describe('i18n — resolution cache invalidation', () => {
  it('re-resolves a previously-missing key after addMessages (cache cleared)', () => {
    const i18n = createI18n({ locale: 'en', fallbackLocale: 'en', messages: { en: { greeting: 'Hello' } } })
    expect(i18n.t('greeting')).toBe('Hello') // resolves + caches
    const before = i18n.t('farewell') // missing → fallback, caches the miss
    expect(before).not.toBe('Goodbye')
    i18n.addMessages('en', { farewell: 'Goodbye' })
    expect(i18n.t('farewell')).toBe('Goodbye') // load-bearing: stale miss without clear()
  })

  it('returns the updated value after addMessages overrides an existing key', () => {
    const i18n = createI18n({ locale: 'en', fallbackLocale: 'en', messages: { en: { greeting: 'Hello' } } })
    expect(i18n.t('greeting')).toBe('Hello') // caches 'Hello'
    i18n.addMessages('en', { greeting: 'Hi' })
    expect(i18n.t('greeting')).toBe('Hi') // load-bearing: cached 'Hello' without clear()
  })

  it('a repeated lookup is stable (cache hit returns the same value)', () => {
    const i18n = createI18n({ locale: 'en', fallbackLocale: 'en', messages: { en: { greeting: 'Hello', nested: { deep: 'D' } } } })
    expect(i18n.t('greeting')).toBe('Hello')
    expect(i18n.t('greeting')).toBe('Hello')
    expect(i18n.t('nested.deep')).toBe('D')
    expect(i18n.t('nested.deep')).toBe('D')
  })
})
