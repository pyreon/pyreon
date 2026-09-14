/**
 * The remaining workspace / discovery / rocketstyle branches.
 *
 * One theme runs through all of them: the difference between "nothing here" and
 * "could not read it" must never collapse. A glob that matches a non-package,
 * a package whose name is missing, a file that will not load — each has a
 * distinct correct outcome, and the wrong one looks exactly like an empty
 * project.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { discoverComponents, listComponentFiles } from '../discover'
import type { ModuleLoader } from '../load'
import { projectAlias } from '../project-alias'
import { discoverRocketstyle, readDimensions } from '../rocketstyle'
import { buildPackageMap } from '../workspace-packages'
import { detectProjects, expandGlob, pnpmWorkspaceGlobs, projectNameFor, workspaceGlobs } from '../workspace'

const roots: string[] = []
const tempDir = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-cov-ws-')))
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

describe('workspace globs — the shapes that are NOT a glob list', () => {
  it('ignores a `{ packages }` whose value is not an array', () => {
    expect(workspaceGlobs({ workspaces: { packages: 'packages/*' } })).toEqual([])
    expect(workspaceGlobs({ workspaces: { nohoist: ['x'] } })).toEqual([])
  })

  it('ignores a workspaces field that is a bare string', () => {
    expect(workspaceGlobs({ workspaces: 'packages/*' })).toEqual([])
  })
})

describe('pnpmWorkspaceGlobs — the reader, not a YAML engine', () => {
  it('strips DOUBLE quotes as well as single ones', () => {
    expect(pnpmWorkspaceGlobs('packages:\n  - "packages/*"\n  - \'apps/*\'\n  - libs/*\n')).toEqual([
      'packages/*',
      'apps/*',
      'libs/*',
    ])
  })

  it('drops an entry that is empty once unquoted', () => {
    expect(pnpmWorkspaceGlobs('packages:\n  - ""\n  - packages/*\n')).toEqual(['packages/*'])
  })

  it('keeps a lone quote character verbatim rather than slicing it away', () => {
    // Below the two-character minimum, so it is a value, not a quoted empty.
    expect(pnpmWorkspaceGlobs('packages:\n  - \'\n')).toEqual(["'"])
  })
})

describe('expandGlob', () => {
  const workspace = () => {
    const root = tempDir()
    mkdirSync(join(root, 'packages/ui/src'), { recursive: true })
    mkdirSync(join(root, 'packages/core'), { recursive: true })
    mkdirSync(join(root, 'node_modules/dep'), { recursive: true })
    return root
  }

  it('names the root itself for an empty glob — there is no segment to descend', () => {
    const root = workspace()
    expect(expandGlob(root, '')).toEqual([root])
  })

  it('stops at a literal LAST segment rather than walking past it', () => {
    const root = workspace()
    expect(expandGlob(root, 'packages/ui')).toEqual([join(root, 'packages/ui')])
  })

  it('expands a `*` that is not the last segment', () => {
    const root = workspace()
    expect(expandGlob(root, 'packages/*/src')).toEqual([join(root, 'packages/ui/src')])
  })
})

describe('projectNameFor', () => {
  it('falls back to the DIRECTORY when the scope is all the name had', () => {
    expect(projectNameFor('@', '/repo/packages/design-core')).toBe('Design Core')
  })

  it('keeps an unscoped name, and drops a bare leading @', () => {
    expect(projectNameFor('@acme', '/repo/x')).toBe('Acme')
  })
})

