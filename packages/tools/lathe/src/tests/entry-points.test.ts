/**
 * The entry-point contract, asserted as REACHABILITY.
 *
 * A generator produces an import graph, and the entry points are where that
 * graph becomes visible to a bundler. The property that matters is not which
 * lines appear in `index.ts` — it is what a consumer PULLS IN by importing
 * one symbol from it. So these specs bundle the emitted output for real and
 * assert on what survived.
 *
 * The measurement that motivated the layering, on a 30-tag / 120-operation
 * spec with Vite 8 (rollup), importing a single hook:
 *
 *   through the flat barrel   30,710 B  (2,420 B gz)  120 fixtures, 116 endpoints
 *   through its own tag        6,063 B    (766 B gz)    0 fixtures,   4 endpoints
 *
 * The fixtures were the bug: a mock route table is DATA, so unlike an unused
 * function it survives minification wherever it is reachable, and a barrel
 * that named it put every fixture in the page bundle. That is what the
 * `dev.ts` split closes, and what the last spec here holds shut.
 *
 * The endpoint retention is NOT closed and is not a bug: a barrel that names
 * every tag reaches every endpoint by definition, and `api.endpoint(...)` is a
 * module-level call a bundler must keep. The answer to that is the per-tag
 * import, which is why it has its own spec.
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig, type PluginName } from '../core/config'
import { generate } from '../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'entries')

/** Two tags, so "reaches the other tag" is a question that can be asked. */
const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Book' } } } } } }
  /authors:
    get:
      operationId: listAuthors
      tags: [authors]
      responses: { '200': { content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Author' } } } } } }
components:
  schemas:
    Book: { type: object, required: [id], properties: { id: { type: string, format: uuid } } }
    Author: { type: object, required: [id], properties: { id: { type: string, format: uuid } } }
`

/**
 * The module specifiers a generated entry actually re-exports.
 *
 * Reading the raw file text is not equivalent: these entries carry docblocks
 * that NAME the sibling modules while explaining why they are absent, so a
 * `not.toContain('./components')` on the whole file fails on the prose that
 * documents the very property under test.
 */
function reExports(source: string): string[] {
  return [...source.matchAll(/^export .*? from '([^']+)'/gm)].map((m) => m[1] as string)
}

const ALL: PluginName[] = ['schemas', 'client', 'queries', 'mocks', 'faker']

function emit(plugins: PluginName[] = ALL): Map<string, string> {
  const cfg = resolveConfig({ input: 'x', plugins })
  return new Map(generate(SPEC, cfg).files.map((f) => [f.path, f.contents]))
}

/**
 * Bundle an entry that imports `symbol` from `from`, and report what survived.
 *
 * Externals are the real dependencies, so the measurement is of the GENERATED
 * graph and not of `@pyreon/query`'s own weight.
 */
async function bundleFrom(
  from: string,
  symbol: string,
  opts: { marker?: boolean } = {},
): Promise<string> {
  const withMarker = opts.marker !== false
  const dir = join(ROOT, `${from.replace(/[^a-z0-9]/gi, '_')}${withMarker ? '' : '-nomarker'}`)
  mkdirSync(join(dir, 'gen', 'endpoints'), { recursive: true })
  mkdirSync(join(dir, 'gen', 'queries'), { recursive: true })
  // A consumer `package.json` that declares NOTHING, which is the ordinary app
  // default. Without it the nearest package.json is `@pyreon/lathe`'s own,
  // which declares `sideEffects: false` -- and the specs below then pass
  // whether or not the generator emits its marker at all, which is a test
  // passing for the wrong reason. This file is what makes the EMITTED marker
  // the only declaration in play.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  for (const [path, contents] of emit()) {
    // `package.json` is written along with the sources — it IS the marker, and
    // filtering it out is what made these specs pass for the wrong reason the
    // first time round.
    if (path === 'package.json' && !withMarker) continue
    if (path.endsWith('.ts') || path === 'package.json') {
      writeFileSync(join(dir, 'gen', path), contents)
    }
  }
  const entry = join(dir, 'entry.ts')
  // `*` re-exports the whole module, so nothing in it is shakeable. Used by the
  // control, which has to reach EVERY dev surface at once -- importing one
  // symbol correctly shakes the others away, which is the behaviour under test
  // everywhere else and useless as a control.
  writeFileSync(
    entry,
    symbol === '*'
      ? `export * from './gen/${from}'\n`
      : `import { ${symbol} } from './gen/${from}'\nexport const used = ${symbol}\n`,
  )
  // esbuild rather than a Bun API: vitest runs this under node, and esbuild
  // is what the repo's other tree-shaking specs use.
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    minify: true,
    treeShaking: true,
    external: ['@pyreon/*', '@faker-js/faker'],
    platform: 'browser',
  })
  return out.outputFiles[0]?.text ?? ''
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('the sideEffects marker', () => {
  const files = emit()

  it('is emitted', () => {
    expect(files.has('package.json')).toBe(true)
  })

  it('claims no side effects when nothing generated has any', () => {
    expect(JSON.parse(files.get('package.json') ?? '{}').sideEffects).toBe(false)
  })

  it('NAMES the side-effectful file rather than lying about it', () => {
    // `atlas.wrapper.tsx` calls `installMocks()` at module scope. A blanket
    // `false` would be false, and a bundler acting on it would drop the one
    // call the wrapper exists to make.
    const withAtlas = new Map(
      generate(SPEC, resolveConfig({ input: 'x', plugins: ['atlas'] })).files.map((f) => [
        f.path,
        f.contents,
      ]),
    )
    expect(JSON.parse(withAtlas.get('package.json') ?? '{}').sideEffects).toEqual([
      './atlas.wrapper.tsx',
    ])
  })

  it('states the module type, so the marker cannot reclassify the output', () => {
    // The marker becomes the NEAREST package.json for everything under the
    // output directory. Under Node16-style resolution one without `type` means
    // CommonJS, so omitting it would silently reclassify the generated modules.
    expect(JSON.parse(files.get('package.json') ?? '{}').type).toBe('module')
  })
})

describe('the emitted entry points', () => {
  const files = emit()

  it('emits one entry per layer', () => {
    for (const path of ['index.ts', 'dev.ts', 'endpoints/index.ts', 'queries/index.ts']) {
      expect(files.has(path), path).toBe(true)
    }
  })

  it('keeps every dev surface OUT of the production barrel', () => {
    const barrel = reExports(files.get('index.ts') ?? '')
    for (const dev of ['./mocks', './faker', './components']) {
      expect(barrel, dev).not.toContain(dev)
    }
  })

  it('names the dev surfaces in dev.ts instead', () => {
    const dev = reExports(files.get('dev.ts') ?? '')
    expect(dev).toContain('./mocks')
    expect(dev).toContain('./faker')
  })

  it('keeps the JSX previews OUT of dev.ts, so it stays node-safe', () => {
    // Found by consuming the output as a real project would: a plain node test
    // that wanted one fake object had to configure a JSX transform, for preview
    // components it never touches. Previews have exactly one kind of consumer
    // (an Atlas config, a story) and that consumer imports them directly.
    const withComponents = new Map(
      generate(SPEC, resolveConfig({ input: 'x', plugins: ['components', 'mocks', 'faker'] })).files.map(
        (f) => [f.path, f.contents],
      ),
    )
    expect(withComponents.has('components.tsx')).toBe(true)
    expect(reExports(withComponents.get('dev.ts') ?? '')).not.toContain('./components')
  })

  it('emits no dev entry when no dev plugin ran', () => {
    expect(emit(['schemas', 'client', 'queries']).has('dev.ts')).toBe(false)
  })
})

/**
 * The dev surfaces, and a marker that must never appear in a page bundle.
 *
 * Every marker here is either an EXTERNAL import specifier or string DATA,
 * because both survive minification unchanged. A generated identifier does not:
 * an earlier version of this list used `seedFaker`, which minifies to a single
 * letter, so the assertion would have passed even with the whole faker module
 * bundled. The control at the bottom is what caught that.
 */
const DEV_MARKERS = [
  ['faker factories', '@faker-js/faker'],
  ['mock fixtures', '00000000-0000-4000'],
  ['the mock middleware', '@pyreon/http/mock'],
] as const

/** Every entry a page is expected to import from. */
const PRODUCTION_ENTRIES = [
  ['the barrel', 'index'],
  ['the queries layer', 'queries/index'],
  ['the endpoints layer', 'endpoints/index'],
  ['one tag', 'queries/books'],
] as const

describe('a production import can never reach a dev surface', () => {
  for (const [entryLabel, entry] of PRODUCTION_ENTRIES) {
    const symbol = entry.startsWith('endpoints') ? 'listBooks' : 'useListBooks'

    for (const [devLabel, marker] of DEV_MARKERS) {
      it(`${entryLabel} does not pull in ${devLabel}`, async () => {
        expect(await bundleFrom(entry, symbol)).not.toContain(marker)
      })

      it(`${entryLabel} does not pull in ${devLabel} even with NO sideEffects marker`, async () => {
        // The stronger claim, and the one the layering is actually for. The
        // `sideEffects` declaration is a HINT: it makes the output shake, but a
        // bundler is free to ignore it and some configurations do. Isolation of
        // the dev surfaces must not depend on that -- `index.ts` simply does not
        // NAME `./faker`, `./mocks` or `./components`, so there is no edge for
        // any bundler to follow, hint or no hint.
        expect(await bundleFrom(entry, symbol, { marker: false })).not.toContain(marker)
      })
    }
  }

  it('the dev entry DOES reach them — otherwise the split proves nothing', async () => {
    // The control. Without it every spec above would still pass if the faker
    // and mock emitters simply stopped producing anything -- and it is what
    // exposed the minified-identifier flaw in the marker list above.
    const dev = await bundleFrom('dev', '*')
    for (const [, marker] of DEV_MARKERS) expect(dev, marker).toContain(marker)
  })
})

describe('what a production import actually pulls in', () => {
  it('does NOT reach the mock fixture table through the barrel', async () => {
    const bundle = await bundleFrom('index', 'useListBooks')
    // The fixture uuid is emitted by the mock plugin and by nothing else, so
    // its presence is an unambiguous signal that the table came along.
    expect(bundle).not.toContain('00000000-0000-4000')
    // And the same for the faker factories, which drag `@faker-js/faker`.
    expect(bundle).not.toContain('seedFaker')
  })

  it('does not reach faker or fixtures through a per-tag import either', async () => {
    const bundle = await bundleFrom('queries/books', 'useListBooks')
    expect(bundle).not.toContain('00000000-0000-4000')
    expect(bundle).not.toContain('seedFaker')
  })

  it('reaches only its own tag when imported per-tag', async () => {
    const bundle = await bundleFrom('queries/books', 'useListBooks')
    expect(bundle).toContain('/books')
    // The other tag's endpoint is the thing a barrel would have dragged in.
    expect(bundle).not.toContain('/authors')
  })

  it('costs the same through the barrel as through the tag', async () => {
    const viaBarrel = await bundleFrom('index', 'useListBooks')
    const viaTag = await bundleFrom('queries/books', 'useListBooks')
    // These two specs previously asserted the OPPOSITE — that the barrel was
    // measurably larger, and that it reached every endpoint. Both were true,
    // and both stopped being true when the `sideEffects` marker landed. The
    // invariant they were protecting (a convenience barrel must not tax the
    // consumer) is unchanged; the assertion is rewritten to the corrected
    // truth, which is stronger: the tax is now ZERO, not merely smaller.
    expect(viaBarrel.length).toBe(viaTag.length)
  })

  it('does not reach another tag through the barrel', async () => {
    const bundle = await bundleFrom('index', 'useListBooks')
    expect(bundle).not.toContain('/authors')
  })
})
