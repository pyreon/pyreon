import { effect } from '@pyreon/reactivity'
import { createI18n } from '../create-i18n'
import { interpolate } from '../interpolation'

// ─── Intl formatters: n() / d() / rt() ────────────────────────────────────────

describe('i18n.n() — number formatting', () => {
  it('formats with locale grouping (en vs de)', () => {
    const en = createI18n({ locale: 'en' })
    expect(en.n(1234.5)).toBe('1,234.5')
    const de = createI18n({ locale: 'de' })
    expect(de.n(1234.5)).toBe('1.234,5')
  })

  it('accepts Intl.NumberFormatOptions (currency, percent)', () => {
    const en = createI18n({ locale: 'en' })
    expect(en.n(9.99, { style: 'currency', currency: 'USD' })).toBe('$9.99')
    expect(en.n(0.42, { style: 'percent' })).toBe('42%')
  })

  it('resolves a named numberFormats entry by string', () => {
    const i18n = createI18n({
      locale: 'en',
      numberFormats: { en: { price: { style: 'currency', currency: 'USD' } } },
    })
    expect(i18n.n(9.99, 'price')).toBe('$9.99')
  })

  it('named format falls back to fallbackLocale table', () => {
    const i18n = createI18n({
      locale: 'de',
      fallbackLocale: 'en',
      numberFormats: { en: { price: { style: 'currency', currency: 'USD' } } },
    })
    // de has no `price` named format → uses en's, but formats for de locale.
    expect(i18n.n(9.99, 'price')).toContain('9,99')
  })

  it('is reactive to locale changes', () => {
    const i18n = createI18n({ locale: 'en' })
    const seen: string[] = []
    effect(() => {
      seen.push(i18n.n(1234.5))
    })
    expect(seen.at(-1)).toBe('1,234.5')
    i18n.locale.set('de')
    expect(seen.at(-1)).toBe('1.234,5')
  })
})

describe('i18n.d() — date formatting', () => {
  const date = new Date('2024-01-15T12:00:00Z')

  it('formats a Date with options (UTC-pinned for determinism)', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.d(date, { dateStyle: 'medium', timeZone: 'UTC' })).toBe('Jan 15, 2024')
  })

  it('accepts epoch-ms numbers and date strings', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.d(date.getTime(), { year: 'numeric', timeZone: 'UTC' })).toBe('2024')
    expect(i18n.d('2024-01-15T12:00:00Z', { year: 'numeric', timeZone: 'UTC' })).toBe('2024')
  })

  it('resolves a named dateFormats entry', () => {
    const i18n = createI18n({
      locale: 'en',
      dateFormats: { en: { ymd: { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' } } },
    })
    expect(i18n.d(date, 'ymd')).toBe('01/15/2024')
  })

  it('is reactive to locale changes', () => {
    const i18n = createI18n({ locale: 'en' })
    const seen: string[] = []
    effect(() => {
      seen.push(i18n.d(date, { month: 'long', timeZone: 'UTC' }))
    })
    expect(seen.at(-1)).toBe('January')
    i18n.locale.set('de')
    expect(seen.at(-1)).toBe('Januar')
  })
})

describe('i18n.rt() — relative-time formatting', () => {
  it('formats past and future', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.rt(-3, 'day')).toBe('3 days ago')
    expect(i18n.rt(2, 'hour')).toBe('in 2 hours')
  })

  it('honors numeric:auto (yesterday/tomorrow)', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.rt(-1, 'day', { numeric: 'auto' })).toBe('yesterday')
    expect(i18n.rt(1, 'day', { numeric: 'auto' })).toBe('tomorrow')
  })

  it('resolves a named relativeTimeFormats entry', () => {
    const i18n = createI18n({
      locale: 'en',
      relativeTimeFormats: { en: { auto: { numeric: 'auto' } } },
    })
    expect(i18n.rt(-1, 'day', 'auto')).toBe('yesterday')
  })
})

// ─── Inline interpolation format specifiers ────────────────────────────────────

