import { createI18n } from '../create-i18n'
import { interpolate } from '../interpolation'

// F1 — prototype-pollution hardening for addMessages/nestFlatKeys.
// `addMessages` runs nestFlatKeys (dotted-key expansion) BEFORE deepMerge,
// so deepMerge's own __proto__ filter never sees the dotted form. Message
// JSON is routinely fetched from a CDN / community-translation platform.
describe('i18n addMessages — prototype pollution hardening (F1)', () => {
  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted
    delete (Object.prototype as Record<string, unknown>).isAdmin
  })

  test('dotted __proto__ key does not pollute Object.prototype', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hello' } } })
    i18n.addMessages('en', { '__proto__.polluted': 'yes' } as Record<string, string>)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('dotted constructor.prototype key does not pollute', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { 'constructor.prototype.isAdmin': 'true' } as Record<string, string>)
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  test('bare __proto__ key (non-dotted) does not pollute', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { __proto__: { polluted: 'yes' } } as unknown as Record<string, string>)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('legitimate dotted keys still expand correctly', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { 'section.title': 'Report' } as Record<string, string>)
    expect(i18n.t('section.title')).toBe('Report')
  })
})

// F5 — interpolate must not silently swallow a serialization failure.
// The placeholder fallback is correct; the dev warning is the added signal.
describe('i18n interpolate — non-serializable value (F5)', () => {
  test('falls back to the raw placeholder (behaviour preserved)', () => {
    interface Cyclic {
      self?: Cyclic
    }
    const circular: Cyclic = {}
    circular.self = circular
    const out = interpolate('Hi {{x}}', { x: circular as unknown as string })
    // JSON.stringify throws on the cycle → raw placeholder retained.
    expect(out).toBe('Hi {{x}}')
  })

  test('emits a dev warning instead of swallowing silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      interface Cyclic {
        self?: Cyclic
      }
      const circular: Cyclic = {}
      circular.self = circular
      interpolate('{{bad}}', { bad: circular as unknown as string })
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('not serializable'),
        expect.anything(),
      )
    } finally {
      warn.mockRestore()
    }
  })
})
