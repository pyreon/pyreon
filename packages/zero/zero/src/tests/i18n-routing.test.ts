import { describe, expect, it } from 'vitest'
import { parseFileRoutes } from '../fs-router'
import {
  buildLocalePath,
  createLocaleContext,
  detectLocaleFromHeader,
  expandRoutesForLocales,
  extractLocaleFromPath,
} from '../i18n-routing'
import type { FileRoute } from '../types'

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

// ─── PR H — expandRoutesForLocales ─────────────────────────────────────────

describe('expandRoutesForLocales', () => {
  // Compose with the real fs-router so test inputs match production
  // FileRoute shape (urlPath, dirPath, depth, isLayout, etc.). Using
  // mock objects would let a regression in `parseFileRoutes` semantics
  // slip past these tests.
  const parse = (files: string[]): FileRoute[] => parseFileRoutes(files)

  describe('strategy: prefix-except-default', () => {
    const config = {
      locales: ['en', 'de', 'cs'],
      defaultLocale: 'en',
      strategy: 'prefix-except-default' as const,
    }

    it('keeps default-locale route unprefixed, prefixes others', () => {
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual(['/about', '/cs/about', '/de/about'])
    })

    it('preserves filePath across all locale variants (same source module)', () => {
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      // Every variant points at the same source file — the duplication
      // is at the URL-pattern level, not the module level.
      expect(expanded.every((r) => r.filePath === 'about.tsx')).toBe(true)
    })

    it('prefixes catch-all routes correctly', () => {
      const routes = parse(['blog/[...slug].tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      // Default kept, others prefixed; the `:slug*` catch-all syntax
      // composes naturally with the locale prefix.
      expect(urlPaths).toEqual(['/blog/:slug*', '/cs/blog/:slug*', '/de/blog/:slug*'])
      expect(expanded.every((r) => r.isCatchAll)).toBe(true)
    })

    it('prefixes dynamic-param routes correctly', () => {
      const routes = parse(['users/[id].tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual(['/cs/users/:id', '/de/users/:id', '/users/:id'])
    })

    it('prefixes root index correctly', () => {
      const routes = parse(['index.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      // Root `/` stays for default; `/de` and `/cs` (no trailing slash)
      // for non-default — matches buildLocalePath's behaviour.
      expect(urlPaths).toEqual(['/', '/cs', '/de'])
    })

    it('duplicates layouts so each locale subtree wraps correctly', () => {
      // _layout at dashboard scope wraps everything under /dashboard.
      // After expansion we need a layout at `/de/dashboard` too,
      // otherwise /de/dashboard/* loses its layout. The duplicated
      // FileRoute carries the same filePath (same component module) —
      // only the urlPath/dirPath/depth shift.
      const routes = parse(['dashboard/_layout.tsx', 'dashboard/index.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const layouts = expanded.filter((r) => r.isLayout)
      const layoutPaths = layouts.map((r) => r.urlPath).sort()
      expect(layoutPaths).toEqual(['/cs/dashboard', '/dashboard', '/de/dashboard'])
      expect(layouts.every((r) => r.filePath === 'dashboard/_layout.tsx')).toBe(true)
    })

    it('inherits exports (getStaticPaths) onto all locale variants', () => {
      // getStaticPaths composition is the SSG composition contract:
      // each locale variant of `/blog/[slug]` carries the SAME
      // enumerator, so the SSG plugin's expandUrlPattern step produces
      // `/blog/x` × locales × slugs concrete URLs.
      const routes = parse(['blog/[slug].tsx']).map((r) => ({
        ...r,
        exports: {
          hasDefault: true,
          hasLoader: false,
          hasGuard: false,
          hasMeta: false,
          hasMiddleware: false,
          hasGetStaticPaths: true,
        },
      }))
      const expanded = expandRoutesForLocales(routes, config)
      // Every variant's `exports` object should carry hasGetStaticPaths.
      // (The SSG plugin's registry separately keys by urlPath; what
      // matters here is the FileRoute carries the export-detection
      // through the duplication.)
      expect(expanded.every((r) => r.exports?.hasGetStaticPaths === true)).toBe(true)
    })

    it('recomputes depth from the new urlPath', () => {
      const routes = parse(['about.tsx']) // depth 1
      const expanded = expandRoutesForLocales(routes, config)
      // /about → depth 1, /de/about → depth 2, /cs/about → depth 2.
      const byPath = Object.fromEntries(expanded.map((r) => [r.urlPath, r.depth]))
      expect(byPath['/about']).toBe(1)
      expect(byPath['/de/about']).toBe(2)
      expect(byPath['/cs/about']).toBe(2)
    })
  })

  describe('strategy: prefix', () => {
    const config = {
      locales: ['en', 'de', 'cs'],
      defaultLocale: 'en',
      strategy: 'prefix' as const,
    }

    it('prefixes EVERY locale including the default', () => {
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual(['/cs/about', '/de/about', '/en/about'])
    })

    it('prefixes root-index across all locales', () => {
      const routes = parse(['index.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual(['/cs', '/de', '/en'])
    })

    it('does NOT keep an unprefixed default-locale variant', () => {
      // Under prefix-strategy, `/about` (no prefix) does not exist —
      // the user's URLs all self-identify their locale.
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, config)
      expect(expanded.find((r) => r.urlPath === '/about')).toBeUndefined()
    })
  })

  describe('no-op cases', () => {
    it('returns input unchanged when locales is empty', () => {
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: [],
        defaultLocale: 'en',
      })
      expect(expanded).toBe(routes)
    })

    it('returns input unchanged when only defaultLocale + prefix-except-default', () => {
      // [en] + prefix-except-default = no prefixing happens (en is
      // unprefixed under that strategy). Pure no-op — short-circuit
      // returns the input identity.
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',
      })
      expect(expanded).toBe(routes)
    })

    it('still emits a single prefixed variant under prefix strategy with locales: [en]', () => {
      // [en] + prefix = one /en/about route, not the no-op shape.
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en'],
        defaultLocale: 'en',
        strategy: 'prefix',
      })
      expect(expanded.map((r) => r.urlPath)).toEqual(['/en/about'])
    })
  })

  describe('default strategy fallback', () => {
    it('uses prefix-except-default when strategy is omitted', () => {
      const routes = parse(['about.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en', 'de'],
        defaultLocale: 'en',
      })
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual(['/about', '/de/about'])
    })
  })

  describe('root-layout skip under prefix-except-default (PR H follow-up)', () => {
    // Bisect-verified: removing the `route.isLayout && route.urlPath === '/'`
    // skip in `expandRoutesForLocales` causes the e2e gate at
    // /de/about to render with TWO navbars (`/_layout` and
    // `/de/_layout` BOTH match the path), and these unit specs to
    // fail with `expect 1 to be 3` (root layout array length).
    it('keeps en root layout, skips /de and /cs duplicates', () => {
      const routes = parse(['_layout.tsx', 'about.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',
      })
      const layouts = expanded.filter((r) => r.isLayout)
      // Only ONE root layout — the en/default — survives. The de and
      // cs root-layout duplicates are skipped because the unprefixed
      // root layout already wraps locale-prefixed children via the
      // route tree's hierarchical matching.
      expect(layouts.length).toBe(1)
      expect(layouts[0]?.urlPath).toBe('/')
      // Pages still duplicate normally.
      const pages = expanded.filter((r) => !r.isLayout)
      const pagePaths = pages.map((r) => r.urlPath).sort()
      expect(pagePaths).toEqual(['/about', '/cs/about', '/de/about'])
    })

    it('still duplicates non-root layouts (skip is root-only)', () => {
      // Companion to the skip rule — layouts at depth > 0 like
      // /dashboard/_layout DO need duplication because the
      // unprefixed /dashboard/_layout doesn't match
      // /de/dashboard/users (different path prefix).
      const routes = parse(['_layout.tsx', 'dashboard/_layout.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en', 'de'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',
      })
      const layoutPaths = expanded
        .filter((r) => r.isLayout)
        .map((r) => r.urlPath)
        .sort()
      // / (en root, kept) + /dashboard (en, kept) + /de/dashboard
      // (duplicated). NO /de root layout (skipped by the new rule).
      expect(layoutPaths).toEqual(['/', '/dashboard', '/de/dashboard'])
    })

    it('under `prefix` strategy, root layouts ARE duplicated (no unprefixed default exists)', () => {
      // Inverse of the skip rule. `prefix` makes EVERY locale
      // prefixed including the default, so there's no unprefixed
      // root to inherit from — each locale needs its own root layout
      // or the locale subtree mounts pages without any layout wrap.
      const routes = parse(['_layout.tsx'])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en', 'de', 'cs'],
        defaultLocale: 'en',
        strategy: 'prefix',
      })
      const layoutPaths = expanded
        .filter((r) => r.isLayout)
        .map((r) => r.urlPath)
        .sort()
      // Every locale gets a root layout under prefix strategy.
      expect(layoutPaths).toEqual(['/cs', '/de', '/en'])
    })
  })

  describe('multiple routes + multi-segment paths', () => {
    it('expands an entire route tree consistently', () => {
      const routes = parse([
        'index.tsx',
        'about.tsx',
        'users/[id].tsx',
        'blog/_layout.tsx',
        'blog/[...slug].tsx',
      ])
      const expanded = expandRoutesForLocales(routes, {
        locales: ['en', 'de'],
        defaultLocale: 'en',
        strategy: 'prefix-except-default',
      })
      const urlPaths = expanded.map((r) => r.urlPath).sort()
      expect(urlPaths).toEqual([
        '/',
        '/about',
        '/blog',
        '/blog/:slug*',
        '/de',
        '/de/about',
        '/de/blog',
        '/de/blog/:slug*',
        '/de/users/:id',
        '/users/:id',
      ])
    })
  })
})
