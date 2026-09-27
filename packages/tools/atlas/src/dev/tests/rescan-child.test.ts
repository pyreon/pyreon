/**
 * `atlas dev` rescans in a CHILD process (see `../rescan`).
 *
 * A real spawn against a real scan: the property under test is isolation,
 * which a mocked child could only assert about itself.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { childScanScript, scanInChild } from '../rescan'
import { watchTargets } from '../server'

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

// The child imports SOURCE, so it has to be bun (node cannot load `.ts`).
const src = resolve(import.meta.dirname, '../..')
const moduleUrls = {
  cli: pathToFileURL(join(src, 'cli.ts')).href,
  core: pathToFileURL(join(src, 'core.ts')).href,
}
const execPath = process.versions.bun ? process.execPath : 'bun'

describe('scanInChild', () => {
  it('runs the real scan in a fresh process and returns its catalog', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-rescan-test-')))
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'Badge.tsx'),
      "export function Badge(props: { tone?: 'a' | 'b' | undefined; label: string }) { return null }\n",
    )
    const scan = await scanInChild({ cwd: root, dir: 'src', moduleUrls, execPath, execArgv: [] })
    expect(scan.components.map((c) => c.name)).toEqual(['Badge'])
    const badge = scan.components[0]!
    // Crossed as data: no function survives, the scenarios and verdicts do.
    expect('component' in badge).toBe(false)
    expect(badge.scenarios.length).toBeGreaterThan(0)
    expect(badge.axes).toEqual([{ name: 'tone', values: ['a', 'b'] }])
  }, 60_000)

  it('fails loudly with the child stderr when the scan cannot run', async () => {
    await expect(
      scanInChild({
        cwd: tmpdir(),
        dir: 'src',
        moduleUrls: { cli: 'file:///nonexistent/cli.ts', core: moduleUrls.core },
        execPath,
        execArgv: [],
      }),
    ).rejects.toThrow(/rescan process exited with code [1-9]/)
  }, 60_000)

  it('the child script never prints the catalog to stdout', () => {
    const script = childScanScript(moduleUrls, '/tmp/out.json')
    expect(script).not.toContain('console.log')
    expect(script).toContain('renameSync')
  })
})

describe('watchTargets', () => {
  it('watches the scan root, every project dir and every config candidate', () => {
    const t = watchTargets('/p', '/p/src', [{ dir: '/p/packages/a' }, { dir: '/p/packages/b' }])
    expect(t.dirs).toEqual(['/p/src', '/p/packages/a', '/p/packages/b'])
    expect(t.files).toContain('/p/atlas.config.ts')
    expect(t.files).toContain('/p/pyreon.config.ts')
  })
})
