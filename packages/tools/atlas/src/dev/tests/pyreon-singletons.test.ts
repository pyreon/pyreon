/**
 * `collectPyreonPackages` (#3846): the set of `@pyreon/*` packages the
 * workbench must keep out of Vite's dependency optimizer and dedupe.
 *
 * The real-browser proof is `e2e/atlas-dev.spec.ts` ("cold dependency cache");
 * these pin the derivation itself — in particular that a package declared or
 * linked ONLY by a component package (never by the root manifest) is included,
 * which is exactly the case the Pyreon Vite plugin's root-only scan misses.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectPyreonPackages } from '../pyreon-singletons'

let roots: string[] = []
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
  roots = []
})

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-singletons-'))
  roots.push(dir)
  return dir
}

function manifest(dir: string, body: object): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(body))
}

describe('collectPyreonPackages', () => {
  it('includes a package only a COMPONENT package declares, not just the root manifest', () => {
    const root = tmp()
    manifest(root, { name: 'root', devDependencies: { '@pyreon/core': '*' } })
    const counter = join(root, 'packages/counter')
    manifest(counter, { name: '@example/counter', dependencies: { '@pyreon/store': '*', lodash: '*' } })
    expect(collectPyreonPackages([counter, root])).toEqual(['@pyreon/core', '@pyreon/store'])
  })

  it('reads every dependency field', () => {
    const root = tmp()
    manifest(root, {
      dependencies: { '@pyreon/a': '*' },
      devDependencies: { '@pyreon/b': '*' },
      peerDependencies: { '@pyreon/c': '*' },
      optionalDependencies: { '@pyreon/d': '*' },
    })
    expect(collectPyreonPackages([root])).toEqual(['@pyreon/a', '@pyreon/b', '@pyreon/c', '@pyreon/d'])
  })

  it('includes what is INSTALLED beside a package (a transitive dep nobody declared)', () => {
    const root = tmp()
    const pkg = join(root, 'packages/ui')
    manifest(pkg, { name: '@example/ui' })
    mkdirSync(join(root, 'node_modules/@pyreon/router'), { recursive: true })
    mkdirSync(join(pkg, 'node_modules/@pyreon'), { recursive: true })
    symlinkSync(join(root, 'node_modules/@pyreon/router'), join(pkg, 'node_modules/@pyreon/head'), 'dir')
    // A non-directory entry in the scope is not a package.
    writeFileSync(join(pkg, 'node_modules/@pyreon/README.md'), 'x')
    expect(collectPyreonPackages([pkg])).toEqual(['@pyreon/head', '@pyreon/router'])
  })

  it('ignores non-Pyreon packages and survives a missing or malformed manifest', () => {
    const root = tmp()
    manifest(root, { dependencies: { react: '*', '@acme/ui': '*' } })
    const broken = join(root, 'broken')
    mkdirSync(broken)
    writeFileSync(join(broken, 'package.json'), '{ not json')
    expect(collectPyreonPackages([root, broken, join(root, 'does-not-exist')])).toEqual([])
  })

  it('is sorted and de-duplicated', () => {
    const root = tmp()
    manifest(root, { dependencies: { '@pyreon/z': '*', '@pyreon/a': '*' } })
    const other = join(root, 'p')
    manifest(other, { dependencies: { '@pyreon/a': '*' } })
    expect(collectPyreonPackages([root, other])).toEqual(['@pyreon/a', '@pyreon/z'])
  })
})
