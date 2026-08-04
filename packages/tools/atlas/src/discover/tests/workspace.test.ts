/**
 * Workspace detection — reading the package list the workspace already
 * declares, instead of asking someone to re-type it into `atlas.config.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectProjects,
  expandGlob,
  pnpmWorkspaceGlobs,
  projectNameFor,
  readWorkspaceGlobs,
  workspaceGlobs,
} from '../workspace'

let root: string
const write = (relative: string, source: string): void => {
  const path = join(root, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source, 'utf8')
}
const pkg = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, ...extra })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-ws-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('workspaceGlobs', () => {
  it('reads the array shape', () => {
    expect(workspaceGlobs({ workspaces: ['packages/*'] })).toEqual(['packages/*'])
  })

  it('reads the { packages } shape', () => {
    expect(workspaceGlobs({ workspaces: { packages: ['libs/*'] } })).toEqual(['libs/*'])
  })

  it('is empty for a package with no workspaces', () => {
    expect(workspaceGlobs({ name: 'x' })).toEqual([])
  })

  it('ignores non-string entries rather than crashing on them', () => {
    expect(workspaceGlobs({ workspaces: ['ok', 42, null] })).toEqual(['ok'])
  })
})

describe('pnpmWorkspaceGlobs', () => {
  it('reads a packages list, quoted or bare', () => {
    expect(pnpmWorkspaceGlobs("packages:\n  - 'packages/*'\n  - libs/*\n")).toEqual([
      'packages/*',
      'libs/*',
    ])
  })

  it('stops at the next top-level key', () => {
    expect(pnpmWorkspaceGlobs('packages:\n  - a/*\nonlyBuiltDependencies:\n  - esbuild\n')).toEqual([
      'a/*',
    ])
  })

  it('ignores comments', () => {
    expect(pnpmWorkspaceGlobs('packages:\n  - a/* # the apps\n')).toEqual(['a/*'])
  })

  it('is empty when there is no packages key', () => {
    expect(pnpmWorkspaceGlobs('onlyBuiltDependencies:\n  - esbuild\n')).toEqual([])
  })
})

describe('readWorkspaceGlobs', () => {
  it('prefers package.json when both exist', () => {
    write('package.json', pkg('root', { workspaces: ['from-json/*'] }))
    write('pnpm-workspace.yaml', 'packages:\n  - from-yaml/*\n')
    expect(readWorkspaceGlobs(root)).toEqual(['from-json/*'])
  })

  it('falls back to pnpm-workspace.yaml', () => {
    write('package.json', pkg('root'))
    write('pnpm-workspace.yaml', 'packages:\n  - from-yaml/*\n')
    expect(readWorkspaceGlobs(root)).toEqual(['from-yaml/*'])
  })

  it('is empty for a single-package project', () => {
    write('package.json', pkg('solo'))
    expect(readWorkspaceGlobs(root)).toEqual([])
  })
})

describe('expandGlob', () => {
  beforeEach(() => {
    write('packages/core/package.json', pkg('@acme/core'))
    write('packages/admin/package.json', pkg('@acme/admin'))
    write('packages/group/nested/package.json', pkg('@acme/nested'))
    write('packages/core/node_modules/dep/package.json', pkg('dep'))
  })

  it('expands a trailing *', () => {
    const dirs = expandGlob(root, 'packages/*').map((d) => d.slice(root.length + 1))
    expect(dirs.sort()).toEqual(['packages/admin', 'packages/core', 'packages/group'])
  })

  it('expands ** to nested packages too', () => {
    const dirs = expandGlob(root, 'packages/**').map((d) => d.slice(root.length + 1))
    expect(dirs).toContain('packages/group/nested')
  })

  it('never descends into node_modules', () => {
    // A workspace glob that walked node_modules would "find" every dependency
    // as a package — thousands of empty sidebar groups.
    const dirs = expandGlob(root, 'packages/**')
    expect(dirs.some((d) => d.includes('node_modules'))).toBe(false)
  })

  it('resolves a literal path', () => {
    expect(expandGlob(root, 'packages/core')).toEqual([join(root, 'packages/core')])
  })

  it('is empty for a path that does not exist', () => {
    expect(expandGlob(root, 'nope/*')).toEqual([])
  })
})

describe('projectNameFor', () => {
  it('drops the scope and title-cases — this is a heading, not an identifier', () => {
    expect(projectNameFor('@acme/design-core', '/x/design-core')).toBe('Design Core')
  })

  it('handles an unscoped name', () => {
    expect(projectNameFor('widgets', '/x/widgets')).toBe('Widgets')
  })

  it('falls back to the directory when a package has no name', () => {
    expect(projectNameFor('', '/repo/packages/ui-kit')).toBe('Ui Kit')
  })
})

describe('detectProjects', () => {
  const component = 'export function Button(props: { label: string }) { return null as never }\n'

  it('finds packages that HAVE components, and skips ones that do not', () => {
    write('package.json', pkg('root', { workspaces: ['packages/*'] }))
    write('packages/core/package.json', pkg('@acme/core'))
    write('packages/core/src/Button.tsx', component)
    write('packages/utils/package.json', pkg('@acme/utils'))
    write('packages/utils/src/math.ts', 'export const add = (a: number, b: number) => a + b\n')

    const found = detectProjects(root)
    // `utils` has source but no components — listing it would produce an empty
    // sidebar group, which reads as a broken scan.
    expect(found.map((p) => p.name)).toEqual(['Core'])
    expect(found[0]!.dir).toBe('packages/core/src')
    expect(found[0]!.packageName).toBe('@acme/core')
  })

  it('accepts a package that keeps components at its root', () => {
    write('package.json', pkg('root', { workspaces: ['packages/*'] }))
    write('packages/flat/package.json', pkg('@acme/flat'))
    write('packages/flat/Button.tsx', component)

    expect(detectProjects(root)[0]?.dir).toBe('packages/flat')
  })

  it('returns [] for a single-package project — callers fall back, never worsen', () => {
    write('package.json', pkg('solo'))
    write('src/Button.tsx', component)
    expect(detectProjects(root)).toEqual([])
  })

  it('skips a glob match that is not a package', () => {
    write('package.json', pkg('root', { workspaces: ['packages/*'] }))
    mkdirSync(join(root, 'packages/notapackage'), { recursive: true })
    write('packages/notapackage/Button.tsx', component)
    expect(detectProjects(root)).toEqual([])
  })

  it('INCLUDES a private package — private means do not publish, not do not document', () => {
    write('package.json', pkg('root', { workspaces: ['packages/*'] }))
    write('packages/internal/package.json', pkg('@acme/internal', { private: true }))
    write('packages/internal/src/Button.tsx', component)
    expect(detectProjects(root).map((p) => p.name)).toEqual(['Internal'])
  })

  it('disambiguates two packages whose names collapse to the same heading', () => {
    // Same heading would key their components identically — the collapse
    // `project` exists to prevent. Suffixed, not dropped: a visible `Core (2)`
    // is diagnosable, a missing package is not.
    write('package.json', pkg('root', { workspaces: ['a/*', 'b/*'] }))
    write('a/core/package.json', pkg('@one/core'))
    write('a/core/src/Button.tsx', component)
    write('b/core/package.json', pkg('@two/core'))
    write('b/core/src/Button.tsx', component)

    const names = detectProjects(root).map((p) => p.name)
    expect(names).toEqual(['Core', 'Core (2)'])
  })

  it('emits POSIX-separated relative dirs — a config is read on every platform', () => {
    write('package.json', pkg('root', { workspaces: ['packages/*'] }))
    write('packages/core/package.json', pkg('@acme/core'))
    write('packages/core/src/Button.tsx', component)
    expect(detectProjects(root)[0]!.dir).not.toContain('\\')
  })
})
