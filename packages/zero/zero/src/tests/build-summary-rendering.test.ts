/**
 * The production build summary's rendering, and the shapes that make it
 * lie.
 *
 * This block is what a developer reads after every `zero build`, and it
 * is the only place bundle sizes are surfaced at all. Its failures are
 * quiet by nature: a truncated filename that hides which entry grew, a
 * missing gzip column that makes a compressed asset look four times its
 * shipped size, or a sort that puts the wrong asset at the top of a list
 * people only read the top of.
 *
 * The gzip fallback is the sharpest one. Not every asset is compressible,
 * so `gzipBytes` is legitimately null — and the sort falls back to raw
 * bytes for those. A sort that treated null as zero would push every
 * image and font to the bottom regardless of size, which is exactly
 * backwards for the thing people scan this table to find.
 */
import { describe, expect, it } from 'vitest'
import { formatBuildSummary, formatKB, type BuildStats } from '../build-summary'

const asset = (
  file: string,
  bytes: number,
  gzipBytes: number | null = null,
  entry = false,
): BuildStats['clientAssets'][number] =>
  ({ file, bytes, gzipBytes, entry, kind: file.endsWith('.css') ? 'css' : 'js' }) as never

const stats = (over: Partial<BuildStats> = {}): BuildStats =>
  ({
    clientAssets: [],
    server: [],
    prerendered: { count: 0, paths: [] },
    routes: [],
    ...over,
  }) as unknown as BuildStats

const render = (s: BuildStats, o = {}): string => formatBuildSummary(s, o).join('\n')

describe('assets are ordered so the top of the list is the useful part', () => {
  it('puts ENTRY assets first, whatever their size', () => {
    // The entry is what every page loads; a 2 kB entry below a 400 kB
    // lazy chunk is technically sorted and practically useless.
    const out = render(
      stats({ clientAssets: [asset('lazy.js', 400_000, 100_000), asset('entry.js', 2000, 800, true)] }),
    )
    expect(out.indexOf('entry.js'), 'entry before the bigger chunk').toBeLessThan(
      out.indexOf('lazy.js'),
    )
  })

  it('sorts by GZIP size when it is known', () => {
    // Gzip is what ships. Sorting by raw would rank a highly-compressible
    // file above one that costs more on the wire.
    const out = render(
      stats({ clientAssets: [asset('a.js', 100_000, 5_000), asset('b.js', 50_000, 40_000)] }),
    )
    expect(out.indexOf('b.js'), 'b gzips larger').toBeLessThan(out.indexOf('a.js'))
  })

  it('falls back to RAW bytes for an asset with no gzip figure', () => {
    // Images and fonts are not compressible, so `gzipBytes` is null for
    // them. Treating null as zero would sink every one of them to the
    // bottom regardless of how big it is.
    const out = render(
      stats({ clientAssets: [asset('small.js', 1_000, 900), asset('huge.png', 900_000, null)] }),
    )
    expect(out.indexOf('huge.png'), 'the 900 kB image ranks first').toBeLessThan(
      out.indexOf('small.js'),
    )
  })

  it('omits the gzip column for an asset that has none, rather than printing 0', () => {
    // `0.0 kB` next to a 900 kB image reads as a measurement, not an
    // absence.
    const out = render(stats({ clientAssets: [asset('huge.png', 900_000, null)] }))
    const line = out.split('\n').find((l) => l.includes('huge.png'))!
    expect(line).not.toContain('gzip')
  })
})

describe('long filenames are truncated from the LEFT', () => {
  it('keeps the tail, which is the part that identifies the file', () => {
    // A hashed asset path is `assets/…/name-a1b2c3.js`; truncating from
    // the right would leave every row reading `assets/chunks/very-long…`
    // and identify nothing.
    const long = `assets/deeply/nested/path/that/goes/on/${'x'.repeat(40)}/bundle-a1b2c3.js`
    const out = render(stats({ clientAssets: [asset(long, 1000, 500)] }))

    expect(out, 'the identifying tail survives').toContain('bundle-a1b2c3.js')
    expect(out, 'and it is marked as truncated').toContain('…')
  })

  it('leaves a short filename untouched', () => {
    // The control: a truncator that always fired would mangle every row.
    const out = render(stats({ clientAssets: [asset('app.js', 1000, 500)] }))
    expect(out).toContain('app.js')
    expect(out.split('\n').find((l) => l.includes('app.js'))).not.toContain('…')
  })
})

describe('the tail collapses instead of printing everything', () => {
  it('lists maxRows assets and summarises the rest with a byte total', () => {
    // A build with 300 chunks would otherwise print 300 lines and bury
    // everything above it.
    const many = Array.from({ length: 30 }, (_, i) => asset(`chunk-${i}.js`, 1000 * (i + 1), 100))
    const out = render(stats({ clientAssets: many }), { maxRows: 5 })

    expect(out).toContain('more')
    expect(out.split('\n').filter((l) => l.includes('chunk-')).length).toBeLessThanOrEqual(6)
  })

  it('does not print a tail line when everything fits', () => {
    const out = render(stats({ clientAssets: [asset('a.js', 1, 1)] }), { maxRows: 20 })
    expect(out).not.toContain('more (')
  })
})

describe('colour is opt-in and off by default', () => {
  const ESC = String.fromCharCode(27)

  it('emits no escape codes at level 0', () => {
    // The default. A summary captured into a CI log must stay greppable.
    expect(render(stats({ clientAssets: [asset('a.js', 1000, 500)] }))).not.toContain(ESC)
  })

  it('emits them when a colour level is requested', () => {
    // The control for the above.
    const out = render(stats({ clientAssets: [asset('a.js', 1000, 500)] }), { color: 3 })
    expect(out).toContain(ESC)
  })
})

describe('formatKB is readable at every magnitude', () => {
  it('renders bytes, kilobytes and megabytes without NaN or -0', () => {
    for (const n of [0, 1, 999, 1024, 1_500_000]) {
      const s = formatKB(n)
      expect(s, String(n)).not.toContain('NaN')
      expect(s.length, String(n)).toBeGreaterThan(0)
    }
  })
})

describe('the prerender line appears only when there is something to say', () => {
  it('reports a prerendered count', () => {
    const out = render(stats({ prerendered: { count: 12, paths: [] } as never }))
    expect(out).toContain('12')
  })

  it('says nothing when nothing was prerendered', () => {
    // An SSR-only build has no prerendered pages; a "0 prerendered" line
    // is noise that reads as a failure.
    const out = render(stats({ prerendered: { count: 0, paths: [] } as never }))
    expect(out.toLowerCase()).not.toContain('prerender')
  })
})
