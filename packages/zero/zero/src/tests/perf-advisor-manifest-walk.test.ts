/**
 * Deriving per-route JS weight from a Vite manifest.
 *
 * The advisor's whole job is telling an author "this route ships 340kB
 * of JS". Every way that number can be wrong is silent — a plausible
 * figure is reported and the author either relaxes about a route that is
 * actually heavy, or chases weight that is not there.
 *
 * Three specific ways, all covered here:
 *
 *   * **the closure walk must terminate.** A Vite manifest is a graph,
 *     and a real one can contain a cycle (two chunks that import each
 *     other after a shared-module split). The `visited` set is the only
 *     thing between that and a build that hangs with no output.
 *   * **dynamic imports must NOT be counted.** An island or a lazy route
 *     is exactly the JS the author moved OFF the critical path; folding
 *     it back in reports the weight they just eliminated and makes the
 *     advisor argue against its own advice.
 *   * **a shared chunk must be counted ONCE per route.** Two entries
 *     both importing `vendor.js` is the norm, not an edge case; double
 *     counting inflates every route in the report.
 */
import { describe, expect, it } from 'vitest'
import { collectRouteInputsFromManifest, routeLabelForChunk } from '../perf-advisor/manifest-inputs'
import type { ViteManifest } from '../ssg-modulepreload'

const collect = (manifest: ViteManifest, sizes: Record<string, number> = {}, css = '') =>
  collectRouteInputsFromManifest({
    manifest,
    fileSize: (f) => sizes[f] ?? 0,
    readCss: () => css,
    jsBudget: 100_000,
  })

