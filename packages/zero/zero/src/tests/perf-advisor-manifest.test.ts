import { describe, expect, it } from 'vitest'
import type { ViteManifest } from '../ssg-modulepreload'
import { runAdvisor } from '../perf-advisor/checks'
import { collectRouteInputsFromManifest } from '../perf-advisor/manifest-inputs'
import { buildAdvisorArtifact, formatAdvisorReport } from '../perf-advisor/report'

// Realistic manifest: an entry shell, two route dynamic-entries sharing a
// big chunk, and a route that DYNAMIC-imports an island. The island is a
// dynamic-entry too — its bytes must NOT count toward the importing route's
// static closure (the islands-safe rule).
const MANIFEST: ViteManifest = {
  'index.html': {
    file: 'assets/entry-AAA.js',
    isEntry: true,
    imports: ['_shared'],
    css: ['assets/entry.css'],
  },
  _shared: { file: 'assets/shared-CCC.js' },
  'src/routes/about.tsx': {
    file: 'assets/about-BBB.js',
    isDynamicEntry: true,
    src: 'src/routes/about.tsx',
    imports: ['_shared'],
    css: ['assets/about.css'],
  },
  'src/routes/heavy.tsx': {
    file: 'assets/heavy-DDD.js',
    isDynamicEntry: true,
    src: 'src/routes/heavy.tsx',
    imports: ['_shared'],
    dynamicImports: ['src/island.tsx'],
  },
  'src/island.tsx': {
    file: 'assets/island-EEE.js',
    isDynamicEntry: true,
    src: 'src/island.tsx',
  },
}

const SIZES: Record<string, number> = {
  'assets/entry-AAA.js': 20_000,
  'assets/shared-CCC.js': 80_000,
  'assets/about-BBB.js': 5_000,
  'assets/heavy-DDD.js': 60_000,
  'assets/island-EEE.js': 90_000,
}
const fileSize = (f: string): number => SIZES[f] ?? 0

const CSS: Record<string, string> = {
  'assets/about.css': '.a{content-visibility:auto}', // CLS footgun
  'assets/entry.css': '.e{color:red}',
}
const readCss = (files: readonly string[]): string => files.map((f) => CSS[f] ?? '').join('\n')

function collect(jsBudget = 120_000) {
  return collectRouteInputsFromManifest({ manifest: MANIFEST, fileSize, readCss, jsBudget })
}

describe('perf-advisor — collectRouteInputsFromManifest', () => {
  it('emits one input per entry/dynamic-entry chunk, sorted by label', () => {
    const inputs = collect()
    expect(inputs.map((i) => i.path)).toEqual([
      '/ (entry)',
      'src/island.tsx',
      'src/routes/about.tsx',
      'src/routes/heavy.tsx',
    ])
  })

  it('jsBytes is the STATIC closure sum (shared chunk included)', () => {
    const heavy = collect().find((i) => i.path === 'src/routes/heavy.tsx')!
    // heavy(60k) + shared(80k) = 140k — island(90k) is a dynamicImport, excluded.
    expect(heavy.jsBytes).toBe(140_000)
  })

  it('does NOT follow dynamicImports (island bytes excluded from the route)', () => {
    const heavy = collect().find((i) => i.path === 'src/routes/heavy.tsx')!
    expect(heavy.jsBytes).not.toBe(230_000) // would be 140k + island 90k if followed
    const island = collect().find((i) => i.path === 'src/island.tsx')!
    expect(island.jsBytes).toBe(90_000) // island reported on its own
  })

  it('attributes closure CSS text for the CLS scan', () => {
    const about = collect().find((i) => i.path === 'src/routes/about.tsx')!
    expect(about.cssText).toContain('content-visibility:auto')
  })
})

describe('perf-advisor — end-to-end over the fixture manifest', () => {
  it('runAdvisor flags the over-budget route and the CLS-footgun route', () => {
    const results = runAdvisor(collect(120_000))
    const byPath = Object.fromEntries(results.map((r) => [r.path, r.findings.map((f) => f.check)]))
    expect(byPath['src/routes/heavy.tsx']).toContain('route-js-budget')
    expect(byPath['src/routes/about.tsx']).toContain('cls-footgun')
    // entry (100k) is under budget; island (90k, no css) is clean → absent.
    expect(byPath['/ (entry)']).toBeUndefined()
    expect(byPath['src/island.tsx']).toBeUndefined()
  })

  it('formatAdvisorReport renders findings + is empty for a clean build', () => {
    const report = formatAdvisorReport(runAdvisor(collect(120_000)))
    expect(report).toContain('Pyreon perf advisor')
    expect(report).toContain('src/routes/heavy.tsx')
    expect(report).toContain('route-js-budget')
    expect(report).toContain('advisory')
    // A generous budget + no footguns → silent.
    expect(formatAdvisorReport(runAdvisor(collect(10_000_000).map((i) => ({ ...i, cssText: undefined }))))).toBe('')
  })

  it('buildAdvisorArtifact wraps results under { routes }', () => {
    const art = buildAdvisorArtifact(runAdvisor(collect(120_000)))
    expect(Array.isArray(art.routes)).toBe(true)
    expect(art.routes.length).toBeGreaterThan(0)
  })
})
