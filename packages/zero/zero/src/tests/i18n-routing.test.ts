import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import { parseFileRoutes } from '../fs-router'
import {
  _parseCookiesForTesting,
  buildLocalePath,
  createLocaleContext,
  detectLocaleFromHeader,
  expandRoutesForLocales,
  extractLocaleFromPath,
  validateLocale,
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
    const plugin = routing({ locales: ['en', 'de'], defaultLocale: 'en' }) as Plugin
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

// ─── PR L2 — Locale validation (path-traversal guard) ──────────────────────

describe('validateLocale (PR L2)', () => {
  // Happy paths — common BCP-47 locale shapes must all pass.
  it('accepts conventional BCP-47 locale tags', () => {
    expect(() => validateLocale('en')).not.toThrow()
    expect(() => validateLocale('de')).not.toThrow()
    expect(() => validateLocale('cs')).not.toThrow()
    expect(() => validateLocale('en-US')).not.toThrow()
    expect(() => validateLocale('zh-Hans')).not.toThrow()
    expect(() => validateLocale('pt-BR')).not.toThrow()
    // Three-letter and longer locale codes (Filipino, Chichewa, etc.).
    expect(() => validateLocale('fil')).not.toThrow()
    expect(() => validateLocale('nya')).not.toThrow()
  })

  // ── Rejection cases — each maps to a real security or correctness concern.

  it('rejects empty string', () => {
    expect(() => validateLocale('')).toThrow(/Invalid i18n locale/)
    expect(() => validateLocale('')).toThrow(/non-empty/)
  })

  it('rejects forward slash (path traversal + URL split)', () => {
    // The shape: `mkdir(join(distDir, 'de/sub'))` writes to `dist/de/sub`
    // — confusing layout; could collide with a real route subtree.
    expect(() => validateLocale('de/sub')).toThrow(/Path separators/)
    expect(() => validateLocale('/de')).toThrow(/Path separators/)
    expect(() => validateLocale('de/')).toThrow(/Path separators/)
  })

  it('rejects backslash (Windows path traversal)', () => {
    expect(() => validateLocale('de\\sub')).toThrow(/Path separators/)
  })

  it('rejects ".." path-traversal whole-string', () => {
    // Real attack surface: `i18n: { locales: ['..'] }` → `mkdir('dist/..')`
    // → writes outside dist. This is the headline bug L2 prevents.
    expect(() => validateLocale('..')).toThrow(/Path-traversal segments/)
    expect(() => validateLocale('.')).toThrow(/Path-traversal segments/)
  })

  it('rejects leading dot (hidden directory)', () => {
    // `.hidden` locale would create `dist/.hidden/` — not visible in
    // most file listings, surprising deploy behaviour.
    expect(() => validateLocale('.hidden')).toThrow(/Leading dot/)
    expect(() => validateLocale('.en')).toThrow(/Leading dot/)
  })

  it('rejects leading/trailing whitespace', () => {
    // Typos that would silently break URL emission.
    expect(() => validateLocale(' en')).toThrow(/whitespace/)
    expect(() => validateLocale('en ')).toThrow(/whitespace/)
    expect(() => validateLocale('en\n')).toThrow(/whitespace/)
    expect(() => validateLocale('\ten')).toThrow(/whitespace/)
  })

  it('rejects NUL characters', () => {
    // System-call boundary corruption. Real platform code paths
    // (mkdir, writeFile) misbehave when paths contain NUL.
    expect(() => validateLocale('de\0sub')).toThrow(/NUL/)
  })
})

describe('expandRoutesForLocales — validation guards (PR L2)', () => {
  const sampleRoute: FileRoute = {
    filePath: 'about.tsx',
    urlPath: '/about',
    dirPath: '',
    depth: 0,
    isLayout: false,
    isError: false,
    isLoading: false,
    isNotFound: false,
    exports: {
      hasLoader: false,
      hasMeta: false,
      hasGuard: false,
      hasError: false,
      hasLoading: false,
      hasMiddleware: false,
      hasGetStaticPaths: false,
      hasRevalidate: false,
      hasRenderMode: false,
      hasLoaderKey: false,
      hasGcTime: false,
    },
  }

  it('throws on a path-traversal locale in the locales array', () => {
    expect(() =>
      expandRoutesForLocales([sampleRoute], {
        locales: ['en', '..', 'de'],
        defaultLocale: 'en',
      }),
    ).toThrow(/Invalid i18n locale: ".."/)
  })

  it('throws on a slash-containing locale', () => {
    expect(() =>
      expandRoutesForLocales([sampleRoute], {
        locales: ['en', 'de/sub'],
        defaultLocale: 'en',
      }),
    ).toThrow(/Path separators/)
  })

  it('throws on an empty defaultLocale even with valid locales array', () => {
    expect(() =>
      expandRoutesForLocales([sampleRoute], {
        locales: ['en', 'de'],
        defaultLocale: '',
      }),
    ).toThrow(/Invalid i18n locale: ""/)
  })

  it('does NOT throw when locales array is empty (no-op guard runs first)', () => {
    // Apps mid-migration to/from i18n routing may temporarily land at
    // `{ locales: [], defaultLocale: 'en' }`. The no-op guard short-
    // circuits before validation, so an unused defaultLocale doesn't
    // need to satisfy the validator either (it wouldn't be reached).
    // Use a non-empty defaultLocale here so we're testing the empty-
    // locales no-op, not the validator's defaultLocale check.
    expect(() =>
      expandRoutesForLocales([sampleRoute], {
        locales: [],
        defaultLocale: 'en',
      }),
    ).not.toThrow()
  })
})

// ─── PR-S3: parseCookies truncation regression ──────────────────────────────
//
// Bug: `pair.trim().split('=')` then destructure `[key, value]` took only
// the first two array elements — any cookie value containing `=` (every
// base64-encoded session ID, every JWT) got silently truncated to the
// portion BEFORE the second `=`. Today only the locale cookie is read so
// impact is bounded, but the shared parser is a latent footgun.
//
// Fix: split on FIRST `=` only via `indexOf('=') + slice`. Matches the
// working pattern in packages/core/router/src/match.ts:51-59 (`parseQuery`).
//
// Bisect-verify: revert i18n-routing.ts:parseCookies to the old destructure
// shape → these tests fail (each value-with-`=` test asserts the FULL value
// survived; the broken parser returns a truncated value).
describe('PR-S3: parseCookies — values containing `=` are preserved end-to-end', () => {
  it('preserves base64 padding (session ID with trailing `==`)', () => {
    const cookies = _parseCookiesForTesting('session=YWJjZGVmZ2g=')
    expect(cookies.session).toBe('YWJjZGVmZ2g=')
  })

  it('preserves base64 padding (full `==` suffix)', () => {
    const cookies = _parseCookiesForTesting('session=YWJjZGVmZ2hpamtsbW5vcA==')
    expect(cookies.session).toBe('YWJjZGVmZ2hpamtsbW5vcA==')
  })

  it('preserves JWT-shaped values (multiple `.` and trailing `=`)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSJ9.signature='
    const cookies = _parseCookiesForTesting(`token=${jwt}`)
    expect(cookies.token).toBe(jwt)
  })

  it('preserves a value containing multiple `=` chars', () => {
    const cookies = _parseCookiesForTesting('opaque=a=b=c=d=e')
    expect(cookies.opaque).toBe('a=b=c=d=e')
  })

  it('parses adjacent cookies without bleeding values across the `;` boundary', () => {
    const cookies = _parseCookiesForTesting('locale=en; session=abc=def=ghi; foo=bar')
    expect(cookies.locale).toBe('en')
    expect(cookies.session).toBe('abc=def=ghi')
    expect(cookies.foo).toBe('bar')
  })

  it('decodes URL-encoded values that contain `=` after decode', () => {
    // Value `a=b` URL-encoded becomes `a%3Db`. After split-on-`=`, then
    // decodeURIComponent, the original `a=b` is restored. This test
    // documents the contract (decode happens AFTER split, so encoded `=`
    // in value position is safe regardless of the split-on-first-`=` fix).
    const cookies = _parseCookiesForTesting('value=a%3Db')
    expect(cookies.value).toBe('a=b')
  })

  it('handles empty / malformed entries gracefully', () => {
    const cookies = _parseCookiesForTesting('=novalue; valid=ok; ; novalue2=')
    // `=novalue` → key is empty, skipped
    // `valid=ok` → valid
    // ` ` (empty after split) → skipped
    // `novalue2=` → value is empty, skipped (matches original behavior)
    expect(cookies.valid).toBe('ok')
    expect(cookies['']).toBeUndefined()
    expect(cookies.novalue2).toBeUndefined()
  })

  it('returns empty object for missing header', () => {
    expect(_parseCookiesForTesting(undefined)).toEqual({})
    expect(_parseCookiesForTesting('')).toEqual({})
  })
})