describe('the import closure is walked, once per chunk', () => {
  it('sums the whole STATIC closure, not just the entry', () => {
    // The control: an entry importing a chunk importing another must
    // report all three, or every spec below measures nothing.
    const inputs = collect(
      {
        'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['shared'] },
        shared: { file: 'shared.js', imports: ['deep'] },
        deep: { file: 'deep.js' },
      } as unknown as ViteManifest,
      { 'a.js': 10, 'shared.js': 20, 'deep.js': 30 },
    )
    expect(inputs).toHaveLength(1)
    expect(inputs[0]!.jsBytes).toBe(60)
  })

  it('TERMINATES on a cyclic import graph', () => {
    // Two chunks importing each other. Without the visited set this is
    // an infinite loop inside a build hook — no error, no output, the
    // build simply never finishes.
    const inputs = collect(
      {
        'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['b'] },
        b: { file: 'b.js', imports: ['c'] },
        c: { file: 'c.js', imports: ['b'] },
      } as unknown as ViteManifest,
      { 'a.js': 1, 'b.js': 2, 'c.js': 4 },
    )
    expect(inputs[0]!.jsBytes).toBe(7)
  })

  it('handles a chunk importing ITSELF', () => {
    // The degenerate cycle, which a shared-module split can produce.
    const inputs = collect(
      { 'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['src/a.tsx'] } } as unknown as ViteManifest,
      { 'a.js': 5 },
    )
    expect(inputs[0]!.jsBytes).toBe(5)
  })

  it('counts a DIAMOND-shared chunk exactly once', () => {
    // a → {b, c} → d. Counting `d` twice inflates the route by the size
    // of whatever the two branches happen to share — usually the vendor
    // bundle, i.e. the largest chunk in the build.
    const inputs = collect(
      {
        'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['b', 'c'] },
        b: { file: 'b.js', imports: ['d'] },
        c: { file: 'c.js', imports: ['d'] },
        d: { file: 'd.js' },
      } as unknown as ViteManifest,
      { 'a.js': 1, 'b.js': 2, 'c.js': 4, 'd.js': 100 },
    )
    expect(inputs[0]!.jsBytes, 'the shared chunk must not be double counted').toBe(107)
  })

  it('ignores a DANGLING import key', () => {
    // A manifest referencing a chunk it does not contain — what a
    // partially-written manifest looks like. Must skip, not throw.
    const inputs = collect(
      { 'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['gone'] } } as unknown as ViteManifest,
      { 'a.js': 9 },
    )
    expect(inputs[0]!.jsBytes).toBe(9)
  })

  it('skips a chunk whose file is not JS', () => {
    // A CSS-only or asset chunk in the import graph contributes no JS
    // weight; counting its bytes as script is simply a wrong number.
    const inputs = collect(
      {
        'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', imports: ['style'] },
        style: { file: 'style.css' },
      } as unknown as ViteManifest,
      { 'a.js': 10, 'style.css': 5000 },
    )
    expect(inputs[0]!.jsBytes).toBe(10)
  })
})

describe('dynamic imports stay OFF the route budget', () => {
  it('excludes a lazily-imported chunk', () => {
    // This is the advisor arguing against its own advice if it goes
    // wrong: the author code-split a heavy island precisely to get it
    // off the critical path, and counting it reports no improvement.
    const inputs = collect(
      {
        'src/a.tsx': {
          file: 'a.js', isEntry: true, src: 'src/a.tsx',
          imports: ['small'], dynamicImports: ['huge'],
        },
        small: { file: 'small.js' },
        huge: { file: 'huge.js' },
      } as unknown as ViteManifest,
      { 'a.js': 10, 'small.js': 5, 'huge.js': 900_000 },
    )
    expect(inputs[0]!.jsBytes, 'a lazy chunk is not critical-path weight').toBe(15)
  })
})

describe('only entry chunks become routes', () => {
  it('reports entries and dynamic entries, not plain shared chunks', () => {
    // A vendor chunk is not a route. Listing it produces advice about a
    // "page" no visitor can navigate to.
    const inputs = collect({
      'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx' },
      'src/lazy.tsx': { file: 'lazy.js', isDynamicEntry: true, src: 'src/lazy.tsx' },
      vendor: { file: 'vendor.js' },
    } as unknown as ViteManifest)
    expect(inputs.map((i) => i.path)).toEqual(['src/a.tsx', 'src/lazy.tsx'])
  })

  it('orders routes deterministically', () => {
    // The report is diffed across builds; insertion order would make
    // every build produce a different one.
    const paths = collect({
      'src/z.tsx': { file: 'z.js', isEntry: true, src: 'src/z.tsx' },
      'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx' },
      'src/m.tsx': { file: 'm.js', isEntry: true, src: 'src/m.tsx' },
    } as unknown as ViteManifest).map((i) => i.path)
    expect(paths).toEqual([...paths].sort())
  })

  it('attaches cssText only when the route HAS css', () => {
    // Under exactOptionalPropertyTypes an explicit `undefined` is not the
    // same as absent, and the CLS check branches on presence.
    const withCss = collect(
      { 'src/a.tsx': { file: 'a.js', isEntry: true, src: 'src/a.tsx', css: ['a.css'] } } as unknown as ViteManifest,
      {}, 'body{}',
    )
    const without = collect({
      'src/b.tsx': { file: 'b.js', isEntry: true, src: 'src/b.tsx' },
    } as unknown as ViteManifest)
    expect(withCss[0]!.cssText).toBe('body{}')
    expect('cssText' in without[0]!).toBe(false)
  })

  it('returns nothing for an empty manifest', () => {
    expect(collect({} as ViteManifest)).toEqual([])
  })
})

describe('route labels prefer the source path', () => {
  it('names the entry shell readably', () => {
    // `index.html` in a report tells the author nothing about which page
    // it is.
    expect(routeLabelForChunk('index.html', { file: 'i.js', isEntry: true } as never)).toBe(
      '/ (entry)',
    )
  })

  it('prefers src over the manifest key', () => {
    expect(
      routeLabelForChunk('_hashed-abc', { file: 'x.js', src: 'src/routes/about.tsx' } as never),
    ).toBe('src/routes/about.tsx')
  })

  it('falls back through key and file rather than reporting undefined', () => {
    // A chunk with no `src` is ordinary; a label of `undefined` in the
    // report is not. Note the fallback chain is `??`, so it steps past
    // null/undefined only — an EMPTY key is a value and wins, which is
    // fine because `Object.entries` cannot produce one. The `file` and
    // `'route'` arms are reachable only through a direct call, which is
    // what this asserts.
    expect(routeLabelForChunk('the-key', { file: 'x.js' } as never)).toBe('the-key')
    expect(
      routeLabelForChunk(undefined as unknown as string, { file: 'only-file.js' } as never),
    ).toBe('only-file.js')
    expect(routeLabelForChunk(undefined as unknown as string, {} as never)).toBe('route')
  })
})
