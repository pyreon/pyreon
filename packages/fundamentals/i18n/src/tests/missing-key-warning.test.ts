import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../create-i18n'

// A missing key renders the key itself. That used to happen silently, so the
// app-showcase Shop (which wrote `t('shop:title')` for a key registered as
// `shop.title` in the default namespace) rendered raw keys with no signal.
// Dev now warns once per (locale, key), with a hint for that exact mistake.

const warnings = () => {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  return () => spy.mock.calls.map((c) => String(c[0]))
}
afterEach(() => vi.restoreAllMocks())

describe('i18n — dev warning for a missing key', () => {
  it('ns:key for a key registered as ns.key: warns once and names the right key', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', messages: { en: { shop: { title: 'Store' } } } })
    expect(i18n.t('shop:title')).toBe('shop:title')
    expect(i18n.t('shop:title')).toBe('shop:title')
    expect(i18n.t('shop.title')).toBe('Store')
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toContain('missing translation "shop:title" for locale "en"')
    expect(calls()[0]).toContain('did you mean t("shop.title")?')
  })

  it('an unregistered namespace says how to register it', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', messages: { en: { a: 'A' } } })
    i18n.t('auth:login')
    expect(calls()[0]).toContain('Namespace "auth" has no messages for "en"')
  })

  it('a missing key in the default namespace warns without a namespace hint', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', messages: { en: { a: 'A' } } })
    i18n.t('b')
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).not.toContain('Namespace')
    // the same key in another locale is a separate warning
    i18n.locale.set('de')
    i18n.t('b')
    expect(calls()).toHaveLength(2)
  })

  it('stays quiet while a loader has not loaded the namespace yet', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', loader: async () => ({ x: 'X' }) })
    i18n.t('lazy:x')
    expect(calls()).toHaveLength(0)
  })

  it('stays quiet when onMissingKey handles it', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', messages: { en: {} }, onMissingKey: () => '—' })
    expect(i18n.t('nope')).toBe('—')
    expect(calls()).toHaveLength(0)
  })

  it('is bounded: at most 200 distinct warnings per instance', () => {
    const calls = warnings()
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    for (let i = 0; i < 250; i++) i18n.t(`k${i}`)
    expect(calls()).toHaveLength(200)
  })
})
