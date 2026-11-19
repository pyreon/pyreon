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
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'

const here = dirname(fileURLToPath(import.meta.url))
const PLOT = join(here, '..', '..', 'lib', 'engine.js')
const MAIN = join(here, '..', '..', 'lib', 'index.js')
const SVG = join(here, '..', '..', 'lib', 'svg.js')

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

  // Per-datum colour is two imported bindings; each descriptor names itself
  // (`kind: 'shade-by'` / `'fill-by'`), and that literal lives only in
  // `item-colors.ts`, so it shows whether the ramp arithmetic was bundled.
  const hasLiteral = (code: string, lit: string): boolean => code.includes(`"${lit}"`) || code.includes(`'${lit}'`)

  it('<Chart> + <Bar> + <Line> bundles no per-datum colour code', async () => {
    const code = await bundle(['Chart', 'Bar', 'Line'], MAIN)
    expect(hasLiteral(code, 'shade-by'), 'shadeBy reached a chart that never colours a datum').toBe(false)
    expect(hasLiteral(code, 'fill-by'), 'fillBy reached a chart that never colours a datum').toBe(false)
  })

  it('and the markers are real — importing shadeBy / fillBy brings them in, each without the other', async () => {
    const shade = await bundle(['Chart', 'Bar', 'shadeBy'], MAIN)
    expect(hasLiteral(shade, 'shade-by'), 'the shadeBy marker is not load-bearing').toBe(true)
    expect(hasLiteral(shade, 'fill-by'), 'fillBy came along with shadeBy').toBe(false)
    const fill = await bundle(['Chart', 'Bar', 'fillBy'], MAIN)
    expect(hasLiteral(fill, 'fill-by'), 'the fillBy marker is not load-bearing').toBe(true)
    expect(hasLiteral(fill, 'shade-by'), 'shadeBy came along with fillBy').toBe(false)
  })

  // Scale descriptors (`sqrt()`, `symlog()`, `log()`) carry the whole view (transform, pipeline,
  // tick builders) on the spec; the engine core never imports it. `"symlog"` appears only in `scale-view.ts`.
  it('<Chart> + <Line> + <Axis> bundles no scale view code', async () => {
    const code = await bundle(['Chart', 'Line', 'Axis'], MAIN)
    expect(hasLiteral(code, 'symlog'), 'a scale view reached a chart with no descriptor').toBe(false)
  })

  // The two plot entries a server or a lean app imports: marks and a serializer, no descriptor, so no view and no ramp.
  it('PlotChart + marks and chartToSvg bundle neither scale view nor per-datum colour code', async () => {
    const entries: ReadonlyArray<readonly [readonly string[], string]> = [[['PlotChart', 'bars', 'line'], PLOT], [['chartToSvg', 'bars', 'line'], SVG]]
    for (const [names, from] of entries) {
      const code = await bundle(names, from)
      for (const lit of ['symlog', 'shade-by', 'fill-by']) expect(hasLiteral(code, lit), `${lit} reached ${names[0]!} with no descriptor imported`).toBe(false)
    }
  })

  // Dev-only warnings are gated AT THE CALL SITE: `warnOnce` itself returns in production, but the message string
  // is built by the caller and would still ship. These literals appear only inside warning messages.
  it('no dev-warning text ships in a production bundle', async () => {
    const entries: ReadonlyArray<readonly [readonly string[], string]> = [[['PlotChart', 'bars', 'line', 'shadeBy'], PLOT], [['Chart', 'Bar', 'Axis'], MAIN], [['chartToSvg', 'bars'], SVG]]
    for (const [names, from] of entries) {
      const code = await bundle(names, from)
      for (const text of ['smallest LTTB can keep', 'coerced to a number', 'expected one of', 'returned a non-number', 'cannot place them']) {
        expect(code.includes(text), `"${text}" shipped in ${names[0]!}`).toBe(false)
      }
    }
  })

  // The bundle check above can be fooled: a bundler may inline the production no-op warnOnce and drop the call and
  // its argument, which hides an ungated call from it. This reads the sources, so an ungated warnOnce is found
  // whichever bundler the app uses.
  it('every warnOnce call sits behind the production gate', () => {
    const dir = join(here, '..', 'engine')
    const bad: string[] = []
    for (const file of readdirSync(dir)) {
      if (!/\.tsx?$/.test(file) || /\.test\./.test(file) || file === 'dev-warn.ts') continue
      const lines = readFileSync(join(dir, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/\bwarnOnce\(/.test(line) || /^\s*(import|export)\b/.test(line)) return
        const near = lines.slice(Math.max(0, i - 4), i + 1).join('\n')
        if (!near.includes("process.env.NODE_ENV !== 'production'")) bad.push(`${file}:${i + 1}`)
      })
    }
    expect(bad, 'warnOnce called outside the production gate: its message string ships in every bundle').toEqual([])
  })

  it('and the marker is real — importing sqrt, symlog or log brings the view in', async () => {
    for (const d of ['sqrt', 'symlog', 'log']) {
      const code = await bundle(['Chart', 'Line', d], MAIN)
      expect(hasLiteral(code, 'symlog'), `importing ${d} did not bring the view in`).toBe(true)
    }
  })
})
