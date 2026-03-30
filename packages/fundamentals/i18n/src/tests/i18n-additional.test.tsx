import { effect } from '@pyreon/reactivity'
import { createI18n } from '../create-i18n'
import { parseRichText, Trans } from '../trans'
import type { TranslationDictionary } from '../types'

// ─── nestFlatKeys via addMessages ────────────────────────────────────────────

describe('addMessages with nestFlatKeys', () => {
  it('converts deeply nested flat keys', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { 'a.b.c.d': 'deep' })
    expect(i18n.t('a.b.c.d')).toBe('deep')
  })

  it('multiple flat keys build shared parent objects', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', {
      'form.email.label': 'Email',
      'form.email.placeholder': 'Enter email',
      'form.password.label': 'Password',
    })
    expect(i18n.t('form.email.label')).toBe('Email')
    expect(i18n.t('form.email.placeholder')).toBe('Enter email')
    expect(i18n.t('form.password.label')).toBe('Password')
  })

  it('flat keys coexist with nested keys in same addMessages call', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', {
      'flat.key': 'Flat Value',
      nested: { key: 'Nested Value' },
    })
    expect(i18n.t('flat.key')).toBe('Flat Value')
    expect(i18n.t('nested.key')).toBe('Nested Value')
  })

  it('flat key overwrites previous nested value at same path', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { section: { title: 'Old' } })
    i18n.addMessages('en', { 'section.title': 'New' })
    expect(i18n.t('section.title')).toBe('New')
  })

  it('flat keys without dots are passed through unchanged', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { simple: 'Just a string' })
    expect(i18n.t('simple')).toBe('Just a string')
  })

  it('flat key with non-string value (nested object at dotted key) is treated as nested', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    // If a dotted key has an object value, nestFlatKeys treats it as a regular key
    i18n.addMessages('en', { 'a.b': { c: 'Nested under flat' } } as any)
    // Since "a.b" has a non-string value, it's kept as-is — lookupKey("a.b") won't resolve
    // But "a" → "b" → { c: "Nested under flat" } won't be created either
    // The object value at key "a.b" isn't a string, so nestFlatKeys passes it through
    expect(i18n.t('a.b')).toBe('a.b') // Key not found as string
  })

  it('flat keys in namespaced addMessages', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages(
      'en',
      { 'errors.auth': 'Auth failed', 'errors.network': 'Network error' },
      'admin',
    )
    expect(i18n.t('admin:errors.auth')).toBe('Auth failed')
    expect(i18n.t('admin:errors.network')).toBe('Network error')
  })
})

// ─── core subpath imports ────────────────────────────────────────────────────

describe('i18n core subpath', () => {
  it('exports createI18n and interpolate without @pyreon/core dependency', async () => {
    const mod = await import('../core')
    expect(mod.createI18n).toBeDefined()
    expect(mod.interpolate).toBeDefined()
  })

  it('exports resolvePluralCategory', async () => {
    const mod = await import('../core')
    expect(mod.resolvePluralCategory).toBeDefined()
    expect(mod.resolvePluralCategory('en', 1)).toBe('one')
    expect(mod.resolvePluralCategory('en', 5)).toBe('other')
  })

  it('core createI18n is functional without DOM', async () => {
    const { createI18n: coreCreateI18n } = await import('../core')
    const i18n = coreCreateI18n({
      locale: 'en',
      messages: { en: { greeting: 'Hello {{name}}!' } },
    })
    expect(i18n.t('greeting', { name: 'Server' })).toBe('Hello Server!')
  })
})

// ─── Pluralization with _zero suffix ─────────────────────────────────────────

