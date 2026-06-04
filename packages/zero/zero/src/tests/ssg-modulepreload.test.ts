import { describe, expect, it } from 'vitest'
import {
  type ViteManifest,
  collectStaticChunkClosure,
  computeEntryHrefs,
  computeRoutePreloadHrefs,
  joinBase,
  parseExistingModulePreloads,
  renderModulePreloadLinks,
  resolveManifestKey,
} from '../ssg-modulepreload'

// A simple posix `relative` stand-in for the tests (the real callers pass
// node:path's `relative`). Works for the absolute-under-root shapes used here.
const rel = (from: string, to: string): string =>
  to.startsWith(from + '/') ? to.slice(from.length + 1) : to

describe('collectStaticChunkClosure — STATIC imports only (islands gate)', () => {
  const manifest: ViteManifest = {
    'src/routes/dashboard.tsx': {
      file: 'assets/dashboard-AAA.js',
      src: 'src/routes/dashboard.tsx',
      isDynamicEntry: true,
      imports: ['_shared-BBB.js'],
      // An ISLAND lazy-imported by the route — MUST NOT be preloaded.
      dynamicImports: ['src/components/HeavyIsland.tsx'],
    },
    '_shared-BBB.js': {
      file: 'assets/shared-BBB.js',
      imports: ['_vendor-CCC.js'],
    },
    '_vendor-CCC.js': { file: 'assets/vendor-CCC.js' },
    'src/components/HeavyIsland.tsx': {
      file: 'assets/HeavyIsland-DDD.js',
      isDynamicEntry: true,
    },
  }

  it('follows static imports transitively', () => {
    const files = collectStaticChunkClosure(manifest, ['src/routes/dashboard.tsx'])
    expect([...files].sort()).toEqual([
      'assets/dashboard-AAA.js',
      'assets/shared-BBB.js',
      'assets/vendor-CCC.js',
    ])
  })

  it('NEVER follows dynamicImports — the island chunk is absent', () => {
    const files = collectStaticChunkClosure(manifest, ['src/routes/dashboard.tsx'])
    expect(files.has('assets/HeavyIsland-DDD.js')).toBe(false)
  })

  it('is cycle-safe (a → b → a)', () => {
    const cyclic: ViteManifest = {
      a: { file: 'a.js', imports: ['b'] },
      b: { file: 'b.js', imports: ['a'] },
    }
    const files = collectStaticChunkClosure(cyclic, ['a'])
    expect([...files].sort()).toEqual(['a.js', 'b.js'])
  })

  it('skips unknown keys without throwing', () => {
    expect(collectStaticChunkClosure(manifest, ['does/not/exist.tsx']).size).toBe(0)
  })
})

describe('resolveManifestKey', () => {
  const root = '/abs/project'
  const manifest: ViteManifest = {
    'src/routes/about.tsx': { file: 'assets/about-X.js', src: 'src/routes/about.tsx' },
  }

  it('resolves via root-relative posix path (primary)', () => {
    const key = resolveManifestKey(manifest, '/abs/project/src/routes/about.tsx', root, rel)
    expect(key).toBe('src/routes/about.tsx')
  })

  it('falls back to a longest-suffix match when the key prefix differs', () => {
    const m: ViteManifest = { 'routes/about.tsx': { file: 'assets/about-X.js' } }
    const key = resolveManifestKey(m, '/abs/project/src/routes/about.tsx', root, rel)
    expect(key).toBe('routes/about.tsx')
  })

  it('returns null when no chunk corresponds (→ graceful no preload)', () => {
    const key = resolveManifestKey(manifest, '/abs/project/src/routes/ghost.tsx', root, rel)
    expect(key).toBeNull()
  })

  it('falls back to a `src`-field match when the key differs from the source path', () => {
    const m: ViteManifest = {
      'chunk-XYZ.js': { file: 'assets/about-X.js', src: 'src/routes/about.tsx' },
    }
    const key = resolveManifestKey(m, '/abs/project/src/routes/about.tsx', root, rel)
    expect(key).toBe('chunk-XYZ.js')
  })

  it('handles a relative path starting with `..` (module outside root) via suffix fallback', () => {
    const m: ViteManifest = { 'packages/x/Comp.tsx': { file: 'assets/Comp-X.js' } }
    const dotdotRel = () => '../other/packages/x/Comp.tsx' // exercises the `!rel.startsWith('..')` guard
    const key = resolveManifestKey(m, '/abs/other/packages/x/Comp.tsx', '/abs/project', dotdotRel)
    expect(key).toBe('packages/x/Comp.tsx')
  })
})