describe('inline {{val, format}} specifiers', () => {
  it('formats numbers and named currency inline', () => {
    const i18n = createI18n({
      locale: 'en',
      numberFormats: { en: { currency: { style: 'currency', currency: 'USD' } } },
      messages: { en: { total: 'Total: {{amount, currency}}', pts: '{{n, number}} pts' } },
    })
    expect(i18n.t('total', { amount: 9.99 })).toBe('Total: $9.99')
    expect(i18n.t('pts', { n: 1234.5 })).toBe('1,234.5 pts')
  })

  it('formats dates inline via a named date format', () => {
    const i18n = createI18n({
      locale: 'en',
      dateFormats: { en: { ymd: { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' } } },
      messages: { en: { on: 'On {{when, ymd}}' } },
    })
    expect(i18n.t('on', { when: new Date('2024-01-15T12:00:00Z') })).toBe('On 01/15/2024')
  })

  it('formats relative time inline with a unit arg', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { ago: '{{n, relativetime, day}}' } } })
    expect(i18n.t('ago', { n: -2 })).toBe('2 days ago')
  })

  it('applies custom named formatters inline', () => {
    const i18n = createI18n({
      locale: 'en',
      formats: { shout: (v) => String(v).toUpperCase() },
      messages: { en: { hi: '{{word, shout}}!' } },
    })
    expect(i18n.t('hi', { word: 'hello' })).toBe('HELLO!')
  })

  it('preserves the placeholder when the value is missing', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: '{{amount, number}}' } } })
    expect(i18n.t('x', {})).toBe('{{amount, number}}')
  })

  it('falls back to String(value) for an unrecognized spec', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: '{{v, bogus}}' } } })
    expect(i18n.t('x', { v: 5 })).toBe('5')
  })

  it('bare interpolate() ignores specs (no format resolver)', () => {
    expect(interpolate('{{a, number}}', { a: 5 })).toBe('5')
    expect(interpolate('{{a, up}}', { a: 'x' }, { format: (v) => String(v).toUpperCase() })).toBe('X')
  })

  it('leaves non-{{word}} braces literal (not a placeholder)', () => {
    // Key part is not a single \w+ token → left untouched.
    expect(interpolate('{{not a key}}', { x: 1 })).toBe('{{not a key}}')
    expect(interpolate('a {{b.c}} z', { 'b.c': 'X' })).toBe('a {{b.c}} z')
  })
})

// ─── context (gender / variant) ───────────────────────────────────────────────

describe('context (gender/variant)', () => {
  const i18n = createI18n({
    locale: 'en',
    messages: {
      en: { friend: 'A friend', friend_male: 'His friend', friend_female: 'Her friend' },
    },
  })

  it('selects the context-specific key', () => {
    expect(i18n.t('friend', { context: 'male' })).toBe('His friend')
    expect(i18n.t('friend', { context: 'female' })).toBe('Her friend')
  })

  it('falls back to the base key when the context form is absent', () => {
    expect(i18n.t('friend', { context: 'other' })).toBe('A friend')
    expect(i18n.t('friend')).toBe('A friend')
  })

  it('combines context with pluralization (key_context_plural)', () => {
    const ctx = createI18n({
      locale: 'en',
      messages: {
        en: {
          item_male_one: '1 male item',
          item_male_other: '{{count}} male items',
          item_one: '1 item',
          item_other: '{{count}} items',
        },
      },
    })
    expect(ctx.t('item', { context: 'male', count: 1 })).toBe('1 male item')
    expect(ctx.t('item', { context: 'male', count: 3 })).toBe('3 male items')
    expect(ctx.t('item', { count: 2 })).toBe('2 items')
  })
})

// ─── _zero plural special-case ─────────────────────────────────────────────────

describe('_zero plural special-case', () => {
  it('uses key_zero for count===0 when present', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { cart_zero: 'Cart is empty', cart_one: '1 item', cart_other: '{{count}} items' } },
    })
    expect(i18n.t('cart', { count: 0 })).toBe('Cart is empty')
    expect(i18n.t('cart', { count: 1 })).toBe('1 item')
    expect(i18n.t('cart', { count: 5 })).toBe('5 items')
  })

  it('falls to the CLDR category when no key_zero exists', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { x_one: '1', x_other: '{{count}}' } },
    })
    expect(i18n.t('x', { count: 0 })).toBe('0')
  })
})

// ─── defaultValue ──────────────────────────────────────────────────────────────

describe('defaultValue', () => {
  it('returns the (interpolated) defaultValue when the key is missing', () => {
    const i18n = createI18n({ locale: 'en' })
    expect(i18n.t('missing.key', { defaultValue: 'Fallback' })).toBe('Fallback')
    expect(i18n.t('greet', { defaultValue: 'Hi {{name}}', name: 'Bo' })).toBe('Hi Bo')
  })

  it('an existing translation takes priority over defaultValue', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { k: 'Real' } } })
    expect(i18n.t('k', { defaultValue: 'X' })).toBe('Real')
  })
})

// ─── Nesting $t(key) ───────────────────────────────────────────────────────────

