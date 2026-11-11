import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shareImage } from '../kit/assets'
import { langOf } from '../../../vite-plugins/site-pages-content'
import { BENCH_SVGS } from '../pages/benchmarks/BenchmarksPage'
import {
  formatMs,
  formatUs,
  matchesFilter,
  prNumbers,
  scalingRows,
  sortedRowBoard,
  sortSummaries,
  summarizeProduct,
  tally,
} from '../pages/benchmarks/model'
import { emberWordOf } from '../pages/ember'
import { WHY_DIAGRAMS } from '../pages/WhyPage'
import {
  compareVersionsDesc,
  firstSentence,
  mergeReleases,
  parseChangelog,
  parseChangeset,
  summarizeChangesets,
} from '../releases/parse'

const pages = resolve(__dirname, '../content/pages')
const assets = resolve(__dirname, '../media')
const json = (rel: string) => JSON.parse(readFileSync(resolve(pages, rel), 'utf8'))
const filesIn = (dir: string) => readdirSync(resolve(pages, dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_'))

// ─── content ──────────────────────────────────────────────────────────────

const SECTION_KINDS = ['proof', 'diff', 'code', 'story', 'steps', 'list', 'quote', 'compare-strip', 'faq', 'links', 'note', 'table', 'logos', 'palette', 'type', 'dodont']

describe('page content in the app', () => {
  const sitemap = json('_sitemap.json') as { sections: { pages: { route: string; template: string; content: string | null }[] }[] }
  const routes = sitemap.sections.flatMap((s) => s.pages)

  it.each([
    ['why', 'story'],
    ['compare', 'compare'],
    ['migrate', 'migrate'],
  ])('every %s route in the sitemap has its page file, and no file is orphaned', (family, template) => {
    const wanted = routes
      .filter((r) => r.template === template && r.route.startsWith(`/${family}/`))
      .map((r) => r.route.slice(family.length + 2))
    expect(wanted.length).toBeGreaterThan(0)
    expect(filesIn(family).map((f) => f.slice(0, -5)).sort()).toEqual(wanted.sort())
  })

  it('every project page in the sitemap has its page file', () => {
    for (const id of ['status', 'releases', 'community', 'brand']) {
      expect(routes.some((r) => r.route === `/${id}`)).toBe(true)
      expect(existsSync(resolve(pages, `project/${id}.json`))).toBe(true)
    }
  })

  it('every section kind is one the renderer knows', () => {
    const unknown: string[] = []
    for (const dir of ['why', 'project']) {
      for (const f of filesIn(dir)) {
        for (const s of json(`${dir}/${f}`).sections as { kind: string }[]) if (!SECTION_KINDS.includes(s.kind)) unknown.push(`${dir}/${f}: ${s.kind}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('every compare row carries a known verdict and a source', () => {
    for (const f of filesIn('compare')) {
      for (const r of json(`compare/${f}`).table.rows as { verdict: string; source: string }[]) {
        expect(['pyreon', 'rival', 'tie', 'different'], f).toContain(r.verdict)
        expect(r.source.length, f).toBeGreaterThan(0)
      }
    }
  })

  it('the migrate pages never call a compat layer "drop-in"', () => {
    const all = readdirSync(resolve(pages, 'migrate')).map((f) => readFileSync(resolve(pages, 'migrate', f), 'utf8')).join('\n')
    expect(all.toLowerCase()).not.toContain('drop-in')
  })

  it('every diagram and chart the templates place is in the asset folder', () => {
    const files = [...Object.values(WHY_DIAGRAMS).flatMap((slots) => slots.map((s) => s.file)), ...Object.values(BENCH_SVGS)]
    for (const f of filesIn('compare')) files.push(`compare/${f.replace('.json', '.svg')}`)
    for (const f of filesIn('migrate')) files.push(`migrate/${f.replace('.json', '.svg')}`)
    files.push('migrate/landing-steps.svg')
    for (const f of files) expect(existsSync(resolve(assets, f)), f).toBe(true)
  })

  it('every page has a share image', () => {
    for (const r of routes.filter((p) => /^\/(why|compare|migrate)\/|^\/(benchmarks|status|releases|community|brand|migrate)$/.test(p.route))) {
      expect(shareImage(r.route).url, r.route).not.toMatch(/og\/default\.png$/)
    }
  })
})

// ─── helpers ──────────────────────────────────────────────────────────────

describe('emberWordOf', () => {
  it('picks the first measured figure', () => {
    expect(emberWordOf('React ships 4× more JavaScript for the same app.')).toBe('4×')
    expect(emberWordOf('2,047 components. Mounted 3× faster than Svelte 5.')).toBe('3×')
    expect(emberWordOf('Up to 2.0–2.1× faster')).toBe('2.0–2.1×')
  })
  it('falls back to the last word', () => {
    expect(emberWordOf('Your component runs once. Ever.')).toBe('Ever.')
  })
})

describe('langOf (build-time highlighting)', () => {
  it('reads lang, then the file extension, then guesses', () => {
    expect(langOf({ lang: 'sh', code: 'x' })).toBe('bash')
    expect(langOf({ lang: 'kotlin', code: 'x' })).toBe('kotlin')
    expect(langOf({ lang: 'nonsense', code: 'x' })).toBe('text')
    expect(langOf({ file: 'Search.vue', code: 'x' })).toBe('vue')
    expect(langOf({ file: 'vite.config.ts', code: 'x' })).toBe('typescript')
    expect(langOf({ code: 'npm install @pyreon/react-compat' })).toBe('bash')
    expect(langOf({ code: 'const a = signal(0)' })).toBe('tsx')
  })
})

describe('benchmarks model', () => {
  it('sorts the row board fastest first and keeps names aligned', () => {
    expect(sortedRowBoard(['A', 'B', 'C'], [3, 1, 2])).toEqual([
      { name: 'B', ms: 1 },
      { name: 'C', ms: 2 },
      { name: 'A', ms: 3 },
    ])
    expect(sortedRowBoard(['A', 'B'], [1])).toEqual([{ name: 'A', ms: 1 }])
  })
  it('formats times', () => {
    expect(formatMs(0.705)).toBe('705 µs')
    expect(formatMs(0.005)).toBe('5 µs')
    expect(formatMs(7.26)).toBe('7.26 ms')
    expect(formatMs(72.64)).toBe('72.6 ms')
    expect(formatUs(0.426)).toBe('0.426 µs')
    expect(formatUs(15980)).toBe('15.98 ms')
  })
  it('builds scaling rows per size', () => {
    expect(scalingRows(['100', '1,000'], { Pyreon: [1, 2], Solid: [3, 4] })).toEqual([
      { size: '100 rows', Pyreon: 1, Solid: 3 },
      { size: '1,000 rows', Pyreon: 2, Solid: 4 },
    ])
  })
  const row = (verdict: string) => ({ op: verdict + Math.random(), pyreon: 1, rival: 2, unit: 'ms' as const, verdict: verdict as 'win', label: '' })
  const product = (id: string, verdicts: string[] | null) => ({
    id,
    name: id,
    benchmarks: verdicts ? { rival: 'vs X', run: 'one run', h: `${id} headline`, p: '', rows: verdicts.map(row) } : null,
  })
  it('summarizes a product: counts, flags, link to its benchmarks section', () => {
    const s = summarizeProduct(product('form', ['win', 'win', 'loss', 'info']))!
    expect(s.counts).toEqual({ win: 2, tie: 0, split: 0, loss: 1, info: 1 })
    expect(s.href).toBe('/products/form#benchmarks')
    expect([s.wins, s.losses, s.infoOnly]).toEqual([true, true, false])
    expect(tally(s.counts)).toBe('2 wins · 1 loss · 1 measurement')
    expect(summarizeProduct(product('none', null))).toBeNull()
    expect(summarizeProduct(product('empty', []))).toBeNull()
  })
  it('an unknown verdict counts as a measurement, never a win', () => {
    expect(summarizeProduct(product('x', ['fastest']))!.counts.info).toBe(1)
  })
  it('filters and sorts the product cards', () => {
    const list = [product('b', ['info']), product('a', ['loss']), product('c', ['win'])].map((p) => summarizeProduct(p)!)
    expect(list.filter((s) => matchesFilter(s, 'loss')).map((s) => s.id)).toEqual(['a'])
    expect(list.filter((s) => matchesFilter(s, 'info')).map((s) => s.id)).toEqual(['b'])
    expect(list.filter((s) => matchesFilter(s, 'all'))).toHaveLength(3)
    expect(sortSummaries(list).map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })
  it('extracts pull request numbers', () => {
    expect(prNumbers('#2878, #2864')).toEqual([2878, 2864])
    expect(prNumbers('none')).toEqual([])
  })
})

// ─── releases ─────────────────────────────────────────────────────────────

const CHANGELOG = `# @pyreon/core

## 0.53.0

### Minor Changes

- [#3865](https://github.com/pyreon/pyreon/pull/3865) [\`8fa9de5\`](https://x) Thanks [@v](https://github.com/v)! - Move the hook lowerings to their plugins. More detail here.

  A continuation paragraph that is not the summary.

### Patch Changes

- [#3866](https://github.com/pyreon/pyreon/pull/3866) [\`62e0aad\`](https://x) Thanks [@v](https://github.com/v)! - Apply \`checked.\` props as live DOM state.
- Updated dependencies [[\`c933f92\`](https://x)]:
  - @pyreon/reactivity@0.53.0

## 0.52.0

### Patch Changes

- [#3700](https://github.com/pyreon/pyreon/pull/3700) [\`aaa\`](https://x) Thanks [@v](https://github.com/v)! - Fix a thing
`

describe('release history', () => {
  it('takes the first sentence, keeping inline code intact', () => {
    expect(firstSentence('Apply `checked.` props as live DOM state. Then more.')).toBe('Apply `checked.` props as live DOM state.')
    expect(firstSentence('**Bold** [link](https://x) text')).toBe('Bold link text')
    const long = firstSentence(`${'word '.repeat(60)}\`code span that is long\` end`)
    expect(long.length).toBeLessThanOrEqual(221)
    expect((long.match(/`/g) ?? []).length % 2).toBe(0)
  })
  it('parses a changesets CHANGELOG, skipping dependency bumps', () => {
    const v = parseChangelog('@pyreon/core', CHANGELOG)
    expect([...v.keys()]).toEqual(['0.53.0', '0.52.0'])
    expect(v.get('0.53.0')).toEqual([
      { pr: 3865, bump: 'minor', summary: 'Move the hook lowerings to their plugins.', packages: ['@pyreon/core'] },
      { pr: 3866, bump: 'patch', summary: 'Apply `checked.` props as live DOM state.', packages: ['@pyreon/core'] },
    ])
  })
  it('merges packages per pull request, newest version first, capped', () => {
    const other = CHANGELOG.replace('# @pyreon/core', '# @pyreon/form')
    const r = mergeReleases(
      [
        { pkg: '@pyreon/core', md: CHANGELOG },
        { pkg: '@pyreon/form', md: other },
      ],
      1,
      (v) => (v === '0.53.0' ? '2026-10-13' : null),
      1,
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ version: '0.53.0', date: '2026-10-13', minor: 1, patch: 1 })
    expect(r[0]!.entries).toEqual([{ pr: 3865, bump: 'minor', summary: 'Move the hook lowerings to their plugins.', packages: ['@pyreon/core', '@pyreon/form'] }])
  })
  it('orders versions semantically', () => {
    expect(['0.9.0', '0.10.0', '0.53.1', '0.53.0'].sort(compareVersionsDesc)).toEqual(['0.53.1', '0.53.0', '0.10.0', '0.9.0'])
  })
  it('summarizes pending changesets', () => {
    expect(parseChangeset('---\n"@pyreon/a": minor\n\'@pyreon/b\': patch\n---\n\nText')).toEqual({
      packages: [
        { name: '@pyreon/a', bump: 'minor' },
        { name: '@pyreon/b', bump: 'patch' },
      ],
    })
    expect(parseChangeset('no front matter')).toBeNull()
    const u = summarizeChangesets(['---\n"@pyreon/a": minor\n---\nx', '---\n"@pyreon/a": patch\n"@pyreon/b": patch\n---\ny', '---\n---\nempty'])
    expect(u).toEqual({ count: 2, minor: 1, patch: 1, packages: [{ name: '@pyreon/a', count: 2 }, { name: '@pyreon/b', count: 1 }] })
  })
})