describe('computeEntryHrefs — no entry chunk', () => {
  it('returns an empty set when the manifest has no isEntry chunk', () => {
    const m: ViteManifest = { '_shared.js': { file: 'assets/shared.js' } }
    expect(computeEntryHrefs(m, '/').size).toBe(0)
  })
})

describe('computeRoutePreloadHrefs — end to end', () => {
  const root = '/abs/project'
  const manifest: ViteManifest = {
    'src/routes/_layout.tsx': {
      file: 'assets/layout-L.js',
      src: 'src/routes/_layout.tsx',
      imports: ['_shared-S.js'],
    },
    'src/routes/posts.tsx': {
      file: 'assets/posts-P.js',
      src: 'src/routes/posts.tsx',
      imports: ['_shared-S.js'],
      dynamicImports: ['src/components/Comments.tsx'], // island — excluded
    },
    '_shared-S.js': { file: 'assets/shared-S.js' },
    'src/components/Comments.tsx': { file: 'assets/Comments-C.js' },
  }

  it('preloads the matched chain (layout + page) static closure, excludes the island', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/abs/project/src/routes/_layout.tsx', '/abs/project/src/routes/posts.tsx'],
      root,
      base: '/',
      alreadyPreloaded: new Set(),
      relativeFn: rel,
    })
    expect(hrefs).toEqual([
      '/assets/layout-L.js',
      '/assets/posts-P.js',
      '/assets/shared-S.js',
    ])
    expect(hrefs).not.toContain('/assets/Comments-C.js') // island stays deferred
  })

  it('subtracts chunks the template entry graph already preloads', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/abs/project/src/routes/posts.tsx'],
      root,
      base: '/',
      alreadyPreloaded: new Set(['/assets/shared-S.js']), // entry already preloads it
      relativeFn: rel,
    })
    expect(hrefs).toEqual(['/assets/posts-P.js'])
  })

  it('applies the deploy base prefix', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/abs/project/src/routes/posts.tsx'],
      root,
      base: '/blog/',
      alreadyPreloaded: new Set(),
      relativeFn: rel,
    })
    expect(hrefs).toContain('/blog/assets/posts-P.js')
    expect(hrefs).toContain('/blog/assets/shared-S.js')
  })

  it('returns [] when no route module resolves (graceful)', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/abs/project/src/routes/ghost.tsx'],
      root,
      base: '/',
      alreadyPreloaded: new Set(),
      relativeFn: rel,
    })
    expect(hrefs).toEqual([])
  })
})

