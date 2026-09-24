/**
 * Scanner correctness — one spec block per defect an audit reproduced against
 * fixtures. Each is a WRONG ANSWER rather than a crash, which is why they
 * survived: a dependency reported unused that is used, an import counted that
 * does not exist, a malformed manifest silently dropped. Every block was
 * bisect-verified (the fix reverted → the block fails; restored → it passes).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { analyzeGraph, readWorkspaceGlobs, scanWorkspace } from '../core'
import { readJsxImportSources, scanPackageImports } from '../core/imports'
import type { WorkspaceModel } from '../core/types'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** A temp dir populated from a `relative path → contents` map. */
function tree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'loom-scan-'))
  roots.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

describe('lib/ and dist/ are build output only at the package ROOT', () => {
  it('scans src/lib/** and src/dist/** — ordinary source directories', () => {
    const dir = tree({
      'src/index.ts': `export * from './lib/store'`,
      'src/lib/store.ts': `import { model } from 'state-lib'\nexport const s = model`,
      'src/dist/x.ts': `import { y } from 'deep-dist-dep'\nexport const z = y`,
    })
    const { prod } = scanPackageImports(dir)
    expect(prod.get('state-lib')).toEqual(['src/lib/store.ts'])
    expect(prod.get('deep-dist-dep')).toEqual(['src/dist/x.ts'])
  })

  it('still skips a ROOT lib/ and dist/', () => {
    const dir = tree({
      'lib/index.js': `import { q } from 'built-dep'`,
      'dist/index.js': `import { q } from 'built-dep'`,
      'src/index.ts': `export const a = 1`,
    })
    const { prod, dev, type } = scanPackageImports(dir)
    for (const m of [prod, dev, type]) expect(m.has('built-dep')).toBe(false)
  })
})

describe('a malformed package.json is an error, not an absence', () => {
  it('a malformed MEMBER manifest throws naming the file', () => {
    const root = tree({
      'package.json': JSON.stringify({ name: 'r', workspaces: ['packages/*'] }),
      'packages/a/package.json': '{ "name": "a", }',
    })
    expect(() => scanWorkspace(root)).toThrow(/packages\/a\/package\.json is not valid JSON/)
  })

  it('a malformed ROOT manifest says so, instead of "no package.json"', () => {
    const root = tree({ 'package.json': '{ "name": ' })
    expect(() => scanWorkspace(root)).toThrow(/\[Pyreon\] loom: .*package\.json is not valid JSON/)
  })

  it('a MISSING root is still the "no package.json" error', () => {
    const root = tree({ 'README.md': 'hi' })
    expect(() => scanWorkspace(root)).toThrow(/no package\.json/)
  })
})

describe('import-specifier grammar', () => {
  it('`typeof import(…)` is a type query, not a runtime import', () => {
    const dir = tree({
      'src/index.ts': `export type Mod = typeof import('type-query-dep')\nexport const n = 1`,
    })
    const { prod, type } = scanPackageImports(dir)
    expect(prod.has('type-query-dep')).toBe(false)
    expect(type.get('type-query-dep')).toEqual(['src/index.ts'])
  })

  it('a plain dynamic import is still runtime', () => {
    const dir = tree({ 'src/index.ts': `export const load = () => import('dyn-dep')` })
    expect(scanPackageImports(dir).prod.has('dyn-dep')).toBe(true)
  })

  it('an identifier or method merely ENDING in a keyword is not an import', () => {
    const dir = tree({
      'src/index.ts': [
        `myrequire('not-a-dep-1')`,
        `reimport('not-a-dep-2')`,
        `loader.import('not-a-dep-3')`,
        `$require('not-a-dep-4')`,
        `import { real } from 'real-dep'`,
        `export const x = real`,
      ].join('\n'),
    })
    const { prod } = scanPackageImports(dir)
    for (const n of ['not-a-dep-1', 'not-a-dep-2', 'not-a-dep-3', 'not-a-dep-4']) expect(prod.has(n)).toBe(false)
    expect(prod.has('real-dep')).toBe(true)
  })

  it('a regex literal holding a backtick or `/*` does not swallow later imports', () => {
    const dir = tree({
      'src/index.ts': [
        'const tick = s.replace(/`/g, "")',
        'const star = /[/*]/.test(s)',
        `import { after } from 'after-regex-dep'`,
        `export const x = after`,
      ].join('\n'),
    })
    expect(scanPackageImports(dir).prod.has('after-regex-dep')).toBe(true)
  })
})

