/**
 * The edges left over: the discovery plugin's two passes, the readers' failure
 * paths, and the config-alias tier that only a real Vite answers.
 *
 * These are all "could not read it" branches, and they matter for the reason
 * this package exists: a scan that silently reports zero is indistinguishable
 * from a package that genuinely has none.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { fileDiscoveryPlugin } from '../discover'
import type { ModuleLoader } from '../load'
import { projectAlias } from '../project-alias'
import { collectImportedTypes, createTypeResolver } from '../resolve-types'
import { pascalExports } from '../unmatched'
import { readWorkspaceGlobs, workspacePackageDirs } from '../workspace'
import { resolveFromWorkspace } from '../workspace-packages'

const roots: string[] = []
const tempDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-cov-edge-')))
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

describe('fileDiscoveryPlugin — one owner for both passes', () => {
  const rocketstyleChain = Object.assign(() => null, {
    IS_ROCKETSTYLE: true,
    getStaticDimensions: () => ({ dimensions: { state: { primary: 1 } } }),
  })

  /** A loader that answers for one absolute file and nothing else. */
  const loaderFor = (file: string, mod: Record<string, unknown>): ModuleLoader => ({
    kind: 'vite',
    close: async () => {},
    load: async (requested: string) => {
      if (requested !== file) throw new Error(`Failed to load url ${requested}`)
      return mod
    },
  })

  const project = () => {
    const root = tempDir()
    const chainFile = write(root, 'src/Chain.ts', 'export const Chain = el.attrs({}).theme(() => ({}))\n')
    write(root, 'src/Button.tsx', 'export function Button(props: { label: string }) { return null }')
    return { root, chainFile }
  }

  it('runs the static pass alone when no rocketstyle loader is supplied', async () => {
    const { root } = project()
    const plugin = fileDiscoveryPlugin({ cwd: root })
    const found = await plugin.discover!({ cwd: root })
    expect(found.map((c) => c.name)).toEqual(['Button'])
  })

  it('adds the chains the static scan structurally cannot see', async () => {
    const { root, chainFile } = project()
    const plugin = fileDiscoveryPlugin({
      cwd: root,
      rocketstyle: { loader: loaderFor(chainFile, { Chain: rocketstyleChain }) },
    })
    const found = await plugin.discover!({ cwd: root })
    expect(found.map((c) => c.name).sort()).toEqual(['Button', 'Chain'])
  })

  it('emits a component found by BOTH passes exactly once', async () => {
    // Two entries under one name would double every scenario it generates.
    const { root, chainFile } = project()
    const plugin = fileDiscoveryPlugin({
      cwd: root,
      rocketstyle: { loader: loaderFor(chainFile, { Button: rocketstyleChain, Chain: rocketstyleChain }) },
    })
    const found = await plugin.discover!({ cwd: root })
    expect(found.filter((c) => c.name === 'Button')).toHaveLength(1)
  })

  it('stamps the project onto BOTH passes — a chain in package A is package A s', async () => {
    // Missing it here re-opens the cross-package collision for exactly the
    // components the static scan cannot see.
    const { root, chainFile } = project()
    const plugin = fileDiscoveryPlugin({
      cwd: root,
      project: 'core',
      rocketstyle: { loader: loaderFor(chainFile, { Chain: rocketstyleChain }) },
    })
    const found = await plugin.discover!({ cwd: root })
    expect(found.every((c) => c.project === 'core')).toBe(true)
  })

  it('takes the context cwd when the options do not name one', async () => {
    const { root } = project()
    const found = await fileDiscoveryPlugin({}).discover!({ cwd: root })
    expect(found.map((c) => c.name)).toEqual(['Button'])
  })

  it('leaves an uppercase export that is NOT a rocketstyle chain alone', async () => {
    const { root, chainFile } = project()
    const plugin = fileDiscoveryPlugin({
      cwd: root,
      rocketstyle: { loader: loaderFor(chainFile, { Helper: () => null }) },
    })
    const found = await plugin.discover!({ cwd: root })
    expect(found.map((c) => c.name)).toEqual(['Button'])
  })
})

