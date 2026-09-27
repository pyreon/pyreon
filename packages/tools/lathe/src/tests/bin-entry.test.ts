/**
 * The SHIPPED bin, spawned under real Node.
 *
 * Every other CLI test calls `main()` / `run()` directly, which is not what a
 * user runs: the bin loads the BUILT `lib/cli.js`. So this spawns it, and
 * asserts exit codes only (captured stdout is not reliable under parallel
 * load). NOTE: it reads `lib/`, so a source edit is invisible to it until
 * `bun scripts/bootstrap.ts` rebuilds -- run it after a bootstrap.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIN = join(ROOT, 'bin', 'lathe.js')
const node = (...args: string[]) =>
  spawnSync(process.execPath.includes('bun') ? 'node' : process.execPath, [BIN, ...args], {
    cwd: ROOT,
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60_000,
  })

describe('the shipped `lathe` bin', { timeout: 120_000 }, () => {
  it('the built entry exists -- a skipped suite must not pass as coverage', () => {
    expect(existsSync(join(ROOT, 'lib', 'cli.js'))).toBe(true)
  })

  it('--version exits 0 (its OUTPUT is asserted in cli-main.test.ts)', () => {
    expect(node('--version').status).toBe(0)
  })

  it('an unknown flag exits 2 (it used to be ignored and exit 0)', () => {
    expect(node('generate', '--josn').status).toBe(2)
  })

  it('`init --yes` writes a config and generates, from a bare spec', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-bin-init-'))
    mkdirSync(join(dir, '.git'))
    writeFileSync(
      join(dir, 'openapi.yaml'),
      "openapi: 3.0.3\ninfo: { title: T, version: '1' }\nservers: [{ url: 'https://t.test' }]\npaths: {}\n",
    )
    writeFileSync(join(dir, 'package.json'), '{ "name": "x" }\n')
    const r = spawnSync(process.execPath.includes('bun') ? 'node' : process.execPath, [BIN, 'init', '--yes'], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 60_000,
    })
    expect(r.status).toBe(0)
    expect(existsSync(join(dir, 'pyreon.config.ts'))).toBe(true)
    expect(existsSync(join(dir, 'src', 'gen', 'lathe-manifest.json'))).toBe(true)
  })

  it('a document that is not OpenAPI exits 1', () => {
    expect(node('check', join(ROOT, 'package.json')).status).toBe(1)
  })
})
