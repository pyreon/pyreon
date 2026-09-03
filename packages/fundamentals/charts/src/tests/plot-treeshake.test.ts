import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * Tree-shake locks for the plot subpath — MARKER-based, with positive
 * controls.
 *
 * The import-budget gate (scripts/check-import-budgets.ts, the three
 * `@pyreon/charts::plot-*` scenarios) locks minimal-import SIZES. This
 * suite locks the SEMANTICS: a minimal import must not contain another
 * family's code, asserted via markers that survive minification —
 * string literals (theme hex defaults, SVG tag fragments) and GLOBAL
 * identifiers (ResizeObserver / requestAnimationFrame), never local
 * symbol names, which a minifier renames (the vacuous-assertion class).
 *
 * Every marker is proven non-vacuous by the CONTROL: a bundle importing
 * the whole surface must CONTAIN each one. Without the control, a
 * marker that minification (or a refactor) removed would make the
 * absence specs pass forever — a probe that cannot fail.
 *
 * Reads lib/ (like bundle-size.test.ts): run `bun run --filter=@pyreon/charts build`
 * after source edits, or the suite measures the previous build.
 */

const here = dirname(fileURLToPath(import.meta.url))
const PLOT_LIB = join(here, '..', '..', 'lib', 'plot.js')
const tmp = mkdtempSync(join(tmpdir(), 'plot-treeshake-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

async function bundle(name: string, source: string): Promise<string> {
  const entry = join(tmp, `${name}.ts`)
  writeFileSync(entry, source)
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['@pyreon/*'],
  })
  return r.outputFiles[0]!.text
}

// Minify-surviving markers, one per family/backend:
const MARKERS = {
  candlestick: 'upColor', // CandleOptions property — property names survive minify; the hex defaults also sit in the shared PALETTE, so they are NOT family-unique
  heat: '#eff6ff', // HEAT_RAMP cold stop in heat.ts
  svg: '<polyline', // template fragment in svg.ts
  canvasHost: 'ResizeObserver', // global — components + radial host
  raf: 'requestAnimationFrame', // global — Chart.tsx animation loop
} as const

const importFrom = (names: string) => `export { ${names} } from ${JSON.stringify(PLOT_LIB)}\n`

describe('plot subpath — tree-shake semantics', () => {
  it('CONTROL: the full surface contains every marker (proves markers are non-vacuous)', async () => {
    const code = await bundle(
      'control',
      importFrom('PlotChart, PieChart, CandlestickChart, HeatmapChart, chartToSvg, bars, line'),
    )
    for (const [family, marker] of Object.entries(MARKERS)) {
      expect(code, `control bundle must contain the ${family} marker`).toContain(marker)
    }
  })

  it('PlotChart + bars + line pulls no candle/heat code', async () => {
    const code = await bundle('cartesian', importFrom('PlotChart, bars, line'))
    expect(code).not.toContain(MARKERS.candlestick)
    expect(code).not.toContain(MARKERS.heat)
    // svg IS expected here, not absent — PlotChart's toolbox saveAsImage
    // calls the SVG serializer directly (Chart.tsx). Unlike the family
    // geometry (imported bindings, genuinely optional), this is a core
    // component's OWN behaviour, always reachable from PlotChart regardless
    // of import shape — and `@pyreon/charts/plot` is a single rolldown
    // chunk with no code-splitting, so a dynamic import doesn't rescue it
    // either (verified: 0 `import(` calls survive in the built lib). See
    // anti-patterns.md "A prop-gated optional feature cannot tree-shake".
    expect(code).toContain(MARKERS.svg)
  })

  it('chartToSvg (server path) pulls no components or browser canvas host', async () => {
    const code = await bundle('server', importFrom('chartToSvg'))
    expect(code).not.toContain(MARKERS.canvasHost)
    expect(code).not.toContain(MARKERS.raf)
    expect(code).not.toContain(MARKERS.candlestick)
  })

  it('PieChart pulls no finance/matrix families or the SVG serializer', async () => {
    const code = await bundle('radial', importFrom('PieChart'))
    expect(code).not.toContain(MARKERS.candlestick)
    expect(code).not.toContain(MARKERS.heat)
    expect(code).not.toContain(MARKERS.svg)
  })
})
