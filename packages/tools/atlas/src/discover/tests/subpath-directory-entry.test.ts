/**
 * An UNDECLARED subpath whose bare name is a DIRECTORY must resolve to the
 * file inside it, never to the directory itself.
 *
 * `subpathEntry`'s fallback walk tried `<dir>/<subpath>` first with a bare
 * `existsSync`, which a directory satisfies — so `@acme/core/utils` against a
 * package shipping `utils/index.js` handed the loader the DIRECTORY, and the
 * import then failed as `UNLOADABLE_DEPENDENCY` for a module that was right
 * there. `resolveWorkspaceSpecifier` had always used `isFile` for the same
 * walk; this locks the two resolvers to the same answer.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { resolveFromWorkspace } from '../workspace-packages'

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}

it('resolves an undeclared subpath that names a directory to the index FILE inside it', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-subpath-dir-')))
  roots.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'root' }))
  write(root, 'packages/app/package.json', JSON.stringify({ name: 'app' }))
  write(
    root,
    'node_modules/@acme/core/package.json',
    JSON.stringify({ name: '@acme/core', exports: { '.': './index.js' } }),
  )
  write(root, 'node_modules/@acme/core/index.js', '')
  write(root, 'node_modules/@acme/core/utils/index.js', '')

  const resolved = resolveFromWorkspace('@acme/core/utils', [join(root, 'packages/app')])
  expect(resolved).toBe(join(root, 'node_modules/@acme/core/utils/index.js'))
})

it('still declines a subpath that exists as NEITHER a file nor a directory', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-subpath-none-')))
  roots.push(root)
  write(root, 'package.json', JSON.stringify({ name: 'root' }))
  write(root, 'packages/app/package.json', JSON.stringify({ name: 'app' }))
  write(root, 'node_modules/@acme/core/package.json', JSON.stringify({ name: '@acme/core' }))
  expect(resolveFromWorkspace('@acme/core/missing', [join(root, 'packages/app')])).toBeUndefined()
})