describe('readers that meet something unreadable', () => {
  it('reads no workspace globs from a DIRECTORY named pnpm-workspace.yaml', () => {
    const root = tempDir()
    writeFileSync(join(root, 'package.json'), '{}')
    mkdirSync(join(root, 'pnpm-workspace.yaml'), { recursive: true })
    expect(readWorkspaceGlobs(root)).toEqual([])
    expect(workspacePackageDirs(root)).toEqual([])
  })

  it('reads no globs from a root with no package.json at all', () => {
    expect(readWorkspaceGlobs(tempDir())).toEqual([])
  })

  it('expands a glob past a directory it cannot list, rather than throwing', () => {
    // `packages/*` where one child is unreadable: the walk returns what it can.
    const root = tempDir()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/**'] }))
    write(root, 'packages/ui/package.json', '{}')
    writeFileSync(join(root, 'packages/not-a-dir'), 'a file where a package would be')
    expect(workspacePackageDirs(root)).toEqual([join(root, 'packages/ui')])
  })

  it('returns nothing for unparseable source rather than failing the report', () => {
    // A `.ts` file read as TS, containing something no parser can accept.
    expect(pascalExports('export const = = =', '/p/x.ts')).toEqual([])
  })
})

describe('resolve-types — the shapes the walk declines', () => {
  const parse = (file: string, source: string): ts.SourceFile =>
    ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = (source: string) => collectImportedTypes(parse('/p/Button.tsx', source))

  it('ignores a namespace re-export — `export * as ns` exposes a NAMESPACE, not the name', () => {
    const files: Record<string, string> = {
      '/p/barrel.ts': "export * as types from './real'",
      '/p/real.ts': 'export interface Props { label: string }',
    }
    const resolve = createTypeResolver({
      readSource: (file) => {
        const source = files[file]
        if (source === undefined) throw new Error(`ENOENT ${file}`)
        return source
      },
      resolveFile: (specifier, from) => {
        const dir = from.slice(0, from.lastIndexOf('/'))
        const base = `${dir}/${specifier.replace(/^\.\//, '')}.ts`
        return files[base] === undefined ? undefined : base
      },
    })
    expect(resolve('Props', imports("import type { Props } from './barrel'"), '/p/Button.tsx')).toBeUndefined()
  })

  it('stops when an INTERMEDIATE file s own import does not resolve', () => {
    const files: Record<string, string> = {
      '/p/middle.ts': "import type { Props } from './gone'\nexport type { Props }",
    }
    const resolve = createTypeResolver({
      readSource: (file) => {
        const source = files[file]
        if (source === undefined) throw new Error(`ENOENT ${file}`)
        return source
      },
      resolveFile: (specifier, from) => {
        const dir = from.slice(0, from.lastIndexOf('/'))
        const base = `${dir}/${specifier.replace(/^\.\//, '')}.ts`
        return files[base] === undefined ? undefined : base
      },
    })
    expect(resolve('Props', imports("import type { Props } from './middle'"), '/p/Button.tsx')).toBeUndefined()
  })
})

describe('resolveFromWorkspace — the remaining on-disk shapes', () => {
  it('finds a subpath declared in exports but ABSENT on disk via the plain walk', () => {
    const root = tempDir()
    write(
      root,
      'node_modules/@acme/core/package.json',
      JSON.stringify({ name: '@acme/core', exports: { './sub': { bun: './src/sub.ts' } } }),
    )
    // The declared target does not exist; a real file does.
    write(root, 'node_modules/@acme/core/sub.ts', '')
    expect(resolveFromWorkspace('@acme/core/sub', [root])).toBe(join(root, 'node_modules/@acme/core/sub.ts'))
  })

  it('prefers the DECLARED target when it is on disk', () => {
    const root = tempDir()
    write(
      root,
      'node_modules/@acme/core/package.json',
      JSON.stringify({ name: '@acme/core', exports: { './sub': { bun: './src/sub.ts' } } }),
    )
    write(root, 'node_modules/@acme/core/src/sub.ts', '')
    write(root, 'node_modules/@acme/core/sub.ts', '')
    expect(resolveFromWorkspace('@acme/core/sub', [root])).toBe(
      join(root, 'node_modules/@acme/core/src/sub.ts'),
    )
  })

  it('ignores a non-object exports field when resolving a subpath', () => {
    const root = tempDir()
    write(
      root,
      'node_modules/@acme/core/package.json',
      JSON.stringify({ name: '@acme/core', exports: './index.js' }),
    )
    write(root, 'node_modules/@acme/core/sub.js', '')
    expect(resolveFromWorkspace('@acme/core/sub', [root])).toBe(join(root, 'node_modules/@acme/core/sub.js'))
  })
})

describe('projectAlias with no injected loader — Vite s own config resolution', () => {
  it('reads `resolve.alias` out of a real vite.config.ts', async () => {
    const root = tempDir()
    writeFileSync(
      join(root, 'vite.config.ts'),
      "export default { resolve: { alias: { '~': './src' } } }\n",
    )
    const result = await projectAlias(root)
    expect(result.warning).toBeUndefined()
    expect(result.alias).toEqual([{ find: '~', replacement: join(root, 'src') }])
  })

  it('is silently empty when the project has no vite config — nothing to warn about', async () => {
    expect(await projectAlias(tempDir())).toEqual({ alias: [] })
  })
})
