/**
 * `_`-prefixed exports are internal (no semver promise — see "What counts as
 * public API" on the stability page). They live on `@pyreon/zero/internal`
 * (client-safe) and `@pyreon/zero/internal-server` (Node-only), never on a
 * public entry. This locks both halves:
 *
 *   1. no public entry in `package.json#exports` has a `_`-prefixed runtime
 *      export (an entry file's own `export function _x` counts);
 *   2. every `_` helper that zero's plugin GENERATES an import of resolves on
 *      `@pyreon/zero/internal` — the emitted code and this runtime ship in the
 *      same package version, so a rename that misses an emitter fails here
 *      instead of in an app's build.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_DIR = join(import.meta.dirname, '..', '..')
const SRC_DIR = join(PKG_DIR, 'src')
const INTERNAL_KEYS = new Set(['./internal', './internal-server'])

interface ExportConditions {
  bun?: string
}

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
  exports: Record<string, ExportConditions | string>
}

const publicEntries = Object.entries(pkg.exports).filter(
  (entry): entry is [string, ExportConditions & { bun: string }] =>
    !INTERNAL_KEYS.has(entry[0]) && typeof entry[1] === 'object' && typeof entry[1].bun === 'string',
)

describe('@pyreon/zero internal subpaths', () => {
  it('declares ./internal and ./internal-server', () => {
    expect(pkg.exports['./internal']).toEqual({
      bun: './src/internal.ts',
      import: './lib/internal.js',
      types: './lib/types/internal.d.ts',
    })
    expect(pkg.exports['./internal-server']).toEqual({
      bun: './src/internal-server.ts',
      import: './lib/internal-server.js',
      types: './lib/types/internal-server.d.ts',
    })
  })

  it.each(publicEntries)('public entry %s exports no _-prefixed name', async (_key, conds) => {
    const mod = (await import(join(PKG_DIR, conds.bun))) as Record<string, unknown>
    expect(Object.keys(mod).filter((name) => name.startsWith('_'))).toEqual([])
  })

  // Non-underscore internals (test seams and helpers shared between modules)
  // moved off the public entries in the 1.0 API freeze. Each must resolve on
  // its internal subpath and on no public entry.
  const MOVED: Record<'./internal' | './internal-server', readonly string[]> = {
    './internal': [
      'ACTION_QUERY_PARAM',
      'ACTION_REDIRECT_HEADER',
      'ENHANCED_ACTION_HEADER',
      'buildHydrationReport',
      'checkActionOrigin',
      'formActionSearch',
      'islandsOnlyNavigation',
      'matchLocale',
      'readActionPayload',
      'resolveActionOptions',
      'runActionHandler',
      'toRfc822',
      'validateLocale',
    ],
    './internal-server': [
      'ROUTE_MIDDLEWARE_RAN',
      'buildFontFace',
      'buildTextOverlaySvg',
      'clusterPathsByLocale',
      'compareApiRoutePatterns',
      'createIcoFromPngs',
      'emitFontDescriptorModule',
      'fontFormat',
      'fontMimeType',
      'formatLoc',
      'generateAiPluginManifest',
      'generateOpenApiSpec',
      'generatePlaceholder',
      'hashFontFilename',
      'inferFontMeta',
      'isCompressible',
      'isExcluded',
      'matchGlob',
      'parseFontQueryOverrides',
      'parseJpegDimensions',
      'parseWebPDimensions',
      'processImage',
      'renderOgImage',
      'renderOgSvgFromLoaded',
      'resolveHreflangI18n',
      'resolvePlaceholder',
      'resolveQuality',
      'stripLocalePrefix',
    ],
  }
  const allMoved = new Set([...MOVED['./internal'], ...MOVED['./internal-server']])

  it.each(publicEntries)('public entry %s exports none of the moved internals', async (_key, conds) => {
    const mod = (await import(join(PKG_DIR, conds.bun))) as Record<string, unknown>
    expect(Object.keys(mod).filter((name) => allMoved.has(name))).toEqual([])
  })

  it.each(Object.entries(MOVED))('%s exports its moved internals', async (key, names) => {
    const mod = (await import(key === './internal' ? '../internal' : '../internal-server')) as Record<string, unknown>
    expect(names.filter((name) => mod[name] === undefined)).toEqual([])
  })

  it('every helper an emitter imports from @pyreon/zero/internal exists there', async () => {
    const emitted = new Set<string>()
    const importRe = /import \{ (_\w+)(?: as \w+)? \} from ["\\]*@pyreon\/zero\/internal/g
    for (const file of readdirSync(SRC_DIR)) {
      if (!/\.tsx?$/.test(file)) continue
      const text = readFileSync(join(SRC_DIR, file), 'utf8')
      for (const m of text.matchAll(importRe)) emitted.add(m[1]!)
    }
    // actions-transform builds its import from a ternary, not one literal.
    const transform = readFileSync(join(SRC_DIR, 'actions-transform.ts'), 'utf8')
    for (const m of transform.matchAll(/`(_\w+) as \$\{\w+\}`/g)) emitted.add(m[1]!)

    expect([...emitted].sort()).toEqual([
      '_actionStub',
      '_defineActionWithId',
      '_registerActionModules',
      '_registerActionRoutes',
      '_registerI18nConfig',
    ])
    const internal = (await import('../internal')) as Record<string, unknown>
    for (const name of emitted) expect(typeof internal[name], name).toBe('function')
  })
})