// Mirrors the ACTUAL Vite manifest shape observed from a real ssr-showcase SSG
// build: every route's `imports` includes `index.html` (the entry key), so a
// route's raw static closure pulls in the whole entry graph. The entry-delta
// subtraction must leave only the route's own late-discovered chunk(s), and the
// island (a `dynamicImports` of the route) must never appear.
describe('real-manifest-shape — entry delta + islands gate', () => {
  const root = '/app'
  const manifest: ViteManifest = {
    'index.html': {
      file: 'assets/index-ENTRY.js',
      isEntry: true,
      imports: ['_h-SHARED.js'],
      dynamicImports: ['src/routes/about.ts', 'src/routes/island-demo.tsx'],
    },
    '_h-SHARED.js': { file: 'assets/h-SHARED.js' },
    'src/routes/about.ts': {
      file: 'assets/about-ROUTE.js',
      src: 'src/routes/about.ts',
      isDynamicEntry: true,
      imports: ['index.html', '_h-SHARED.js'], // <- pulls the entry graph
    },
    'src/routes/island-demo.tsx': {
      file: 'assets/island-demo-ROUTE.js',
      src: 'src/routes/island-demo.tsx',
      isDynamicEntry: true,
      imports: ['index.html', '_h-SHARED.js'],
      dynamicImports: ['src/components/IslandProbe.tsx'], // <- the island
    },
    'src/components/IslandProbe.tsx': {
      file: 'assets/IslandProbe-ISLAND.js',
      isDynamicEntry: true,
    },
  }

  const entryHrefs = computeEntryHrefs(manifest, '/')

  it('entry delta leaves ONLY the route chunk (entry + shared subtracted)', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/app/src/routes/about.ts'],
      root,
      base: '/',
      alreadyPreloaded: entryHrefs,
      relativeFn: (f, t) => (t.startsWith(f + '/') ? t.slice(f.length + 1) : t),
    })
    expect(hrefs).toEqual(['/assets/about-ROUTE.js'])
    expect(hrefs).not.toContain('/assets/index-ENTRY.js')
    expect(hrefs).not.toContain('/assets/h-SHARED.js')
  })

  it('island route preloads its own chunk but NEVER the island chunk', () => {
    const hrefs = computeRoutePreloadHrefs({
      manifest,
      routeModules: ['/app/src/routes/island-demo.tsx'],
      root,
      base: '/',
      alreadyPreloaded: entryHrefs,
      relativeFn: (f, t) => (t.startsWith(f + '/') ? t.slice(f.length + 1) : t),
    })
    expect(hrefs).toEqual(['/assets/island-demo-ROUTE.js'])
    expect(hrefs).not.toContain('/assets/IslandProbe-ISLAND.js') // deferred — stays off critical path
  })

  it('computeEntryHrefs captures the entry static closure', () => {
    expect(entryHrefs).toEqual(new Set(['/assets/index-ENTRY.js', '/assets/h-SHARED.js']))
  })
})

describe('parseExistingModulePreloads', () => {
  it('extracts every modulepreload href from the template', () => {
    const html = `<head>
      <link rel="modulepreload" href="/assets/index-E.js" crossorigin>
      <link rel="stylesheet" href="/assets/style-S.css">
      <link rel='modulepreload' href='/assets/vendor-V.js'>
    </head>`
    const set = parseExistingModulePreloads(html)
    expect(set.has('/assets/index-E.js')).toBe(true)
    expect(set.has('/assets/vendor-V.js')).toBe(true)
    expect(set.has('/assets/style-S.css')).toBe(false) // stylesheet, not modulepreload
    expect(set.size).toBe(2)
  })

  it('returns an empty set when there are none', () => {
    expect(parseExistingModulePreloads('<head></head>').size).toBe(0)
  })
})

describe('joinBase / renderModulePreloadLinks', () => {
  it('joins base + file handling trailing/leading slashes', () => {
    expect(joinBase('/', 'assets/x.js')).toBe('/assets/x.js')
    expect(joinBase('/blog/', 'assets/x.js')).toBe('/blog/assets/x.js')
    expect(joinBase('/blog', '/assets/x.js')).toBe('/blog/assets/x.js')
  })

  it('renders crossorigin modulepreload tags', () => {
    expect(renderModulePreloadLinks(['/assets/a.js', '/assets/b.js'])).toBe(
      '<link rel="modulepreload" href="/assets/a.js" crossorigin>\n' +
        '<link rel="modulepreload" href="/assets/b.js" crossorigin>',
    )
  })

  it('renders nothing for an empty list', () => {
    expect(renderModulePreloadLinks([])).toBe('')
  })
})
