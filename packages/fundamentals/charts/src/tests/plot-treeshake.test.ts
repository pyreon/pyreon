// "A bar chart never pulls the radial trigonometry, the decimation or the
// time scales." That sentence is in the manifest and on the docs page, and
// only a SIZE budget stood behind it.
//
// A budget answers "did it get bigger". It cannot answer "did it pull the
// wrong module", which is the claim actually being made — a family could be
// dragged in while some other saving hid it under the cap.
//
// Markers are STRING LITERALS from each family, never identifiers: names are
// minified, so `bundle.includes('renderRadar')` is vacuous and passes against
// a bundle that contains the whole radial engine.
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'

const here = dirname(fileURLToPath(import.meta.url))
const PLOT = join(here, '..', '..', 'lib', 'engine.js')
const MAIN = join(here, '..', '..', 'lib', 'index.js')

/** A literal that appears ONLY in the named family's geometry. */
const FAMILY_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['sankey', 'justify'],
  ['calendar (day labels)', 'Mon'],
  ['calendar (month labels)', 'Jan'],
]

async function bundle(imports: readonly string[], from: string = PLOT): Promise<string> {
  // esbuild, not `Bun.build`: vitest runs this under Node, where `Bun` is not
  // defined — the first version failed with `ReferenceError: Bun is not
  // defined` rather than with anything about tree-shaking.
  const entry = join(here, `__ts-entry-${imports.join('-')}.ts`)
  writeFileSync(entry, `export { ${imports.join(', ')} } from '${from.replace(/\\/g, '/')}'\n`)
  try {
    const out = await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      treeShaking: true,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      write: false,
    })
    return out.outputFiles[0]!.text
  } finally {
    rmSync(entry, { force: true })
  }
}

describe.skipIf(!hasBuiltLib(PLOT, "the plot families' tree-shaking"))('plot — the families are tree-shaken, not merely small', () => {
  it('a bar+line chart pulls none of the family geometry', async () => {
    const code = await bundle(['PlotChart', 'bars', 'line'])
    const present = FAMILY_MARKERS.filter(([, m]) => code.includes(`"${m}"`) || code.includes(`'${m}'`))
    expect(present.map(([name]) => name), 'families reached by a bar+line chart').toEqual([])
  })

  it('and the markers are real — importing the family DOES bring them', async () => {
    // Without this the spec above passes just as well against a marker that
    // never appears in any bundle, which is the way a tree-shaking assertion
    // usually rots.
    const code = await bundle(['SankeyChart'])
    expect(code.includes('"justify"') || code.includes("'justify'"), 'the sankey marker is not load-bearing').toBe(true)
  })

  it('a calendar import brings the day and month names a bar chart does not', async () => {
    const code = await bundle(['CalendarChart'])
    expect(code.includes('"Mon"') || code.includes("'Mon'")).toBe(true)
    expect(code.includes('"Jan"') || code.includes("'Jan'")).toBe(true)
  })
})

// `<Chart>` takes its interaction features and its plot host from its
// children (`plot-features.ts`), so the main entry's recipes pay only for
// what they use. The SVG namespace literal lives in the serializer alone,
// which only `<Toolbox>` (save-as-image) brings in.
const SVG_NS = 'http://www.w3.org/2000/svg'

describe.skipIf(!hasBuiltLib(MAIN, "the main entry's feature tree-shaking"))('<Chart> — interactions and hosts come from the children', () => {
  it('<Chart> + <Line> bundles no toolbox and no SVG serializer', async () => {
    const code = await bundle(['Chart', 'Line'], MAIN)
    expect(code.includes(SVG_NS), 'the SVG serializer reached a chart with no <Toolbox>').toBe(false)
  })

  it('and the marker is real — adding <Toolbox> brings the serializer in', async () => {
    const code = await bundle(['Chart', 'Line', 'Toolbox'], MAIN)
    expect(code.includes(SVG_NS), 'the SVG namespace marker is not load-bearing').toBe(true)
  })

  // `bollinger` names its middle line `<label> middle`; the literal lives only
  // in the indicator module, so it shows whether the arithmetic was bundled.
  const hasIndicator = (code: string): boolean => code.includes('" middle"') || code.includes("' middle'")

  it('<Chart> + <Line> bundles no indicator arithmetic', async () => {
    expect(hasIndicator(await bundle(['Chart', 'Line'], MAIN)), 'the indicators reached a chart with none').toBe(false)
  })

  it('and the marker is real — adding <Bollinger> brings it in', async () => {
    expect(hasIndicator(await bundle(['Chart', 'Line', 'Bollinger'], MAIN)), 'the indicator marker is not load-bearing').toBe(true)
  })
})
