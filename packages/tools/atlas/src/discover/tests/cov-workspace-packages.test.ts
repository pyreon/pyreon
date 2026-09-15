/**
 * Resolving a workspace package — entry selection and the subpath walk.
 *
 * The failure mode throughout is a WRONG FILE rather than an error: a built
 * `dist/index.js` instead of its source twin loses the types, a directory
 * matched where a file was meant produces `UNLOADABLE_DEPENDENCY`, and a
 * prefix match hands `@acme/ui-grid`'s import to `@acme/ui`. Each is asserted
 * against the alternative it must NOT pick.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  buildPackageMap,
  entryFromExports,
  packageEntry,
  resolveFromWorkspace,
  resolveWorkspaceSpecifier,
} from '../workspace-packages'

const roots: string[] = []
const tempDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-cov-wp-')))
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const write = (root: string, relative: string, source: string): string => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
  return path
}
const pkg = (root: string, relative: string, json: unknown): void => {
  write(root, join(relative, 'package.json'), JSON.stringify(json))
}

describe('entryFromExports — the shapes a workspace actually writes', () => {
  it('takes a bare string', () => {
    expect(entryFromExports('./src/index.ts')).toBe('./src/index.ts')
  })

  it('takes a subpath map s root entry, string or conditions', () => {
    expect(entryFromExports({ '.': './src/index.ts', './sub': './src/sub.ts' })).toBe('./src/index.ts')
    expect(entryFromExports({ '.': { types: './lib/index.d.ts' } })).toBe('./lib/index.d.ts')
  })

  it('reads a bare conditions object with no subpath map', () => {
    expect(entryFromExports({ import: './lib/index.js' })).toBe('./lib/index.js')
  })

  it('is undefined for shapes that name no entry', () => {
    expect(entryFromExports(undefined)).toBeUndefined()
    expect(entryFromExports(null)).toBeUndefined()
    expect(entryFromExports(42)).toBeUndefined()
    // A root entry that is neither a string nor an object.
    expect(entryFromExports({ '.': 42 })).toBeUndefined()
    // Conditions present, but none of the ones either order asks for.
    expect(entryFromExports({ '.': { browser: './b.js' } })).toBeUndefined()
    expect(entryFromExports({ '.': { require: './r.cjs' } }, 'types')).toBeUndefined()
  })
})

describe('packageEntry — what a package s root export points at', () => {
  it('is undefined for a directory with no package.json', () => {
    expect(packageEntry(tempDir())).toBeUndefined()
  })

  it('falls back to `module`, then `main`, then the conventional source paths', () => {
    const a = tempDir()
    pkg(a, '.', { name: 'a', module: './esm/index.js' })
    const esm = write(a, 'esm/index.js', '')
    expect(packageEntry(a)).toBe(esm)

    const b = tempDir()
    pkg(b, '.', { name: 'b', main: 'main.js' })
    const main = write(b, 'main.js', '')
    expect(packageEntry(b)).toBe(main)

    const c = tempDir()
    pkg(c, '.', { name: 'c' })
    const src = write(c, 'src/index.ts', '')
    expect(packageEntry(c)).toBe(src)

    const d = tempDir()
    pkg(d, '.', { name: 'd' })
    const tsx = write(d, 'src/index.tsx', '')
    expect(packageEntry(d)).toBe(tsx)

    const e = tempDir()
    pkg(e, '.', { name: 'e' })
    const root = write(e, 'index.ts', '')
    expect(packageEntry(e)).toBe(root)
  })

  it('prefers the SOURCE twin of a built entry — the built copy is stale and untyped', () => {
    const root = tempDir()
    pkg(root, '.', { name: 'x', main: 'dist/index.js' })
    const source = write(root, 'dist/index.ts', '')
    expect(packageEntry(root)).toBe(source)
  })

  it('takes the built entry when it EXISTS — the twin is a fallback, not an override', () => {
    const root = tempDir()
    pkg(root, '.', { name: 'x', main: 'dist/index.js' })
    const built = write(root, 'dist/index.js', '')
    write(root, 'dist/index.ts', '')
    expect(packageEntry(root)).toBe(built)
  })

  it('is undefined when every candidate is declared but absent from disk', () => {
    const root = tempDir()
    pkg(root, '.', { name: 'x', main: 'dist/index.js', module: 'esm/index.js' })
    expect(packageEntry(root)).toBeUndefined()
  })

  it('answers the RUNTIME question differently from the types one', () => {
    const root = tempDir()
    pkg(root, '.', { name: 'x', exports: { types: './types.d.ts', bun: './src/index.ts' } })
    const types = write(root, 'types.d.ts', '')
    const source = write(root, 'src/index.ts', '')
    expect(packageEntry(root, 'types')).toBe(types)
    expect(packageEntry(root, 'runtime')).toBe(source)
  })
})

describe('resolveWorkspaceSpecifier', () => {
  const workspace = () => {
    const root = tempDir()
    pkg(root, 'packages/ui', { name: '@acme/ui', main: 'src/index.ts' })
    write(root, 'packages/ui/src/index.ts', '')
    write(root, 'packages/ui/src/button.ts', '')
    write(root, 'packages/ui/src/ui.ts', '')
    mkdirSync(join(root, 'packages/ui/src/ui'), { recursive: true })
    pkg(root, 'packages/ui-grid', { name: '@acme/ui-grid', main: 'src/index.ts' })
    write(root, 'packages/ui-grid/src/index.ts', '')
    const packages = buildPackageMap([join(root, 'packages/ui'), join(root, 'packages/ui-grid')])
    return { root, packages }
  }

  it('declines a RELATIVE specifier — that is the other resolver s question', () => {
    const { packages } = workspace()
    expect(resolveWorkspaceSpecifier('./types', packages)).toBeUndefined()
  })

  it('resolves a package by exact name', () => {
    const { root, packages } = workspace()
    expect(resolveWorkspaceSpecifier('@acme/ui', packages)).toBe(join(root, 'packages/ui/src/index.ts'))
  })

  it('resolves a SUBPATH, including under `src`', () => {
    const { root, packages } = workspace()
    expect(resolveWorkspaceSpecifier('@acme/ui/button', packages)).toBe(
      join(root, 'packages/ui/src/button.ts'),
    )
  })

  it('never lets `@acme/ui` claim `@acme/ui-grid` — longest name wins', () => {
    const { root, packages } = workspace()
    // The prefix test is `name + "/"`, so the sibling is not even a candidate…
    expect(resolveWorkspaceSpecifier('@acme/ui-grid', packages)).toBe(
      join(root, 'packages/ui-grid/src/index.ts'),
    )
    // …and with a subpath the LONGEST matching name is chosen.
    write(root, 'packages/ui-grid/src/cell.ts', '')
    expect(resolveWorkspaceSpecifier('@acme/ui-grid/cell', packages)).toBe(
      join(root, 'packages/ui-grid/src/cell.ts'),
    )
  })

  it('takes the FILE when a barrel sits beside a folder of the same name', () => {
    // `src/ui.ts` next to `src/ui/` is the normal barrel shape; matching the
    // DIRECTORY produced `UNLOADABLE_DEPENDENCY: Could not load .../src/ui`.
    const { root, packages } = workspace()
    expect(resolveWorkspaceSpecifier('@acme/ui/ui', packages)).toBe(join(root, 'packages/ui/src/ui.ts'))
  })

  it('is undefined for a package the workspace does not own, and for an absent subpath', () => {
    const { packages } = workspace()
    expect(resolveWorkspaceSpecifier('react', packages)).toBeUndefined()
    expect(resolveWorkspaceSpecifier('@acme/ui/nope', packages)).toBeUndefined()
  })
})

describe('resolveFromWorkspace — resolve as a package that DECLARES it would', () => {
  const installed = () => {
    const root = tempDir()
    pkg(root, '.', { name: 'root' })
    mkdirSync(join(root, 'packages/app'), { recursive: true })
    pkg(root, 'packages/app', { name: 'app' })
    pkg(root, 'node_modules/@acme/core', {
      name: '@acme/core',
      exports: { '.': { bun: './src/index.ts' }, './sub': { bun: './src/sub.ts' } },
    })
    write(root, 'node_modules/@acme/core/src/index.ts', '')
    write(root, 'node_modules/@acme/core/src/sub.ts', '')
    write(root, 'node_modules/@acme/core/plain.js', '')
    return root
  }

  it('walks UP from the package to the root s node_modules', () => {
    const root = installed()
    expect(resolveFromWorkspace('@acme/core', [join(root, 'packages/app')])).toBe(
      join(root, 'node_modules/@acme/core/src/index.ts'),
    )
  })

  it('resolves a DECLARED subpath through the exports map', () => {
    const root = installed()
    expect(resolveFromWorkspace('@acme/core/sub', [join(root, 'packages/app')])).toBe(
      join(root, 'node_modules/@acme/core/src/sub.ts'),
    )
  })

  it('falls back to the file on disk for an UNdeclared subpath', () => {
    const root = installed()
    expect(resolveFromWorkspace('@acme/core/plain', [join(root, 'packages/app')])).toBe(
      join(root, 'node_modules/@acme/core/plain.js'),
    )
  })

  it('declines relative and absolute specifiers, and an empty one', () => {
    const root = installed()
    const dirs = [join(root, 'packages/app')]
    expect(resolveFromWorkspace('./local', dirs)).toBeUndefined()
    expect(resolveFromWorkspace('/abs/path', dirs)).toBeUndefined()
    expect(resolveFromWorkspace('', dirs)).toBeUndefined()
  })

  it('is undefined for a SUBPATH the installed package does not carry', () => {
    const root = installed()
    expect(resolveFromWorkspace('@acme/core/nope', [join(root, 'packages/app')])).toBeUndefined()
  })

  it('is undefined for a package nothing in the walk has installed', () => {
    const root = installed()
    expect(resolveFromWorkspace('@acme/missing', [join(root, 'packages/app')])).toBeUndefined()
  })

  it('is undefined when the directory is present but carries no readable entry', () => {
    const root = tempDir()
    mkdirSync(join(root, 'node_modules/@acme/empty'), { recursive: true })
    expect(resolveFromWorkspace('@acme/empty', [root])).toBeUndefined()
  })

  it('resolves an UNSCOPED name by its first segment', () => {
    const root = tempDir()
    pkg(root, 'node_modules/tiny', { name: 'tiny', main: 'index.js' })
    write(root, 'node_modules/tiny/index.js', '')
    expect(resolveFromWorkspace('tiny', [root])).toBe(join(root, 'node_modules/tiny/index.js'))
  })
})
