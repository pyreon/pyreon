/**
 * `atlas build` run from the package AS PUBLISHED.
 *
 * The publish strips `src/` (and the `bun` export condition) from a package
 * that builds to `lib/`, but the workbench app ships in `app/`. When that app
 * imported `../../src/ui`, every test here passed — `src/` is on disk in the
 * workspace — and every install failed with `UNRESOLVED_IMPORT
 * '../../src/ui'`. This installs the packed tarball into a throwaway consumer
 * (`scripts/emulate-published-install.ts`, the same manifest rewrite
 * publish.ts applies) and runs the real CLI from it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/** `scripts/emulate-published-install.ts`, run as the CLI it also is. */
function installPublished(pkgDir: string, target: string): void {
  const script = resolve(pkgDir, '../../../scripts/emulate-published-install.ts')
  const run = spawnSync('bun', [script, pkgDir, target], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`emulate-published-install failed:\n${run.stdout}\n${run.stderr}`)
}

const ATLAS = resolve(__dirname, '../../..')
/** An installed project whose framework the consumer borrows, read-only. */
const INSTALLED = resolve(ATLAS, '../../../examples/atlas-workshop/node_modules')

const consumer = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-published-')))
afterAll(() => rmSync(consumer, { recursive: true, force: true }))

describe('atlas build from the published package', () => {
  it('builds a site — nothing the shipped app imports lives in the stripped src/', () => {
    const modules = join(consumer, 'node_modules')
    mkdirSync(join(modules, '@pyreon'), { recursive: true })
    for (const entry of readdirSync(INSTALLED)) {
      if (entry === '@pyreon' || entry === '.bin') continue
      symlinkSync(join(INSTALLED, entry), join(modules, entry))
    }
    for (const name of readdirSync(join(INSTALLED, '@pyreon'))) {
      if (name !== 'atlas') symlinkSync(join(INSTALLED, '@pyreon', name), join(modules, '@pyreon', name))
    }
    const atlas = join(modules, '@pyreon', 'atlas')
    installPublished(ATLAS, atlas)
    // The premise: the installed package really has no src/.
    expect(existsSync(join(atlas, 'src'))).toBe(false)
    expect(existsSync(join(atlas, 'app', 'src', 'shell.tsx'))).toBe(true)

    mkdirSync(join(consumer, 'src'), { recursive: true })
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }))
    writeFileSync(
      join(consumer, 'src', 'Hello.tsx'),
      'export function Hello(props: { name?: string }) {\n  return props.name ?? null\n}\n',
    )
    const run = spawnSync('node', [join(atlas, 'bin', 'atlas.js'), 'build', consumer, '--out', 'dist'], {
      cwd: consumer,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: '' },
    })
    expect(run.status, `${run.stdout}\n${run.stderr}`.slice(-3000)).toBe(0)
    expect(existsSync(join(consumer, 'dist', 'hello', 'index.html'))).toBe(true)
  }, 600_000)
})
