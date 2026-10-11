import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasBuiltLib } from '../built-lib'
import { linkScaffoldDependencies } from '../../../../../scripts/scaffold-native-smoke'

let root: string
let app: string
let workspace: string

function manifest(directory: string, value: object): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify(value))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'native-scaffold-dependencies-'))
  app = join(root, 'app')
  workspace = join(root, 'workspace')
  mkdirSync(workspace)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

it('links runtime, development and optional dependencies from the current checkout', () => {
  manifest(app, {
    dependencies: { '@fixture/runtime': '0.0.0' },
    devDependencies: { compiler: '0.0.0', '@fixture/runtime': '0.0.0' },
    optionalDependencies: { optional: '0.0.0' },
  })
  for (const name of ['@fixture/runtime', 'compiler', 'optional']) {
    const installed = join(workspace, 'node_modules', name)
    manifest(installed, { name, version: '0.0.0' })
    writeFileSync(join(installed, 'current-checkout.txt'), name)
  }
  linkScaffoldDependencies(app, workspace)
  for (const name of ['@fixture/runtime', 'compiler', 'optional']) {
    const linked = join(app, 'node_modules', name)
    expect(realpathSync(linked)).toBe(realpathSync(join(workspace, 'node_modules', name)))
    expect(readFileSync(join(linked, 'current-checkout.txt'), 'utf8')).toBe(name)
  }
})

it('fails before emitting when a declared dependency is missing', () => {
  manifest(app, { dependencies: { '@fixture/missing': '0.0.0' } })
  expect(() => linkScaffoldDependencies(app, workspace)).toThrow(
    '[Pyreon] Scaffold dependency @fixture/missing is missing from the checkout. Run bun install.',
  )
})

it('uses the normal upward package lookup for a nested workspace', () => {
  manifest(app, { dependencies: { compiler: '0.0.0' } })
  const installed = join(workspace, 'node_modules', 'compiler')
  manifest(installed, { name: 'compiler' })
  const nested = join(workspace, 'packages', 'app')
  mkdirSync(dirname(nested), { recursive: true })
  mkdirSync(nested)
  linkScaffoldDependencies(app, nested)
  expect(realpathSync(join(app, 'node_modules', 'compiler'))).toBe(realpathSync(installed))
})

it('prefers the current workspace package over an installed published copy', () => {
  manifest(app, { dependencies: { '@fixture/runtime': '0.0.0' } })
  const local = join(workspace, 'packages', 'core', 'runtime')
  manifest(local, { name: '@fixture/runtime', version: '0.0.0' })
  manifest(join(workspace, 'node_modules', '@fixture', 'runtime'), {
    name: '@fixture/runtime',
    version: 'old',
  })
  linkScaffoldDependencies(app, workspace)
  expect(realpathSync(join(app, 'node_modules', '@fixture', 'runtime'))).toBe(realpathSync(local))
})

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../scripts/scaffold-native-smoke.ts',
)
const checkout = dirname(dirname(script))
const builtPlugins = ['core', 'reactivity', 'primitives']
  .map((name) =>
    hasBuiltLib(
      join(checkout, 'packages', 'core', name, 'lib', 'native-plugin.js'),
      'native scaffold toolchain controls',
    ),
  )
  .every(Boolean)

const SMOKE_TIMEOUT_MS = 30_000

describe.skipIf(!builtPlugins)('missing native toolchains', { timeout: SMOKE_TIMEOUT_MS + 10_000 }, () => {
  it.each([false, true])('reports honestly with required validation=%s', (required) => {
    const bun = (process.env.PATH ?? '')
      .split(delimiter)
      .map((dir) => join(dir, 'bun'))
      .find((path) => existsSync(path))
    expect(bun).toBeDefined()
    const bin = join(root, 'bin')
    mkdirSync(bin)
    symlinkSync(bun!, join(bin, 'bun'))
    const log = join(root, 'smoke.log')
    const output = openSync(log, 'w')
    let result: ReturnType<typeof spawnSync>
    try {
      result = spawnSync(bun!, [script], {
        cwd: checkout,
        env: {
          ...process.env,
          PATH: bin,
          PYREON_VALIDATE_CACHE_DIR: join(root, 'cache'),
          PYREON_SKIP_NATIVE_VALIDATE: '0',
          PYREON_REQUIRE_NATIVE_VALIDATE: required ? '1' : '0',
        },
        stdio: ['ignore', output, output],
        timeout: SMOKE_TIMEOUT_MS,
      })
    } finally {
      closeSync(output)
    }
    const diagnostic = readFileSync(log, 'utf8')
    expect(result.error).toBeUndefined()
    expect(result.status, diagnostic).toBe(required ? 1 : 0)
    expect(diagnostic).not.toContain('scaffolded app compiles for both native targets')
    if (required) {
      expect(diagnostic).toContain('swiftc not found on PATH')
      expect(diagnostic).toContain('kotlinc not found on PATH')
    } else {
      expect(diagnostic).toContain('native typechecks incomplete')
      expect(diagnostic).toContain('SKIPPED')
    }
  })
})
