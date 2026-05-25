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

// F6 — `createI18n({ messages })` must apply the same flat-key expansion
// that `addMessages` does. Previously the initial-messages loop stored
// dictionaries verbatim, so `createI18n({ messages: { en: { 'nav.top':
// 'top' } } })` would store the dot-keyed string un-nested and
// `i18n.t('nav.top')` would split on `.`, miss, and fall back to
// returning the key as the value. The bug was invisible because
// `addMessages` (called at runtime) DOES nest flat keys — so users
// adding messages dynamically worked, but anyone using the canonical
// initialization saw "key returned as fallback" mystery behavior.
//
// Discovered in the HN-clone walls audit (T4.2 follow-up) — every
// `t()` call in the UI returned its key verbatim.
describe('createI18n({ messages }) — flat-key expansion parity (F6)', () => {
  test('flat dotted keys in initial messages resolve via t()', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          'nav.top': 'top',
          'nav.new': 'new',
          'search.placeholder': 'Search…',
          'search.results_one': '{{n}} result',
          'search.results_other': '{{n}} results',
        },
      },
    })
    expect(i18n.t('nav.top')).toBe('top')
    expect(i18n.t('nav.new')).toBe('new')
    expect(i18n.t('search.placeholder')).toBe('Search…')
    expect(i18n.t('search.results_one', { n: 1 })).toBe('1 result')
    expect(i18n.t('search.results_other', { n: 5 })).toBe('5 results')
  })

  test('mixed flat + nested initial messages both resolve', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          'flat.key': 'flat',
          nested: { key: 'nested' },
        },
      },
    })
    expect(i18n.t('flat.key')).toBe('flat')
    expect(i18n.t('nested.key')).toBe('nested')
  })

  test('initial-messages keys with no dots pass through unchanged', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { greeting: 'Hello' } },
    })
    expect(i18n.t('greeting')).toBe('Hello')
  })

  test('initial-messages flat keys survive an addMessages merge', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { 'a.b': 'initial' } },
    })
    i18n.addMessages('en', { 'c.d': 'added' })
    expect(i18n.t('a.b')).toBe('initial')
    expect(i18n.t('c.d')).toBe('added')
  })
})