// ─── PR-S10: expandRoutesForLocales clone + locale-major ordering ──────────
//
// Pre-fix shape:
// 1. `expanded.push(route)` on the default-locale path shared the input
//    FileRoute reference. A downstream consumer mutating any flat field
//    on the returned route would corrupt the original `routes` input —
//    causing subsequent calls (Vite plugin + SSG plugin both call
//    `expandRoutesForLocales` against the same input) to see corrupted
//    data.
// 2. Route-major loop ordering produced output sorted by route → locale,
//    making a route addition reshuffle the entire output block-by-block.
//    Locale-major output groups each locale's routes together (default
//    first), which is more predictable for debugging and stable under
//    additions.

describe('PR-S10: expandRoutesForLocales shallow-clone + locale-major', () => {
  const config = {
    locales: ['en', 'de', 'cs'],
    defaultLocale: 'en',
    strategy: 'prefix-except-default' as const,
  }
  const parse = (files: string[]): FileRoute[] => parseFileRoutes(files)

  it('default-locale routes are SHALLOW-CLONED (not shared references)', () => {
    const routes = parse(['about.tsx', 'contact.tsx'])
    const expanded = expandRoutesForLocales(routes, config)
    const defaultRoutes = expanded.filter((r) => r.urlPath === '/about' || r.urlPath === '/contact')

    // Every default-locale output must NOT share a reference with input
    for (const out of defaultRoutes) {
      const input = routes.find((r) => r.filePath === out.filePath)
      expect(input).toBeDefined()
      expect(out).not.toBe(input)
    }
  })

  it('mutating an expanded route does NOT affect the input routes', () => {
    const routes = parse(['about.tsx'])
    const originalUrlPath = routes[0]!.urlPath // '/about'

    const expanded = expandRoutesForLocales(routes, config)
    const defaultRoute = expanded.find((r) => r.urlPath === '/about')!

    // Downstream mutation simulating a buggy consumer
    ;(defaultRoute as unknown as { urlPath: string }).urlPath = '/mutated'

    // Input routes must be unchanged
    expect(routes[0]!.urlPath).toBe(originalUrlPath)
    expect(routes[0]!.urlPath).toBe('/about')
  })

  it('two successive calls produce isolated output (no cross-call corruption)', () => {
    const routes = parse(['about.tsx'])

    const first = expandRoutesForLocales(routes, config)
    const second = expandRoutesForLocales(routes, config)

    // The two expansions must be value-equal but reference-distinct
    expect(first.length).toBe(second.length)
    for (let i = 0; i < first.length; i++) {
      // Same shape
      expect(first[i]!.urlPath).toBe(second[i]!.urlPath)
      expect(first[i]!.filePath).toBe(second[i]!.filePath)
      // Distinct references (each call produces its own clones)
      expect(first[i]).not.toBe(second[i])
    }
  })

  it('locale-major ordering: all default-locale routes first, then each non-default locale together', () => {
    const routes = parse(['about.tsx', 'contact.tsx', 'index.tsx'])
    const expanded = expandRoutesForLocales(routes, config)

    // Expected order under locale-major + prefix-except-default:
    //   en: /, /about, /contact   (default — kept unprefixed, INPUT order preserved within block)
    //   de: /de, /de/about, /de/contact
    //   cs: /cs, /cs/about, /cs/contact
    //
    // Pre-PR-S10 route-major produced:
    //   /, /de, /cs, /about, /de/about, /cs/about, /contact, /de/contact, /cs/contact
    //
    // The new ordering is locale-major (all `en` routes first, then `de`, then `cs`).
    const urlPaths = expanded.map((r) => r.urlPath)
    const enBlock = urlPaths.slice(0, 3)
    const deBlock = urlPaths.slice(3, 6)
    const csBlock = urlPaths.slice(6, 9)

    // EN block: all unprefixed (default locale, no prefix)
    expect(enBlock.every((p) => !p.startsWith('/de/') && !p.startsWith('/cs/'))).toBe(true)
    // DE block: all `/de/...` (and `/de` for index)
    expect(deBlock.every((p) => p === '/de' || p.startsWith('/de/'))).toBe(true)
    // CS block: all `/cs/...` (and `/cs` for index)
    expect(csBlock.every((p) => p === '/cs' || p.startsWith('/cs/'))).toBe(true)
  })

  it('no-op short-circuit (empty locales) returns input unchanged', () => {
    const routes = parse(['about.tsx'])
    const expanded = expandRoutesForLocales(routes, { locales: [], defaultLocale: 'en' })
    expect(expanded).toBe(routes)
  })

  it('no-op short-circuit (only default locale under prefix-except-default) returns input unchanged', () => {
    const routes = parse(['about.tsx'])
    const expanded = expandRoutesForLocales(routes, {
      locales: ['en'],
      defaultLocale: 'en',
      strategy: 'prefix-except-default',
    })
    expect(expanded).toBe(routes)
  })
})