describe('pluralization with _zero suffix', () => {
  it("uses _zero form when count is 0 and rule returns 'zero'", () => {
    const i18n = createI18n({
      locale: 'custom',
      pluralRules: {
        custom: (count: number) => (count === 0 ? 'zero' : count === 1 ? 'one' : 'other'),
      },
      messages: {
        custom: {
          items_zero: 'No items',
          items_one: '{{count}} item',
          items_other: '{{count}} items',
        },
      },
    })

    expect(i18n.t('items', { count: 0 })).toBe('No items')
    expect(i18n.t('items', { count: 1 })).toBe('1 item')
    expect(i18n.t('items', { count: 5 })).toBe('5 items')
  })

  it('falls back to _other when _zero is missing and count is 0 in English', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          items_one: '{{count}} item',
          items_other: '{{count}} items',
        },
      },
    })

    // English Intl.PluralRules returns "other" for 0, so _other is used
    expect(i18n.t('items', { count: 0 })).toBe('0 items')
  })

  it('pluralization with all three suffixes: _zero, _one, _other', () => {
    const i18n = createI18n({
      locale: 'pl',
      pluralRules: {
        pl: (count: number) => {
          if (count === 0) return 'zero'
          if (count === 1) return 'one'
          return 'other'
        },
      },
      messages: {
        pl: {
          messages_zero: 'Brak wiadomości',
          messages_one: '{{count}} wiadomość',
          messages_other: '{{count}} wiadomości',
        },
      },
    })

    expect(i18n.t('messages', { count: 0 })).toBe('Brak wiadomości')
    expect(i18n.t('messages', { count: 1 })).toBe('1 wiadomość')
    expect(i18n.t('messages', { count: 7 })).toBe('7 wiadomości')
  })

  it('count as string number still works for pluralization', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: {
          items_one: '{{count}} item',
          items_other: '{{count}} items',
        },
      },
    })

    // count is a string but Number("1") === 1
    expect(i18n.t('items', { count: '1' })).toBe('1 item')
    expect(i18n.t('items', { count: '5' })).toBe('5 items')
  })
})

// ─── Namespace lazy loading — additional scenarios ───────────────────────────

describe('namespace lazy loading', () => {
  it('loads namespace for current locale by default', async () => {
    const loaderCalls: string[] = []

    const i18n = createI18n({
      locale: 'fr',
      loader: async (locale, namespace) => {
        loaderCalls.push(`${locale}:${namespace}`)
        return { title: `${locale} ${namespace} title` }
      },
    })

    await i18n.loadNamespace('dashboard')
    expect(loaderCalls).toEqual(['fr:dashboard'])
    expect(i18n.t('dashboard:title')).toBe('fr dashboard title')
  })

  it('loading namespace then switching locale does not lose previous locale data', async () => {
    const translations: Record<string, Record<string, TranslationDictionary>> = {
      en: { auth: { login: 'Log in' } },
      fr: { auth: { login: 'Connexion' } },
    }

    const i18n = createI18n({
      locale: 'en',
      loader: async (locale, ns) => translations[locale]?.[ns],
    })

    await i18n.loadNamespace('auth')
    expect(i18n.t('auth:login')).toBe('Log in')

    i18n.locale.set('fr')
    await i18n.loadNamespace('auth')
    expect(i18n.t('auth:login')).toBe('Connexion')

    // Switch back — en data should still be there
    i18n.locale.set('en')
    expect(i18n.t('auth:login')).toBe('Log in')
  })

  it('loaded namespaces update reactively', async () => {
    const i18n = createI18n({
      locale: 'en',
      loader: async (_locale, ns) => ({ key: `${ns}-value` }),
    })

    const snapshots: number[] = []
    const cleanup = effect(() => {
      snapshots.push(i18n.loadedNamespaces().size)
    })

    expect(snapshots).toEqual([0])

    await i18n.loadNamespace('auth')
    expect(snapshots).toEqual([0, 1])

    await i18n.loadNamespace('admin')
    expect(snapshots).toEqual([0, 1, 2])

    cleanup.dispose()
  })
})

// ─── Locale switching — reactivity ───────────────────────────────────────────

describe('locale switching reactivity', () => {
  it('locale.set triggers reactive t() updates across multiple calls', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: { greeting: 'Hello', farewell: 'Goodbye' },
        es: { greeting: 'Hola', farewell: 'Adiós' },
        ja: { greeting: 'こんにちは', farewell: 'さようなら' },
      },
    })

    const results: string[] = []
    const cleanup = effect(() => {
      results.push(i18n.t('greeting'))
    })

    expect(results).toEqual(['Hello'])

    i18n.locale.set('es')
    expect(results).toEqual(['Hello', 'Hola'])

    i18n.locale.set('ja')
    expect(results).toEqual(['Hello', 'Hola', 'こんにちは'])

    cleanup.dispose()
  })

  it('locale() returns current locale reactively', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })

    const locales: string[] = []
    const cleanup = effect(() => {
      locales.push(i18n.locale())
    })

    expect(locales).toEqual(['en'])

    i18n.locale.set('fr')
    expect(locales).toEqual(['en', 'fr'])

    i18n.locale.set('de')
    expect(locales).toEqual(['en', 'fr', 'de'])

    cleanup.dispose()
  })

  it('switching to locale with missing key falls back to fallbackLocale', () => {
    const i18n = createI18n({
      locale: 'en',
      fallbackLocale: 'en',
      messages: {
        en: { common: 'English common', onlyEn: 'Only in English' },
        fr: { common: 'French common' },
      },
    })

    i18n.locale.set('fr')
    expect(i18n.t('common')).toBe('French common')
    expect(i18n.t('onlyEn')).toBe('Only in English') // falls back to en
  })
})