describe('detectProjects', () => {
  const root = (): string => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'repo', workspaces: ['packages/*', 'packages/ui'] }),
    )
    return dir
  }

  it('visits a directory matched by TWO globs exactly once', () => {
    const dir = root()
    write(dir, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui' }))
    write(dir, 'packages/ui/src/Button.tsx', 'export function Button() { return null }')
    const found = detectProjects(dir)
    expect(found.map((p) => p.dir)).toEqual(['packages/ui/src'])
  })

  it('names a package that declares NO name after its directory', () => {
    const dir = root()
    write(dir, 'packages/ui/package.json', '{}')
    write(dir, 'packages/ui/src/Button.tsx', 'export function Button() { return null }')
    const found = detectProjects(dir)
    expect(found[0]?.name).toBe('Ui')
    expect(found[0]?.packageName).toBe('')
  })

  it('accepts an injected probe, so detection is testable without components on disk', () => {
    const dir = root()
    write(dir, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui' }))
    mkdirSync(join(dir, 'packages/ui/src'), { recursive: true })
    expect(detectProjects(dir, { hasComponents: () => false })).toEqual([])
    expect(detectProjects(dir, { hasComponents: () => true })[0]?.dir).toBe('packages/ui/src')
  })

  it('honours a non-default scan dir', () => {
    const dir = root()
    write(dir, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui' }))
    write(dir, 'packages/ui/lib/Button.tsx', 'export function Button() { return null }')
    expect(detectProjects(dir, { dir: 'lib' })[0]?.dir).toBe('packages/ui/lib')
  })
})

describe('discoverComponents', () => {
  it('defaults the root to `./src` of the process cwd', () => {
    // Asserted through a directory that does not exist, so the default is
    // exercised without depending on the repo's own tree.
    expect(listComponentFiles({ dir: 'no-such-dir-for-atlas-coverage' })).toEqual([])
  })

  it('keeps two same-named components declared in DIFFERENT files', () => {
    // Name-only dedupe lost 1042 components on a real monorepo — 995 icon files
    // each exporting `Glyph`.
    const dir = tempDir()
    write(dir, 'src/a/Glyph.tsx', 'export function Glyph(props: { a: string }) { return null }')
    write(dir, 'src/b/Glyph.tsx', 'export function Glyph(props: { b: string }) { return null }')
    const found = discoverComponents({ cwd: dir })
    expect(found).toHaveLength(2)
    expect(new Set(found.map((c) => c.source))).toHaveLength(2)
  })

  it('emits a name declared TWICE in one file only once', () => {
    const dir = tempDir()
    write(dir, 'src/Glyph.tsx', 'export function Glyph(props: { a: string }) { return null }\nexport function Glyph(props: { b: string }) { return null }')
    expect(discoverComponents({ cwd: dir })).toHaveLength(1)
  })

  it('stamps the owning project when one is given, and leaves it off when not', () => {
    const dir = tempDir()
    write(dir, 'src/Button.tsx', 'export function Button(props: { a: string }) { return null }')
    expect(discoverComponents({ cwd: dir, project: 'core' })[0]?.project).toBe('core')
    expect(discoverComponents({ cwd: dir })[0]?.project).toBeUndefined()
  })

  it('resolves a props type from a SIBLING package when the map is supplied', () => {
    const dir = tempDir()
    write(dir, 'packages/ui/package.json', JSON.stringify({ name: '@acme/ui', main: 'src/index.ts' }))
    write(dir, 'packages/ui/src/index.ts', 'export interface Props { label: string }')
    write(dir, 'src/Button.tsx', "import type { Props } from '@acme/ui'\nexport function Button(props: Props) { return null }")
    const packages = buildPackageMap([join(dir, 'packages/ui')])
    expect(discoverComponents({ cwd: dir, packages })[0]?.controls.map((c) => c.name)).toEqual(['label'])
    // …and without the map it is an honest `unknown`, never a guess.
    expect(discoverComponents({ cwd: dir })[0]?.controls).toEqual([])
  })

  it('does not try to scan a DIRECTORY that is named like a source file', () => {
    // The walk recurses into it rather than listing it, so nothing downstream
    // ever tries to read a directory as a module.
    const dir = tempDir()
    write(dir, 'src/Button.tsx', 'export function Button(props: { a: string }) { return null }')
    mkdirSync(join(dir, 'src/Broken.tsx'), { recursive: true })
    expect(discoverComponents({ cwd: dir }).map((c) => c.name)).toEqual(['Button'])
  })

  it('skips the default-ignored shapes — tests, stories and declaration files', () => {
    const dir = tempDir()
    write(dir, 'src/Button.tsx', 'export function Button(props: { a: string }) { return null }')
    write(dir, 'src/Button.test.tsx', 'export function Fixture(props: { a: string }) { return null }')
    write(dir, 'src/Button.stories.tsx', 'export function Story(props: { a: string }) { return null }')
    write(dir, 'src/Button.d.ts', 'export declare function Typed(props: { a: string }): unknown')
    expect(discoverComponents({ cwd: dir }).map((c) => c.name)).toEqual(['Button'])
  })

  it('honours an ADDED ignore fragment and a narrowed extension list', () => {
    const dir = tempDir()
    write(dir, 'src/Button.tsx', 'export function Button(props: { a: string }) { return null }')
    write(dir, 'src/generated/Icon.tsx', 'export function Icon(props: { a: string }) { return null }')
    write(dir, 'src/Chain.ts', 'export function Chain(props: { a: string }) { return null }')
    expect(discoverComponents({ cwd: dir, ignore: ['generated'] }).map((c) => c.name).sort()).toEqual([
      'Button',
      'Chain',
    ])
    expect(discoverComponents({ cwd: dir, extensions: ['.ts'] }).map((c) => c.name)).toEqual(['Chain'])
  })
})

describe('readDimensions — what counts as a rocketstyle component', () => {
  const chain = (extra: Record<string, unknown>) => Object.assign(() => null, { IS_ROCKETSTYLE: true }, extra)

  it('is undefined for anything that is not one', () => {
    expect(readDimensions(() => null, {})).toBeUndefined()
    expect(readDimensions('Button', {})).toBeUndefined()
    expect(readDimensions(undefined, {})).toBeUndefined()
  })

  it('is an EMPTY axis list — not undefined — for a chain with no introspection', () => {
    // The difference matters: undefined means "not a component", empty means
    // "a component with no axes", and only the second belongs in the catalog.
    expect(readDimensions(chain({}), {})).toEqual([])
  })

  it('is empty when the chain reports no dimensions at all', () => {
    expect(readDimensions(chain({ getStaticDimensions: () => ({}) }), {})).toEqual([])
  })

  it('is empty when the chain THROWS — one styling callback must not take the catalog down', () => {
    const throws = chain({
      getStaticDimensions: () => {
        throw new Error('theme.accent is undefined')
      },
    })
    expect(readDimensions(throws, {})).toEqual([])
  })

  it('reads the dimension keys, dropping a dimension with no values', () => {
    const value = chain({
      getStaticDimensions: (theme: unknown) => ({
        dimensions: { state: { primary: theme }, empty: {} },
      }),
    })
    expect(readDimensions(value, { accent: '#333' })).toEqual([{ name: 'state', values: ['primary'] }])
  })
})

describe('discoverRocketstyle', () => {
  const loaderOver = (modules: Record<string, Record<string, unknown>>): ModuleLoader => ({
    kind: 'vite',
    close: async () => {},
    load: async (file: string) => {
      const mod = modules[file]
      if (!mod) throw new Error(`Failed to load url ${file}`)
      return mod
    },
  })
  const chain = Object.assign(() => null, {
    IS_ROCKETSTYLE: true,
    getStaticDimensions: () => ({ dimensions: { state: { primary: 1 } } }),
  })

  it('REPORTS a file that would not load — "broken" and "empty" produce the same zero', async () => {
    const seen: [string, string][] = []
    const found = await discoverRocketstyle(['missing.ts'], {
      loader: loaderOver({}),
      onLoadError: (file, message) => seen.push([file, message]),
    })
    expect(found).toEqual([])
    expect(seen[0]?.[0]).toBe('missing.ts')
    expect(seen[0]?.[1]).toContain('Failed to load url')
  })

  it('survives a load failure with NO reporter attached', async () => {
    await expect(discoverRocketstyle(['missing.ts'], { loader: loaderOver({}) })).resolves.toEqual([])
  })

  it('reports a non-Error load failure as text', async () => {
    const seen: string[] = []
    const loader: ModuleLoader = {
      kind: 'vite',
      close: async () => {},
      load: async () => {
        throw 'transform failed'
      },
    }
    await discoverRocketstyle(['x.ts'], { loader, onLoadError: (_f, message) => seen.push(message) })
    expect(seen[0]).toBe('transform failed')
  })

  it('emits a chain the static scan could not see, and skips names it already claimed', async () => {
    const file = join(tempDir(), 'Button.ts')
    const loader = loaderOver({ [file]: { Button: chain, helper: chain } })
    const found = await discoverRocketstyle([file], { loader })
    expect(found.map((c) => c.name)).toEqual(['Button'])
    expect(found[0]?.controls[0]).toMatchObject({ name: 'state', kind: 'select' })

    const skipped = await discoverRocketstyle([file], { loader }, new Set(['Button']))
    expect(skipped).toEqual([])
  })
})

describe('projectAlias — a config that will not read', () => {
  it('warns with a non-Error throw stringified, rather than "[object Object]"', async () => {
    const result = await projectAlias('/repo', async () => {
      throw 'plugin exploded'
    })
    expect(result.alias).toEqual([])
    expect(result.warning).toContain('plugin exploded')
    expect(result.warning).toContain('set `alias` in atlas.config.ts')
  })

  it('is silently empty when the loader returns a config with no alias', async () => {
    const result = await projectAlias('/repo', async () => ({ config: {}, path: '/repo/vite.config.ts', dependencies: [] }))
    expect(result).toEqual({ alias: [] })
  })
})
