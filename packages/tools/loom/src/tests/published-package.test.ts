/**
 * `loom build` run from the package AS PUBLISHED.
 *
 * The publish strips `src/` (and the `bun` export condition) from a package
 * that builds to `lib/`, but the observatory app ships in `app/`. It imported
 * `../../src/ui/Observatory`, so `loom build` passed every test in this
 * workspace (where `src/` is on disk) and failed in every install with
 * `UNRESOLVED_IMPORT`. This installs the packed tarball into a throwaway
 * consumer (`scripts/emulate-published-install.ts`, the same manifest rewrite
 * publish.ts applies) and runs the real CLI from it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/** `scripts/emulate-published-install.ts`, run as the CLI it also is. */
function installPublished(pkgDir: string, target: string): void {
  const script = resolve(pkgDir, '../../../scripts/emulate-published-install.ts')
  const run = spawnSync('bun', [script, pkgDir, target], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`emulate-published-install failed:\n${run.stdout}\n${run.stderr}`)
}

const LOOM = resolve(__dirname, '../..')

const consumer = realpathSync(mkdtempSync(join(tmpdir(), 'loom-published-')))
afterAll(() => rmSync(consumer, { recursive: true, force: true }))

describe('loom build from the published package', () => {
  it('prerenders the observatory — nothing the shipped app imports lives in the stripped src/', () => {
    const loom = join(consumer, 'node_modules', '@pyreon', 'loom')
    installPublished(LOOM, loom)
    expect(existsSync(join(loom, 'src'))).toBe(false)
    expect(existsSync(join(loom, 'app', 'src', 'view.tsx'))).toBe(true)

    // A small workspace to observe: one package depending on another.
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true, type: 'module', workspaces: ['packages/*'] }),
    )
    for (const [name, deps] of [
      ['a', { b: 'workspace:*' }],
      ['b', {}],
    ] as const) {
      mkdirSync(join(consumer, 'packages', name, 'src'), { recursive: true })
      writeFileSync(
        join(consumer, 'packages', name, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', type: 'module', dependencies: deps }),
      )
      writeFileSync(join(consumer, 'packages', name, 'src', 'index.ts'), 'export const x = 1\n')
    }

    const run = spawnSync('node', [join(loom, 'bin', 'loom.js'), 'build', consumer, '--out', join(consumer, 'site')], {
      cwd: consumer,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: '' },
    })
    expect(run.status, `${run.stdout}\n${run.stderr}`.slice(-3000)).toBe(0)
    expect(existsSync(join(consumer, 'site', 'index.html'))).toBe(true)
  }, 600_000)
})
