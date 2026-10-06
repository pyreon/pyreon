/**
 * The `@pyreon/compiler` MAIN entry must not load the TypeScript compiler API.
 *
 * Why it matters: `@pyreon/vite-plugin` statically imports the main entry, so
 * anything reachable from it is parsed + evaluated on every `vite dev` /
 * `vite build` start, and every consumer that only needs `transformJSX`
 * (test harnesses, bundler integrations) pays for ~8 MB of `typescript` it
 * never calls. The `typescript`-backed surface (detectors, migrators, lens,
 * audits, the project scanner, the validate emitter) lives behind the
 * `/analyze`, `/audits` and `/validate` subpaths instead.
 *
 * Method: bundle each entry with esbuild (`packages: 'external'`, so bare
 * specifiers stay as imports) and read the metafile — the resulting
 * `typescript` import edge (or its absence) is exactly what Node would load.
 * The subpaths are the POSITIVE CONTROL: if `typescript` stopped showing up
 * for them the "main has none" assertion would be vacuous (e.g. the bundler
 * silently tree-shaking everything, or the externals list changing).
 *
 * Bisect-verify: add `export { detectPyreonPatterns } from './pyreon-intercept'`
 * (or any `typescript`-importing module) to `src/index.ts` → the main-entry
 * spec fails naming `typescript` and the offending input file.
 */
import { build } from 'esbuild'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Graph {
  /** Every bare/external specifier imported anywhere in the bundled graph. */
  externals: Set<string>
  /** Repo-relative source files that were bundled into the output. */
  inputs: string[]
}

async function graphOf(entry: string): Promise<Graph> {
  const r = await build({
    entryPoints: [join(SRC, entry)],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    // Keep bare specifiers (typescript, oxc-parser, magic-string, …) as import
    // edges instead of inlining them — the edge IS the signal.
    packages: 'external',
    logLevel: 'silent',
  })
  const externals = new Set<string>()
  for (const out of Object.values(r.metafile.outputs)) {
    for (const imp of out.imports) if (imp.external) externals.add(imp.path)
  }
  return { externals, inputs: Object.keys(r.metafile.inputs).map((p) => relative(SRC, join(SRC, '..', p))) }
}

const TS_SPECIFIER = 'typescript'

describe('@pyreon/compiler main entry is TypeScript-free', () => {
  it('main entry (index.ts) never imports `typescript`, directly or transitively', async () => {
    const g = await graphOf('index.ts')
    const tsEdge = [...g.externals].filter((p) => p === TS_SPECIFIER || p.startsWith(`${TS_SPECIFIER}/`))
    expect(tsEdge, `main entry pulls the TypeScript compiler API via: ${g.inputs.join(', ')}`).toEqual([])
    // Belt-and-braces: none of the TS-backed source modules is in the graph.
    for (const banned of [
      'react-intercept',
      'pyreon-intercept',
      'pyreon-migrate',
      'reactivity-lens',
      'lpih',
      'validate-emit',
      'project-scanner',
      'island-audit',
      'ssg-audit',
      'native-audit',
      'content-audit',
      'test-audit',
      'ts.ts',
    ]) {
      expect(g.inputs.some((f) => f.includes(banned)), `${banned} leaked into the main entry graph`).toBe(false)
    }
  })

  it('the lean pre-pass subpaths stay TypeScript-free too', async () => {
    for (const entry of ['plain.ts', 'diagnose.ts', 'fs-route-convention.ts']) {
      const g = await graphOf(entry)
      expect(g.externals.has(TS_SPECIFIER), `${entry} imports typescript`).toBe(false)
    }
  })

  // Positive controls — each subpath DOES load `typescript`. Without these the
  // assertions above could pass vacuously.
  for (const entry of ['analyze.ts', 'audits.ts', 'validate.ts']) {
    it(`${entry} subpath loads \`typescript\` (positive control)`, async () => {
      const g = await graphOf(entry)
      expect(g.externals.has(TS_SPECIFIER)).toBe(true)
    })
  }
})
