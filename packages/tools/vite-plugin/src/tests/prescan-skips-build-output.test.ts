/**
 * The boot-time prescans must never read BUILD OUTPUT as source.
 *
 * A bundle keeps the `island(() => import(…), { name })` calls of the source
 * it came from. The walker knew output only by name (`dist`/`lib`/`build` at
 * a package root, dot-dirs), so a custom `build.outDir` — `dist-ssr`, `out` —
 * was scanned and a SERVER bundle's islands landed in the CLIENT islands
 * registry. These specs drive REAL `vite build`s, so the resolved config
 * (`build.outDir`, `environments.*.build.outDir`, `cacheDir`) and the
 * `writeBundle` output options are Vite's own, not a hand-built stand-in.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, type EnvironmentOptions } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreon from '../index'

interface IslandDecl {
  name: string
}
type Caches = { islandRegistry: Map<string, IslandDecl[]> }

let root: string

function write(rel: string, contents: string): void {
  const full = join(root, rel)
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
  writeFileSync(full, contents)
}

/** A declaration the scanner recognises, in the shape a bundler leaves it. */
const bundledIsland = (name: string) =>
  `const ${name} = island(() => import("./assets/${name}-x1y2.js"), { name: "${name}", hydrate: "load" });\nexport { ${name} };\n`

function islandNames(plugin: ReturnType<typeof pyreon>): string[] {
  const caches = (plugin as unknown as Record<symbol, Caches>)[Symbol.for('pyreon/vite-plugin:caches')]!
  return [...caches.islandRegistry.values()].flat().map((d) => d.name).sort()
}

function filesOf(plugin: ReturnType<typeof pyreon>): string[] {
  const caches = (plugin as unknown as Record<symbol, Caches>)[Symbol.for('pyreon/vite-plugin:caches')]!
  return [...caches.islandRegistry.keys()].map((f) => f.slice(root.length + 1)).sort()
}

async function runBuild(
  plugin: ReturnType<typeof pyreon>,
  extra: { build: { outDir: string }; environments?: Record<string, EnvironmentOptions> },
) {
  await build({
    root,
    logLevel: 'silent',
    configFile: false,
    plugins: [plugin],
    build: {
      minify: false,
      emptyOutDir: true,
      lib: { entry: join(root, 'src/main.ts'), formats: ['es'], fileName: 'main' },
      ...extra.build,
    },
    ...(extra.environments ? { environments: extra.environments } : {}),
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-prescan-output-'))
  // A real project root: Vite puts `cacheDir` at `node_modules/.vite` beside it.
  write('package.json', '{ "name": "prescan-fixture", "private": true, "type": "module" }\n')
  write('src/island-shim.ts', `export const island = (load, opts) => ({ load, opts })\n`)
  write('src/Counter.ts', `export default () => 'counter'\n`)
  write(
    'src/islands.ts',
    `import { island } from './island-shim'\nexport const Source = island(() => import('./Counter'), { name: 'Source', hydrate: 'load' })\n`,
  )
  write('src/main.ts', `export { Source } from './islands'\n`)
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('island prescan — build output is not source', () => {
  it('skips the build.outDir a previous build of the same config left behind', async () => {
    write('dist-ssr/server.js', bundledIsland('FromOutput'))
    const plugin = pyreon()
    await runBuild(plugin, { build: { outDir: 'dist-ssr' } })
    expect(islandNames(plugin)).toEqual(['Source'])
  })

  it("skips another environment's outDir (the SSR one) declared in the same config", async () => {
    write('server-out/server.js', bundledIsland('FromSsr'))
    const plugin = pyreon()
    await runBuild(plugin, {
      build: { outDir: 'client-out' },
      environments: { ssr: { build: { outDir: 'server-out' } } },
    })
    expect(islandNames(plugin)).toEqual(['Source'])
  })

  it('skips the out dir of an EARLIER, separate build (separate client and SSR invocations)', async () => {
    // Build 1: the "server" build, its own config, writes `dist-ssr/`.
    await runBuild(pyreon(), { build: { outDir: 'dist-ssr' } })
    // Its bundle carries the island() call, in the form the scanner matches.
    const bundle = readdirSync(join(root, 'dist-ssr'))
      .map((f) => readFileSync(join(root, 'dist-ssr', f), 'utf-8'))
      .join('\n')
    expect(bundle).toMatch(/island\(\(\) => import\(["']\.\/Counter[^"']*["']\), \{/)

    // Build 2: the client build. Its config knows nothing of `dist-ssr`.
    const client = pyreon()
    await runBuild(client, { build: { outDir: 'dist-client' } })
    expect(filesOf(client)).toEqual(['src/islands.ts'])
    expect(islandNames(client)).toEqual(['Source'])
  })

  it('records the output directory under Vite cacheDir, dropping vanished ones', async () => {
    await runBuild(pyreon(), { build: { outDir: 'out-a' } })
    await runBuild(pyreon(), { build: { outDir: 'out-b' } })
    rmSync(join(root, 'out-a'), { recursive: true, force: true })
    await runBuild(pyreon(), { build: { outDir: 'out-c' } })
    const record: string[] = JSON.parse(
      readFileSync(join(root, 'node_modules/.vite/pyreon-build-outputs.json'), 'utf-8'),
    )
    expect(record.map((d) => d.slice(d.lastIndexOf('/') + 1))).toEqual(['out-b', 'out-c'])
  })

  it('still scans a source folder that merely shares a name with nothing configured', async () => {
    write('app/widgets.ts', bundledIsland('AppDir'))
    const plugin = pyreon()
    await runBuild(plugin, { build: { outDir: 'dist-ssr' } })
    expect(islandNames(plugin)).toEqual(['AppDir', 'Source'])
  })
})
