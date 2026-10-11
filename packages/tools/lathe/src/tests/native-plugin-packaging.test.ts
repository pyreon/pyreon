import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROVIDERS = ['http', 'query', 'validate', 'validation']
const node = process.execPath.includes('bun') ? 'node' : process.execPath
// Exercise the shipping builder's dependency externalization, not a copy of its rules.
const builder = import.meta.resolve('@vitus-labs/tools-rolldown')
let fixture: string

function provider(name: string, source: string) {
  const directory = join(fixture, 'node_modules', '@pyreon', name)
  mkdirSync(join(directory, 'lib'), { recursive: true })
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: `@pyreon/${name}`,
      type: 'module',
      exports: { './native-plugin': './lib/native-plugin.js' },
    }),
  )
  writeFileSync(join(directory, 'lib', 'native-plugin.js'), source)
}

function run(source: string) {
  const result = spawnSync(node, ['--input-type=module', '-e', source], {
    cwd: fixture,
    env: { ...process.env, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  })
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
}

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'lathe-native-packaging-'))
  cpSync(join(ROOT, 'package.json'), join(fixture, 'package.json'))
  mkdirSync(join(fixture, 'src', 'verify'), { recursive: true })
  cpSync(join(ROOT, 'src', 'verify', 'lower.ts'), join(fixture, 'src', 'verify', 'lower.ts'))
  // This entry has only type imports besides the optional native packages. Keep
  // the real package metadata and JS builder; omit unrelated entries and DTS.
  writeFileSync(
    join(fixture, 'vl-tools.config.mjs'),
    `export default { build: { typescript: false, filesize: false, sourcemap: false,
      entries: [{ input: 'src/verify/lower.ts', file: 'lib/lower.js', format: 'es' }] } }`,
  )
  for (const name of PROVIDERS) {
    // A bootstrap can expose a plugin entry before its shared chunks are ready.
    // Resolving this at build time must fail; an optional peer stays external.
    provider(name, "export { default } from './still-building.js'\n")
  }
  run(`const { runBuild } = await import(${JSON.stringify(builder)}); await runBuild()`)
  for (const name of PROVIDERS)
    rmSync(join(fixture, 'node_modules', '@pyreon', name), { recursive: true })
  const compiler = join(fixture, 'node_modules', '@pyreon', 'native-compiler')
  mkdirSync(compiler, { recursive: true })
  writeFileSync(
    join(compiler, 'package.json'),
    JSON.stringify({ type: 'module', exports: './index.js' }),
  )
  // This boundary probe records which installed plugin objects and stubs Lathe
  // forwards. Actual native lowering is exercised by the existing native suites.
  writeFileSync(
    join(compiler, 'index.js'),
    `export const transform = () => [];
     export const createCompiler = ({ discovered }) => ({ transform: () => discovered.map(p => p.name) });
     export const validateSwiftWithStubs = (_, options) => options?.augment ?? [];`,
  )
}, 60_000)

afterAll(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true })
})

afterEach(() => {
  for (const name of PROVIDERS)
    rmSync(join(fixture, 'node_modules', '@pyreon', name), { recursive: true, force: true })
})

describe('optional native plugin packaging', () => {
  it('builds without reading partially built provider libs and preserves all four runtime imports', () => {
    const metadata = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8'))
    const output = readFileSync(join(fixture, 'lib', 'lower.js'), 'utf8')
    for (const name of PROVIDERS) {
      expect(metadata.peerDependenciesMeta[`@pyreon/${name}`]).toEqual({ optional: true })
      expect(output).toMatch(new RegExp(`import\\(["']@pyreon/${name}/native-plugin["']\\)`))
    }
  })

  it.each([[], ['query'], PROVIDERS].map((installed) => ({ installed })))(
    'loads only the consumer-installed providers: $installed',
    ({ installed }) => {
      for (const name of installed) {
        provider(
          name,
          `export default { name: ${JSON.stringify(name)} }; export const queryStubs = ${JSON.stringify(name)};`,
        )
      }
      run(`import assert from 'node:assert/strict';
      import { resolveNativeCompiler } from './lib/lower.js';
      const { transform, compile } = await resolveNativeCompiler();
      assert.deepEqual(transform(), ${JSON.stringify(installed)});
      assert.deepEqual(compile.swift(''), ${JSON.stringify(installed)});`)
    },
  )
})