// ─── parseRichText — additional edge cases ───────────────────────────────────

describe('parseRichText — additional', () => {
  it('handles self-closing-like tags (treated as unmatched)', () => {
    // parseRichText only handles <tag>content</tag> — <br/> etc. are left as-is
    expect(parseRichText('Line1<br/>Line2')).toEqual(['Line1<br/>Line2'])
  })

  it('nested tags match inner tag only (regex uses [^<]* for content)', () => {
    // The regex [^<]* means content between tags cannot contain <, so the outer
    // tag is not matched and only the inner <em> tag is parsed
    const result = parseRichText('<bold>some <em>nested</em> text</bold>')
    expect(result).toEqual(['<bold>some ', { tag: 'em', children: 'nested' }, ' text</bold>'])
  })

  it('tag names with only word characters are matched (\\w+)', () => {
    // \\w matches [a-zA-Z0-9_], so underscores and digits work
    const result = parseRichText('Click <cta_1>here</cta_1>!')
    expect(result).toEqual(['Click ', { tag: 'cta_1', children: 'here' }, '!'])
  })

  it('tag names with hyphens are not matched (left as plain text)', () => {
    // Hyphens are not word characters, so <cta-1> is not a valid tag
    const result = parseRichText('Click <cta-1>here</cta-1>!')
    expect(result).toEqual(['Click <cta-1>here</cta-1>!'])
  })
})

// ─── Trans component — additional scenarios ──────────────────────────────────

describe('Trans — additional', () => {
  it('handles translation with multiple component tags', () => {
    const i18n = createI18n({
      locale: 'en',
      messages: {
        en: { tos: 'Read <terms>terms</terms> and <privacy>privacy</privacy>' },
      },
    })

    const result = Trans({
      t: i18n.t,
      i18nKey: 'tos',
      components: {
        terms: (children: string) => ({ type: 'a', props: { href: '/terms' }, children }),
        privacy: (children: string) => ({ type: 'a', props: { href: '/privacy' }, children }),
      },
    })

    const vnode = result as any
    expect(vnode.children.length).toBe(4) // "Read ", terms link, " and ", privacy link
    expect(vnode.children[0]).toBe('Read ')
    expect(vnode.children[1]).toEqual({ type: 'a', props: { href: '/terms' }, children: 'terms' })
    expect(vnode.children[2]).toBe(' and ')
    expect(vnode.children[3]).toEqual({
      type: 'a',
      props: { href: '/privacy' },
      children: 'privacy',
    })
  })

  it('returns plain text when translation has no tags and no components', () => {
    const t = (key: string) => (key === 'plain' ? 'Just plain text' : key)
    const result = Trans({ t, i18nKey: 'plain' })
    expect(result).toBe('Just plain text')
  })
})

// ─── Deep merge edge cases ───────────────────────────────────────────────────

describe('addMessages deep merge edge cases', () => {
  it('prototype pollution keys are rejected', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: { safe: 'yes' } } })
    // deepMerge skips __proto__, constructor, prototype
    i18n.addMessages('en', { __proto__: { polluted: 'yes' } } as any)
    expect(i18n.t('safe')).toBe('yes')
    // The polluted key should not be accessible
    expect(({} as any).polluted).toBeUndefined()
  })

  it('addMessages with undefined values are skipped in nestFlatKeys', () => {
    const i18n = createI18n({ locale: 'en', messages: { en: {} } })
    i18n.addMessages('en', { key: undefined as any, valid: 'yes' })
    expect(i18n.t('valid')).toBe('yes')
  })
})
