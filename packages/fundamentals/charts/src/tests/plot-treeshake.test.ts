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
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const PLOT = join(here, '..', '..', 'lib', 'plot.js')

/** A literal that appears ONLY in the named family's geometry. */
const FAMILY_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ['sankey', 'justify'],
  ['calendar (day labels)', 'Mon'],
  ['calendar (month labels)', 'Jan'],
]

async function bundle(imports: readonly string[]): Promise<string> {
  // esbuild, not `Bun.build`: vitest runs this under Node, where `Bun` is not
  // defined — the first version failed with `ReferenceError: Bun is not
  // defined` rather than with anything about tree-shaking.
  const entry = join(here, `__ts-entry-${imports.join('-')}.ts`)
  writeFileSync(entry, `export { ${imports.join(', ')} } from '${PLOT.replace(/\\/g, '/')}'\n`)
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

describe.skipIf(!existsSync(PLOT))('plot — the families are tree-shaken, not merely small', () => {
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