describe('workspace globs', () => {
  it('a `!negation` is matched as a glob, not a literal path', () => {
    const root = tree({
      'package.json': JSON.stringify({ name: 'r', workspaces: ['packages/*', '!packages/*-fixture'] }),
      'packages/real/package.json': JSON.stringify({ name: 'real' }),
      'packages/a-fixture/package.json': JSON.stringify({ name: 'a-fixture' }),
    })
    expect(scanWorkspace(root).packages.map((p) => p.name)).toEqual(['real'])
  })

  it('pnpm-workspace.yaml: only items under `packages:` are globs', () => {
    const root = tree({
      'package.json': JSON.stringify({ name: 'r' }),
      'pnpm-workspace.yaml': [
        '# workspace',
        'packages:',
        "  - 'packages/*'",
        '  - apps/web # trailing comment',
        'onlyBuiltDependencies:',
        '  - esbuild',
        'catalog:',
        '  react: ^19.0.0',
      ].join('\n'),
    })
    expect(readWorkspaceGlobs(root)).toEqual(['packages/*', 'apps/web'])
  })

  it('pnpm-workspace.yaml: the flow form `packages: [a, b]` is read too', () => {
    const root = tree({
      'package.json': JSON.stringify({ name: 'r' }),
      'pnpm-workspace.yaml': "packages: ['packages/*', \"tools/*\"]\nonlyBuiltDependencies:\n  - esbuild\n",
    })
    expect(readWorkspaceGlobs(root)).toEqual(['packages/*', 'tools/*'])
  })
})

describe('graph edges', () => {
  it('a dep in BOTH dependencies and peerDependencies is ONE runtime edge', () => {
    const model = {
      root: { dir: '.', overrides: {}, workspaceGlobs: [], ignores: [], devPaths: [] },
      packages: [
        { name: 'host', version: '1.0.0', dir: 'h', private: false, deps: [] },
        {
          name: 'plugin',
          version: '1.0.0',
          dir: 'p',
          private: false,
          deps: [
            { name: 'host', range: 'workspace:*', field: 'dependencies' },
            { name: 'host', range: '^1.0.0', field: 'peerDependencies' },
            { name: 'host', range: 'workspace:*', field: 'devDependencies' },
          ],
        },
      ],
    } as unknown as WorkspaceModel
    const g = analyzeGraph(model)
    expect(g.edges).toEqual([['plugin', 'host']])
    expect(g.devEdges).toEqual([['plugin', 'host']])
    expect(g.reach.host).toBe(1)
  })
})

describe('`jsxImportSource` counts as a use', () => {
  it('a preset json published through `exports` marks its jsxImportSource used', () => {
    const dir = tree({
      'package.json': JSON.stringify({
        name: 'preset',
        exports: { '.': './base.json' },
        dependencies: { 'jsx-lib': '^1.0.0' },
      }),
      'base.json': '{\n  // JSONC\n  "compilerOptions": { "jsxImportSource": "jsx-lib", },\n}',
    })
    expect(readJsxImportSources(dir).get('jsx-lib')).toBe('base.json')
    const { prod, type } = scanPackageImports(dir)
    expect(type.get('jsx-lib')).toEqual(['base.json'])
    // Type bucket only: a config file must never manufacture a phantom.
    expect(prod.has('jsx-lib')).toBe(false)
  })

  it('a root tsconfig.json with a relative extends is followed', () => {
    const dir = tree({
      'package.json': JSON.stringify({ name: 'app' }),
      'tsconfig.json': '{ "extends": "./tsconfig.base.json" }',
      'tsconfig.base.json': '{ "compilerOptions": { "jsxImportSource": "@scope/jsx" } }',
    })
    expect(readJsxImportSources(dir).has('@scope/jsx')).toBe(true)
  })
})
