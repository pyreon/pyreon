/**
 * One schema module per model, and a bundle proportional to what a hook uses.
 *
 * `schemas.ts` used to declare every model in one module of module-level
 * `s.object(...)` calls. A bundler keeps a call it cannot prove pure, so any
 * hook -- which imports its response model from that module -- carried EVERY
 * model in the spec: one GitHub hook was 94 KB gzipped of generated code. Two
 * changes close it, and both are asserted here by bundling for real:
 *
 * - models live in `schemas/<Model>.ts`, a `$ref` cycle sharing one module,
 *   and endpoints import each model from its own module;
 * - every emitted builder call and `api.endpoint(...)` is `/* @__PURE__ *\/`,
 *   so an unused declaration inside a REACHED module is dropped too.
 *
 * Markers are string DATA (an enum value unique to each model), never
 * generated identifiers, which minify to one letter and would make an absence
 * assertion pass with the whole module bundled.
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { schemaModules } from '../emit/schema'
import { writeTree } from './helpers/write-tree'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '.generated', 'schema-modules')

/**
 * Twenty models in four tags. `M0`..`M3` each reference the next model in a
 * chain, `Tree` is self-recursive, and `Cust`/`Src` form a two-model cycle --
 * so the split has a chain, a self-loop and a mutual cycle to get right.
 */
function spec(): string {
  const models: string[] = []
  for (let i = 0; i < 20; i++) {
    const next = i % 5 < 4 ? `\n        next: { $ref: '#/components/schemas/M${i + 1}' }` : ''
    models.push(`    M${i}:
      type: object
      required: [kind]
      properties:
        kind: { type: string, enum: [marker-m${i}] }${next}`)
  }
  models.push(`    Tree:
      type: object
      properties:
        tag: { type: string, enum: [marker-tree] }
        kids: { type: array, items: { $ref: '#/components/schemas/Tree' } }
    Cust:
      type: object
      properties:
        tag: { type: string, enum: [marker-cust] }
        src: { anyOf: [ { type: string }, { $ref: '#/components/schemas/Src' } ] }
    Src:
      type: object
      properties:
        tag: { type: string, enum: [marker-src] }
        cust: { anyOf: [ { type: string }, { $ref: '#/components/schemas/Cust' } ] }`)
  const paths: string[] = []
  for (let i = 0; i < 20; i += 5) {
    for (let j = i; j < i + 5; j++) {
      paths.push(`  /m${j}:
    get:
      operationId: getM${j}
      tags: [t${i / 5}]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/M${j}' } } } } }`)
    }
  }
  paths.push(`  /cust:
    get:
      operationId: getCust
      tags: [t0]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Cust' } } } } }`)
  return `openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://api.test/v1' }]
paths:
${paths.join('\n')}
components:
  schemas:
${models.join('\n')}
`
}

