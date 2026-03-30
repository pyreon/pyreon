import { describe, expect, it } from 'vitest'
import {
  buildLocalePath,
  createLocaleContext,
  detectLocaleFromHeader,
  extractLocaleFromPath,
} from '../i18n-routing'

describe('detectLocaleFromHeader', () => {
  const locales = ['en', 'de', 'cs']

  it('detects primary language', () => {
    expect(detectLocaleFromHeader('de-DE,de;q=0.9,en;q=0.8', locales, 'en')).toBe('de')
  })

  it('falls back to default when no match', () => {
    expect(detectLocaleFromHeader('fr-FR,fr;q=0.9', locales, 'en')).toBe('en')
  })

  it('handles null header', () => {
    expect(detectLocaleFromHeader(null, locales, 'en')).toBe('en')
  })

  it('handles empty string', () => {
    expect(detectLocaleFromHeader('', locales, 'en')).toBe('en')
  })

  it('respects quality values', () => {
    expect(detectLocaleFromHeader('en;q=0.5,cs;q=0.9', locales, 'en')).toBe('cs')
  })

  it('strips region codes', () => {
    expect(detectLocaleFromHeader('cs-CZ', locales, 'en')).toBe('cs')
  })
})

describe('extractLocaleFromPath', () => {
  const locales = ['en', 'de', 'cs']

  it('extracts locale from prefix', () => {
    expect(extractLocaleFromPath('/de/about', locales, 'en')).toEqual({
      locale: 'de',
      pathWithoutLocale: '/about',
    })
  })

  it('returns default for unprefixed path', () => {
    expect(extractLocaleFromPath('/about', locales, 'en')).toEqual({
      locale: 'en',
      pathWithoutLocale: '/about',
    })
  })

  it('handles root path', () => {
    expect(extractLocaleFromPath('/', locales, 'en')).toEqual({
      locale: 'en',
      pathWithoutLocale: '/',
    })
  })

  it('handles locale root', () => {
    expect(extractLocaleFromPath('/cs', locales, 'en')).toEqual({
      locale: 'cs',
      pathWithoutLocale: '/',
    })
  })

  it('handles nested paths', () => {
    expect(extractLocaleFromPath('/de/blog/post-1', locales, 'en')).toEqual({
      locale: 'de',
      pathWithoutLocale: '/blog/post-1',
    })
  })
})

describe('buildLocalePath', () => {
  it('prefixes non-default locale', () => {
    expect(buildLocalePath('/about', 'de', 'en', 'prefix-except-default')).toBe('/de/about')
  })

  it('no prefix for default locale with prefix-except-default', () => {
    expect(buildLocalePath('/about', 'en', 'en', 'prefix-except-default')).toBe('/about')
  })

  it('always prefixes with prefix strategy', () => {
    expect(buildLocalePath('/about', 'en', 'en', 'prefix')).toBe('/en/about')
  })

  it('handles root path', () => {
    expect(buildLocalePath('/', 'de', 'en', 'prefix-except-default')).toBe('/de')
  })
})

describe('createLocaleContext', () => {
  const config = {
    locales: ['en', 'de', 'cs'],
    defaultLocale: 'en',
  }

  it('creates context with correct locale', () => {
    const ctx = createLocaleContext('de', '/de/about', config)
    expect(ctx.locale).toBe('de')
    expect(ctx.locales).toEqual(['en', 'de', 'cs'])
    expect(ctx.defaultLocale).toBe('en')
  })

  it('localePath builds correct paths', () => {
    const ctx = createLocaleContext('de', '/de/about', config)
    expect(ctx.localePath('/contact')).toBe('/de/contact')
    expect(ctx.localePath('/contact', 'en')).toBe('/contact')
    expect(ctx.localePath('/contact', 'cs')).toBe('/cs/contact')
  })

  it('alternates returns all locale variants', () => {
    const ctx = createLocaleContext('de', '/de/about', config)
    const alts = ctx.alternates()
    expect(alts).toEqual([
      { locale: 'en', url: '/about' },
      { locale: 'de', url: '/de/about' },
      { locale: 'cs', url: '/cs/about' },
    ])
  })

  it('alternates for root path', () => {
    const ctx = createLocaleContext('en', '/', config)
    const alts = ctx.alternates()
    expect(alts[0]?.url).toBe('/')
    expect(alts[1]?.url).toBe('/de')
  })

  it('localePath for root with prefix strategy', () => {
    const prefixConfig = { ...config, strategy: 'prefix' as const }
    const ctx = createLocaleContext('en', '/en/', prefixConfig)
    expect(ctx.localePath('/')).toBe('/en')
    expect(ctx.localePath('/', 'de')).toBe('/de')
  })
})

describe('useLocale', () => {
  it('exports useLocale function', async () => {
    const mod = await import('../i18n-routing')
    expect(typeof mod.useLocale).toBe('function')
  })

  it('exports setLocale function', async () => {
    const mod = await import('../i18n-routing')
    expect(typeof mod.setLocale).toBe('function')
  })

  it('exports localeSignal', async () => {
    const mod = await import('../i18n-routing')
    expect(typeof mod.localeSignal).toBe('function')
    expect(mod.localeSignal()).toBe('en')
  })
})

describe('i18nRouting plugin', () => {
  it('returns a Vite plugin with correct name', async () => {
    const { i18nRouting: routing } = await import('../i18n-routing')
    const plugin = routing({ locales: ['en', 'de'], defaultLocale: 'en' }) as any
    expect(plugin.name).toBe('pyreon-zero-i18n-routing')
  })
})
