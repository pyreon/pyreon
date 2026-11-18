import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entryFiles, packageOf, specifiersOf, undeclaredImports, type PackageJson } from '../../../../../scripts/check-declared-imports'

/**
 * `check-declared-imports` reads each published entry's built `lib/` and requires every bare import it reaches to be declared:
 * the packed-tarball failure where `@pyreon/ambient` marked `@pyreon/core` an optional peer yet imported it unconditionally.
 */
describe('specifiersOf', () => {
  it('reads static imports, re-exports and literal dynamic imports from the AST, never from comments or strings', () => {
    const code = [
      "import a from 'x'",
      "import { b } from './local.js'",
      "export * from 'y'",
      "export { c } from 'z'",
      "const lazy = import('dyn')",
      "// import 'in-a-comment'",
      "const s = \"from 'in-a-string'\"",
    ].join('\n')

    expect(specifiersOf(code)).toEqual({ statics: ['x', './local.js', 'y', 'z'], dynamics: ['dyn'] })
  })
})

describe('packageOf and entryFiles', () => {
  it('names the package of a bare specifier', () => {
    expect(packageOf('@pyreon/core')).toBe('@pyreon/core')
    expect(packageOf('@pyreon/native-compiler/plugin-api')).toBe('@pyreon/native-compiler')
    expect(packageOf('zod/v4')).toBe('zod')
  })

  it('takes import, then default, never the bun source or the types condition', () => {
    expect(entryFiles({ '.': { bun: './src/index.ts', import: './lib/index.js', types: './lib/types/index.d.ts' }, './x': { default: './lib/x.js' } })).toEqual([
      { subpath: '.', file: './lib/index.js' },
      { subpath: './x', file: './lib/x.js' },
    ])
  })
})

describe('undeclaredImports', () => {
  const dirs: string[] = []

  function pkgWith(files: Record<string, string>, pkg: Partial<PackageJson>): { dir: string; json: PackageJson } {
    const dir = mkdtempSync(join(tmpdir(), 'declared-imports-'))

    dirs.push(dir)
    for (const [name, code] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), code)
    }

    return { dir, json: { name: '@pyreon/fixture', exports: { '.': { import: './lib/index.js' }, './extra': { import: './lib/extra.js' } }, ...pkg } }
  }

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('an optional peer imported by the root entry, through a shared chunk, is an offender (the ambient failure)', () => {
    const { dir, json } = pkgWith(
      { 'lib/index.js': "import { x } from './_chunks/c.js'\nexport { x }", 'lib/_chunks/c.js': "import { provide } from '@pyreon/core'\nexport const x = provide" },
      { peerDependencies: { '@pyreon/core': '1' }, peerDependenciesMeta: { '@pyreon/core': { optional: true } } },
    )
    const { offenders, built } = undeclaredImports(dir, json)

    expect(built).toBe(true)
    expect(offenders.map((o) => [o.subpath, o.specifier])).toEqual([['.', '@pyreon/core']])
    expect(offenders[0]?.reason).toMatch(/OPTIONAL peer/)
  })

  it('the same import is fine once the peer is required', () => {
    const { dir, json } = pkgWith(
      { 'lib/index.js': "import { provide } from '@pyreon/core'\nexport { provide }" },
      { peerDependencies: { '@pyreon/core': '1' } },
    )

    expect(undeclaredImports(dir, json).offenders).toEqual([])
  })

  it('an optional peer may be imported statically by a non-root subpath, and dynamically by any entry', () => {
    const { dir, json } = pkgWith(
      { 'lib/index.js': "export const load = () => import('@pyreon/router')", 'lib/extra.js': "import { r } from '@pyreon/router'\nexport { r }" },
      { peerDependencies: { '@pyreon/router': '1' }, peerDependenciesMeta: { '@pyreon/router': { optional: true } } },
    )

    expect(undeclaredImports(dir, json).offenders).toEqual([])
  })

  it('an undeclared package is an offender whichever way it is imported; node builtins and the package itself are not', () => {
    const { dir, json } = pkgWith(
      { 'lib/index.js': "import 'node:fs'\nimport 'path'\nimport '@pyreon/fixture/extra'\nimport 'lodash'\nexport const l = () => import('left-pad')", 'lib/extra.js': 'export {}' },
      {},
    )

    expect(undeclaredImports(dir, json).offenders.map((o) => o.specifier).sort()).toEqual(['left-pad', 'lodash'])
  })

  it('a package that is not built is reported as such, not as clean', () => {
    const { dir, json } = pkgWith({}, {})

    expect(undeclaredImports(dir, json)).toEqual({ offenders: [], built: false })
  })
})