const SPEC = spec()
const files = generate(SPEC, resolveConfig({ input: 'x' })).files
const byPath = new Map(files.map((f) => [f.path, f.contents]))

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('the module split', () => {
  it('gives each model its own module and keeps a cycle in ONE', () => {
    expect(byPath.has('schemas/M0.ts')).toBe(true)
    expect(byPath.has('schemas/Tree.ts')).toBe(true)
    // `Cust` <-> `Src`: split across two ES modules it would be an import
    // cycle whose evaluation order depends on who imported first.
    expect(byPath.has('schemas/Cust.ts')).toBe(true)
    expect(byPath.has('schemas/Src.ts')).toBe(false)
    expect(byPath.get('schemas/Cust.ts')).toContain('export const Src =')
  })

  it('imports a dependency from ITS module, and nothing it does not name', () => {
    const m0 = byPath.get('schemas/M0.ts') ?? ''
    expect(m0).toContain("import { M1 } from './M1'")
    expect(m0).not.toContain("from './M2'")
  })

  it('keeps the barrel, re-exporting every module', () => {
    const barrel = byPath.get('schemas.ts') ?? ''
    for (const p of files.filter((f) => f.path.startsWith('schemas/'))) {
      expect(barrel).toContain(`export * from './${p.path.replace(/\.ts$/, '')}'`)
    }
  })

  it('imports endpoint response models from their own modules, not the barrel', () => {
    const t0 = byPath.get('endpoints/t0.ts') ?? ''
    expect(t0).toContain("import { M0 } from '../schemas/M0'")
    expect(t0).not.toContain("from '../schemas'")
  })

  it('names a clashing module case-insensitively apart, and a reserved device name safely', () => {
    // The OpenAPI reader already pascal-cases and de-duplicates names, so this
    // builds the IR directly: the module naming must not depend on that.
    const doc = {
      title: 'T',
      version: '1',
      baseUrl: '',
      operations: [],
      notes: [],
      models: [
        { name: 'Foo', type: { kind: 'string' } },
        { name: 'FOO', type: { kind: 'number' } },
        { name: 'Con', type: { kind: 'boolean' } },
      ],
    } as unknown as Parameters<typeof schemaModules>[0]
    const paths = schemaModules(doc).modules.map((m) => m.path).sort()
    // `FOO` sorts before `Foo` (code-unit order), so it keeps its name.
    expect(paths).toEqual(['schemas/Con_.ts', 'schemas/FOO.ts', 'schemas/Foo_2.ts'])
  })

  it('every module evaluates when imported FIRST, on its own', async () => {
    // One fresh copy per module, so each import really is the first -- an ES
    // module cycle only fails for one import order, and a shared module cache
    // would hide which.
    for (const mod of files.filter((f) => f.path.startsWith('schemas/'))) {
      const dir = join(ROOT, 'first', mod.path.replace(/[^a-z0-9]/gi, '_'))
      writeTree(dir, files, (p) => p.startsWith('schemas'))
      const exports = (await import(join(dir, mod.path))) as Record<string, { parse(v: unknown): { ok: boolean } }>
      for (const schema of Object.values(exports)) expect(typeof schema.parse).toBe('function')
    }
  }, 60_000)
})

/** Bundle `import { symbol } from './gen/<from>'` and return the output. */
async function bundle(from: string, symbol: string, marker: boolean): Promise<string> {
  const dir = join(ROOT, `bundle-${from.replace(/[^a-z0-9]/gi, '_')}-${marker ? 'm' : 'nm'}`)
  mkdirSync(dir, { recursive: true })
  // A consumer package.json declaring nothing, so the EMITTED marker is the
  // only declaration in play (lathe's own package.json declares one).
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  writeTree(join(dir, 'gen'), files, (p) => p.endsWith('.ts') || (marker && p === 'package.json'))
  const entry = join(dir, 'entry.ts')
  writeFileSync(entry, `import { ${symbol} } from './gen/${from}'\nexport const used = ${symbol}\n`)
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    minify: true,
    treeShaking: true,
    external: ['@pyreon/*'],
    platform: 'browser',
  })
  return out.outputFiles[0]?.text ?? ''
}

const markers = (code: string): string[] => [...code.matchAll(/marker-[a-z0-9]+/g)].map((m) => m[0]).sort()

for (const marker of [true, false]) {
  describe(`one hook's bundle is proportional to what it uses (${marker ? 'with' : 'WITHOUT'} the sideEffects marker)`, () => {
    it('a hook reaches its model and that model’s dependencies, and nothing else', async () => {
      // `getM2` returns M2, which names M3, which names M4 -- and nothing else.
      const code = await bundle('queries/t0', 'useGetM2', marker)
      expect(markers(code)).toEqual(['marker-m2', 'marker-m3', 'marker-m4'])
    })

    it('an endpoint reaches only its own response model, not its tag siblings', async () => {
      const code = await bundle('endpoints/t0', 'getM4', marker)
      expect(markers(code)).toEqual(['marker-m4'])
    })

    it('a cycle is reached WHOLE, because validating one side needs the other', async () => {
      const code = await bundle('queries/t0', 'useGetCust', marker)
      expect(markers(code)).toEqual(['marker-cust', 'marker-src'])
    })

    // Through the ROOT barrel only with the marker: the barrel also re-exports
    // `keys.ts`, whose `getM0.key.prefix` reads are property accesses a
    // bundler must assume can run a getter, so without a `sideEffects`
    // declaration that module -- and every endpoint it names -- is kept. The
    // README's layering table records exactly this: the marker is what closes
    // the gap for the root entry.
    if (marker) {
      it('the same through the root barrel', async () => {
        const code = await bundle('index', 'useGetM2', marker)
        expect(markers(code)).toEqual(['marker-m2', 'marker-m3', 'marker-m4'])
      })
    }
  })
}