describe('nesting $t(key)', () => {
  it('resolves a referenced key inline', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { appName: 'Pyreon', welcome: 'Welcome to $t(appName)' } },
    })
    expect(i18n.t('welcome')).toBe('Welcome to Pyreon')
  })

  it('inherits the parent values', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { line: '$t(items)', items: '{{count}} items', items_one: '1 item', items_other: '{{count}} items' } },
    })
    expect(i18n.t('line', { count: 3 })).toBe('3 items')
  })

  it('merges inline JSON options into the nested call', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { a: '$t(b, {"count": 2})', b_one: '1 x', b_other: '{{count}} x' } },
    })
    expect(i18n.t('a')).toBe('2 x')
  })

  it('depth-caps cyclic references without hanging', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: '$t(y)', y: '$t(x)' } } })
    const result = i18n.t('x')
    expect(typeof result).toBe('string')
    expect(result).toContain('$t(')
  })
})

// ─── Coverage edge cases (formatter + interpolation branches) ──────────────────

describe('formatter/interpolation edge branches', () => {
  it('d() bare date/time/datetime builtins use default styles', () => {
    const i18n = createI18n({ locale: 'en' })
    const date = new Date('2024-01-15T12:00:00Z')
    expect(i18n.d(date, 'date')).toContain('2024')
    expect(i18n.d(date, 'time')).toContain(':')
    const dt = i18n.d(date, 'datetime')
    expect(dt).toContain('2024')
    expect(dt).toContain(':')
  })

  it('inline named formats fall back to the fallbackLocale tables', () => {
    const i18n = createI18n({
      locale: 'de',
      fallbackLocale: 'en',
      numberFormats: { en: { usd: { style: 'currency', currency: 'USD' } } },
      dateFormats: { en: { y: { year: 'numeric', timeZone: 'UTC' } } },
      relativeTimeFormats: { en: { auto: { numeric: 'auto' } } },
      messages: { de: { a: '{{x, usd}}', b: '{{d, y}}', c: '{{n, auto, day}}' } },
    })
    expect(i18n.t('a', { x: 9.99 })).toContain('9,99') // de digits, en named opts
    expect(i18n.t('b', { d: new Date('2024-01-15T12:00:00Z') })).toBe('2024')
    expect(i18n.t('c', { n: -1 })).toBe('gestern') // de "yesterday", numeric:auto
  })

  it('inline bare date/time/datetime builtin specs format via defaults', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: { en: { a: '{{w, date}}', b: '{{w, time}}', c: '{{w, datetime}}' } },
    })
    const w = new Date('2024-01-15T12:00:00Z')
    expect(i18n.t('a', { w })).toContain('Jan')
    expect(i18n.t('b', { w })).toContain(':')
    expect(i18n.t('c', { w })).toContain(':')
  })

  it('inline bare relativetime defaults the unit to second', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: '{{n, relativetime}}' } } })
    expect(i18n.t('x', { n: -30 })).toBe('30 seconds ago')
  })

  it('falls back to fallbackLocale when the key is missing in the current locale', () => {
    const i18n = createI18n({
      locale: 'de',
      fallbackLocale: 'en',
      messages: { en: { only: 'English' }, de: {} },
    })
    expect(i18n.t('only')).toBe('English')
  })

  it('inline spec with a null value renders empty', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { x: '{{v, bogus}}' } } })
    expect(i18n.t('x', { v: null })).toBe('')
  })

  it('formatter factories: unknown named → defaults, undefined options, cache hits', () => {
    const i18n = createI18n({ locale: 'en' })
    // Unknown named string with no config → resolveNamed miss → default formatter.
    expect(i18n.n(1234.5, 'nope')).toBe('1,234.5')
    expect(i18n.rt(-1, 'day', 'nope')).toBe('1 day ago')
    // d() with no options at all (the `options ?? {}` undefined arm).
    expect(typeof i18n.d(new Date('2024-01-15T12:00:00Z'))).toBe('string')
    // Cache hit: a second identical (locale, options) call reuses the memo.
    expect(i18n.n(1234.5)).toBe(i18n.n(1234.5))
    expect(i18n.d(0, { year: 'numeric', timeZone: 'UTC' })).toBe(i18n.d(0, { year: 'numeric', timeZone: 'UTC' }))
    expect(i18n.rt(-3, 'day')).toBe(i18n.rt(-3, 'day'))
  })

  it('an inline format that throws renders the raw placeholder + warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({
      locale: 'en',
      formats: {
        boom: () => {
          throw new Error('nope')
        },
      },
      messages: { en: { x: '{{v, boom}}' } },
    })
    expect(i18n.t('x', { v: 'a' })).toBe('{{v, boom}}')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
