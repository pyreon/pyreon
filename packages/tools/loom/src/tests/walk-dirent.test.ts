/**
 * File discovery asks the OS what an entry IS, rather than inferring it from
 * the name. The inference it replaced — "no dot in the name means directory" —
 * was wrong in both directions, and the first case is a silent correctness bug:
 * a directory with a dot in its name was never descended into, so its source
 * went unscanned and any dependency only IT imported was reported as unused.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { scanPackageImports } from '../core/imports'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

function pkg(build: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'loom-walk-'))
  roots.push(dir)
  build(dir)
  return dir
}

describe('file discovery uses dirent kinds, not filename shape', () => {
  it('descends into a directory whose NAME contains a dot', () => {
    const dir = pkg((d) => {
      mkdirSync(join(d, 'src/v1.2'), { recursive: true })
      writeFileSync(join(d, 'src/v1.2/legacy.ts'), `import { x } from 'only-here'\nexport const y = x`)
    })
    const { prod } = scanPackageImports(dir)
    // Before: `v1.2` contains a dot, so it was classified as a file, never
    // walked, and `only-here` looked like a dependency nobody imports.
    expect([...prod.keys()]).toContain('only-here')
    expect(prod.get('only-here')).toEqual(['src/v1.2/legacy.ts'])
  })

  it('does not try to read an extension-less FILE as a directory', () => {
    const dir = pkg((d) => {
      mkdirSync(join(d, 'src'), { recursive: true })
      writeFileSync(join(d, 'src/Makefile'), 'all:\n\techo hi\n')
      writeFileSync(join(d, 'src/index.ts'), `import { a } from 'real-dep'\nexport const b = a`)
    })
    const { prod } = scanPackageImports(dir)
    expect(prod.get('real-dep')).toEqual(['src/index.ts'])
  })

  it('still stops at a nested package.json — that subtree is its own unit', () => {
    const dir = pkg((d) => {
      mkdirSync(join(d, 'src'), { recursive: true })
      writeFileSync(join(d, 'src/index.ts'), `import { a } from 'mine'\nexport const b = a`)
      mkdirSync(join(d, 'templates/starter/src'), { recursive: true })
      writeFileSync(join(d, 'templates/starter/package.json'), '{"name":"starter"}')
      writeFileSync(join(d, 'templates/starter/src/app.ts'), `import { z } from 'not-mine'`)
    })
    const { prod, dev } = scanPackageImports(dir)
    expect(prod.get('mine')).toEqual(['src/index.ts'])
    expect(prod.has('not-mine')).toBe(false)
    expect(dev.has('not-mine')).toBe(false)
  })

  it('still skips node_modules, lib, dist and dotfiles', () => {
    const dir = pkg((d) => {
      for (const skip of ['node_modules', 'lib', 'dist', '.cache']) {
        mkdirSync(join(d, skip), { recursive: true })
        writeFileSync(join(d, skip, 'x.ts'), `import { q } from 'skipped-dep'`)
      }
      mkdirSync(join(d, 'src'), { recursive: true })
      writeFileSync(join(d, 'src/index.ts'), `import { a } from 'kept-dep'`)
    })
    const { prod, dev, type } = scanPackageImports(dir)
    for (const m of [prod, dev, type]) expect(m.has('skipped-dep')).toBe(false)
    expect(prod.has('kept-dep')).toBe(true)
  })
})
