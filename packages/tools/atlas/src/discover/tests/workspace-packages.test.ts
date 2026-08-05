/**
 * Resolving a prop type imported from a SIBLING workspace package.
 *
 * `resolve-types` deliberately refuses bare specifiers into `node_modules` —
 * that needs the real module-resolution algorithm, and guessing produces
 * confident wrong answers. A workspace package is a different question with an
 * exact answer: the workspace declares where its packages are, each declares
 * its name, and matching the two is a lookup.
 *
 * The distinction is the whole point of this file, so it is asserted in both
 * directions: a sibling resolves, a real third-party dependency does not.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPackageMap,
  entryFromExports,
  packageEntry,
  resolveWorkspaceSpecifier,
  workspaceResolvePlugin,
} from '../workspace-packages'
import { createTypeResolver } from '../resolve-types'
import { scanSource } from '../scan'

let root: string
const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-wsp-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('entryFromExports', () => {
  it('reads a bare string', () => {
    expect(entryFromExports('./src/index.ts')).toBe('./src/index.ts')
  })

  it('reads a conditions object, preferring source conditions', () => {
    expect(entryFromExports({ require: './dist/i.js', import: './src/index.ts' })).toBe(
      './src/index.ts',
    )
  })

  it('prefers `types` — it is the one guaranteed to carry the contract', () => {
    expect(entryFromExports({ types: './src/index.ts', import: './dist/i.js' })).toBe(
      './src/index.ts',
    )
  })

  it('reads the root of a subpath map, ignoring other subpaths', () => {
    expect(entryFromExports({ '.': './src/index.ts', './x': './src/x.ts' })).toBe('./src/index.ts')
  })

  it('is undefined for a shape it does not understand', () => {
    expect(entryFromExports(undefined)).toBeUndefined()
    expect(entryFromExports(42)).toBeUndefined()
  })
})

describe('packageEntry', () => {
  it('follows exports to the source entry', () => {
    write('p/package.json', JSON.stringify({ name: '@a/p', exports: { import: './src/index.ts' } }))
    write('p/src/index.ts', 'export interface Props { a: string }')
    expect(packageEntry(join(root, 'p'))).toBe(join(root, 'p/src/index.ts'))
  })

  it('falls back to src/index.ts when nothing is declared', () => {
    write('p/package.json', JSON.stringify({ name: '@a/p' }))
    write('p/src/index.ts', 'export interface Props { a: string }')
    expect(packageEntry(join(root, 'p'))).toBe(join(root, 'p/src/index.ts'))
  })

  it('prefers the SOURCE twin of a built entry', () => {
    // A `dist/` build is stale and stripped of the types this needs.
    write('p/package.json', JSON.stringify({ name: '@a/p', main: './index.js' }))
    write('p/index.ts', 'export interface Props { a: string }')
    expect(packageEntry(join(root, 'p'))).toBe(join(root, 'p/index.ts'))
  })
})

describe('resolveWorkspaceSpecifier', () => {
  const setup = () => {
    write('packages/ui/package.json', JSON.stringify({ name: '@a/ui', exports: './src/index.ts' }))
    write('packages/ui/src/index.ts', 'export interface Props { a: string }')
    write('packages/ui/src/types.ts', 'export interface Deep { b: number }')
    write('packages/ui-grid/package.json', JSON.stringify({ name: '@a/ui-grid' }))
    write('packages/ui-grid/src/index.ts', 'export interface Grid { c: boolean }')
    return buildPackageMap([join(root, 'packages/ui'), join(root, 'packages/ui-grid')])
  }

  it('resolves a package root', () => {
    expect(resolveWorkspaceSpecifier('@a/ui', setup())).toBe(join(root, 'packages/ui/src/index.ts'))
  })

  it('resolves a SUBPATH', () => {
    expect(resolveWorkspaceSpecifier('@a/ui/types', setup())).toBe(
      join(root, 'packages/ui/src/types.ts'),
    )
  })

  it('picks the LONGEST matching package name', () => {
    // `@a/ui-grid` must never be resolved by a lookup for `@a/ui`.
    expect(resolveWorkspaceSpecifier('@a/ui-grid', setup())).toBe(
      join(root, 'packages/ui-grid/src/index.ts'),
    )
  })

  it('does NOT resolve a real third-party dependency', () => {
    // The distinction this file exists for. A workspace sibling is a lookup;
    // node_modules is an algorithm, and guessing at it is worse than `unknown`.
    expect(resolveWorkspaceSpecifier('react', setup())).toBeUndefined()
    expect(resolveWorkspaceSpecifier('@vendor/thing', setup())).toBeUndefined()
  })

  it('does not touch relative specifiers', () => {
    expect(resolveWorkspaceSpecifier('./types', setup())).toBeUndefined()
  })

  it('resolves a subpath to the FILE when a directory shares its name', () => {
    // The shape that broke the static build: a barrel `src/ui.ts` sitting next
    // to its implementation folder `src/ui/`. The probe list starts with the
    // bare `''` extension, so an existence check matched the DIRECTORY and
    // returned it — the bundler then failed with `UNLOADABLE_DEPENDENCY: Could
    // not load .../src/ui`, which reads as a broken package rather than a
    // resolver that stopped one candidate too early.
    //
    // `@pyreon/atlas/ui` is exactly this shape, so it is the specifier the
    // generated entry of every `atlas build` depends on.
    write('packages/kit/package.json', JSON.stringify({ name: '@a/kit' }))
    write('packages/kit/src/index.ts', 'export {}')
    write('packages/kit/src/ui.ts', 'export const Workbench = 1')
    write('packages/kit/src/ui/Workbench.tsx', 'export const Inner = 1')
    const packages = buildPackageMap([join(root, 'packages/kit')])

    expect(resolveWorkspaceSpecifier('@a/kit/ui', packages)).toBe(
      join(root, 'packages/kit/src/ui.ts'),
    )
  })

  it('still resolves a subpath that is ONLY a directory, via its index', () => {
    // The companion direction: preferring a file must not stop a plain
    // `folder/index.ts` subpath from resolving.
    write('packages/only-dir/package.json', JSON.stringify({ name: '@a/only-dir' }))
    write('packages/only-dir/src/index.ts', 'export {}')
    write('packages/only-dir/src/panels/index.ts', 'export const P = 1')
    const packages = buildPackageMap([join(root, 'packages/only-dir')])

    expect(resolveWorkspaceSpecifier('@a/only-dir/panels', packages)).toBe(
      join(root, 'packages/only-dir/src/panels/index.ts'),
    )
  })
})

describe('end to end — a component whose props live in a sibling package', () => {
  it('resolves the contract', () => {
    // The dominant shape in a real monorepo, and without this those components
    // land in the catalog found-but-contract-less.
    write('packages/ui/package.json', JSON.stringify({ name: '@a/ui', exports: './src/index.ts' }))
    write('packages/ui/src/index.ts', "export interface ButtonProps { label: string; tone?: 'a' | 'b' }")
    const packages = buildPackageMap([join(root, 'packages/ui')])

    const code =
      "import type { ButtonProps } from '@a/ui'\nexport function Button(props: ButtonProps) {}"
    const [component] = scanSource(code, join(root, 'apps/app/src/Button.tsx'), {
      resolveImportedType: createTypeResolver({ packages }),
    })

    expect(component?.controls.map((c) => c.name)).toEqual(['label', 'tone'])
    expect(component?.axes).toEqual([{ name: 'tone', values: ['a', 'b'] }])
  })

  it('leaves a third-party props type as an honest unknown', () => {
    const packages = buildPackageMap([])
    const code = "import type { Props } from 'some-lib'\nexport function Button(props: Props) {}"
    const [component] = scanSource(code, join(root, 'src/Button.tsx'), {
      resolveImportedType: createTypeResolver({ packages }),
    })
    expect(component?.name).toBe('Button')
    expect(component?.controls).toEqual([])
  })
})

describe('buildPackageMap', () => {
  it('skips directories that are not packages', () => {
    mkdirSync(join(root, 'not-a-package'), { recursive: true })
    expect(buildPackageMap([join(root, 'not-a-package')]).size).toBe(0)
  })

  it('FIRST wins on a duplicate name — order must not decide resolution', () => {
    write('a/package.json', JSON.stringify({ name: '@a/dup' }))
    write('b/package.json', JSON.stringify({ name: '@a/dup' }))
    const map = buildPackageMap([join(root, 'a'), join(root, 'b')])
    expect(map.get('@a/dup')).toBe(join(root, 'a'))
  })
})

describe('workspaceResolvePlugin — Atlas resolving its OWN package', () => {
  /**
   * The bug this locks: `atlas build` only worked against a project that
   * happened to declare `@pyreon/atlas` as a dependency.
   *
   * The generated entry lives in `<project>/node_modules/.atlas-build/` and is
   * Atlas's UI code, so it imports `@pyreon/atlas/ui`. Resolution walks up from
   * there looking for `node_modules/@pyreon/atlas` — and a package manager
   * NEVER links a package inside its own `node_modules`, nor above it unless
   * some project declares it. Every other framework package resolved (those sit
   * in Atlas's own `node_modules`); the workbench itself did not:
   *
   *   Rolldown failed to resolve import "@pyreon/atlas/ui"
   *
   * A component library never declares the workbench — you point the tool AT
   * it — so this failed on every real package in a monorepo, which is the case
   * the static build exists for.
   *
   * Asserted against the REAL Atlas package (the plugin derives its own
   * directory from this module's location), because that is the copy a build
   * has to reach.
   */
  const generatedImporter = (): string => join(root, 'node_modules/.atlas-build/entry.js')

  it('resolves @pyreon/atlas/ui from a project that does not depend on Atlas', () => {
    write('package.json', JSON.stringify({ name: '@a/lib', dependencies: {} }))
    const resolved = workspaceResolvePlugin(root).resolveId('@pyreon/atlas/ui', generatedImporter())

    expect(resolved).toBeDefined()
    expect(resolved).toMatch(/atlas[/\\](?:src[/\\]ui\.ts|lib[/\\]ui\.js)$/)
  })

  it('claims NOTHING a project file imports', () => {
    // The hard-won constraint: answering for a project's own import hands back
    // one id while Vite resolving the same specifier reaches another, the
    // framework loads twice, and the workbench dies on a split reactivity
    // instance. Widening the fallback must not widen this.
    write('package.json', JSON.stringify({ name: '@a/lib' }))
    const plugin = workspaceResolvePlugin(root)

    expect(plugin.resolveId('@pyreon/atlas/ui', join(root, 'src/Button.tsx'))).toBeUndefined()
    expect(plugin.resolveId('@pyreon/core', join(root, 'src/Button.tsx'))).toBeUndefined()
    expect(plugin.resolveId('@pyreon/atlas/ui', undefined)).toBeUndefined()
  })
})
