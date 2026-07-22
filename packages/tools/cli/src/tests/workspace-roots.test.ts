/**
 * Unit tests for the doctor's workspace-root resolver — the mechanism
 * that replaced every gate's hardcoded Pyreon-repo path assumption
 * (upstream false-green report: gates scanned 0 files in any foreign
 * workspace layout while the doctor scored 100/100 A).
 *
 * Pure-policy pieces (`workspaceGlobsFromPackageJson`,
 * `workspaceGlobsFromPnpmYaml`, `globMatchesDir`) are tested directly;
 * the fs-backed resolution runs against tmp-dir fixtures.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  describeWorkspaceRoots,
  excludeRootsFromPackageJson,
  expandWorkspaceGlob,
  globMatchesDir,
  resolveWorkspaceRoots,
  workspaceGlobsFromPackageJson,
  workspaceGlobsFromPnpmYaml,
} from '../doctor/utils/workspace-roots'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-ws-roots-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

const pkgJson = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: 'x', private: true, ...extra })

describe('workspaceGlobsFromPackageJson', () => {
  it('array shape', () => {
    expect(workspaceGlobsFromPackageJson({ workspaces: ['apps/*', 'packages/*'] })).toEqual([
      'apps/*',
      'packages/*',
    ])
  })

  it('object `{ packages }` shape (yarn classic)', () => {
    expect(
      workspaceGlobsFromPackageJson({ workspaces: { packages: ['pkgs/*'] } }),
    ).toEqual(['pkgs/*'])
  })

  it('absent / empty / malformed → null', () => {
    expect(workspaceGlobsFromPackageJson({})).toBeNull()
    expect(workspaceGlobsFromPackageJson({ workspaces: [] })).toBeNull()
    expect(workspaceGlobsFromPackageJson({ workspaces: 'nope' })).toBeNull()
    expect(workspaceGlobsFromPackageJson({ workspaces: { packages: 'nope' } })).toBeNull()
  })
})

describe('workspaceGlobsFromPnpmYaml', () => {
  it('parses the documented packages list (bare + quoted + comments)', () => {
    const yaml = [
      '# workspace definition',
      'packages:',
      "  - 'apps/*'",
      '  - "packages/*"',
      '  - modules/* # inline comment',
      '',
    ].join('\n')
    expect(workspaceGlobsFromPnpmYaml(yaml)).toEqual([
      'apps/*',
      'packages/*',
      'modules/*',
    ])
  })

  it('no packages key → null', () => {
    expect(workspaceGlobsFromPnpmYaml('other:\n  - x\n')).toBeNull()
  })
})

describe('globMatchesDir', () => {
  it.each([
    ['examples/*', 'examples/demo', true],
    ['examples/*', 'examples/demo/nested', false],
    ['docs', 'docs', true],
    ['docs', 'docs2', false],
    ['packages/core/compiler/npm/*', 'packages/core/compiler/npm/darwin-arm64', true],
    ['packages/**', 'packages/a/b/c', true],
    ['packages/**', 'packages', true],
    ['**/fixtures', 'a/b/fixtures', true],
  ])('%s vs %s → %s', (glob, dir, expected) => {
    expect(globMatchesDir(glob, dir)).toBe(expected)
  })
})

describe('excludeRootsFromPackageJson', () => {
  it('reads pyreon.doctor.excludeRoots', () => {
    expect(
      excludeRootsFromPackageJson({
        pyreon: { doctor: { excludeRoots: ['examples/*', 'docs'] } },
      }),
    ).toEqual(['examples/*', 'docs'])
  })

  it('absent / malformed → []', () => {
    expect(excludeRootsFromPackageJson(null)).toEqual([])
    expect(excludeRootsFromPackageJson({})).toEqual([])
    expect(excludeRootsFromPackageJson({ pyreon: { doctor: { excludeRoots: 'x' } } })).toEqual([])
  })
})

describe('resolveWorkspaceRoots — discovery', () => {
  it('multi-root workspaces (the upstream report shape) — all roots resolved', () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'package.json',
      pkgJson({ workspaces: ['apps/*', 'packages/*', 'modules/*', 'tools/*'] }),
    )
    for (const d of ['apps/app', 'packages/lib', 'modules/chart', 'tools/gen']) {
      writeFile(cwd, `${d}/package.json`, pkgJson())
    }
    // A dir matching the glob WITHOUT a package.json is not a workspace.
    fs.mkdirSync(path.join(cwd, 'apps/not-a-package'), { recursive: true })

    const ws = resolveWorkspaceRoots(cwd)
    expect(ws.source).toBe('workspaces')
    expect(ws.repoRoot).toBe(path.resolve(cwd))
    expect(ws.packageDirs.map((d) => path.relative(ws.repoRoot, d)).sort()).toEqual([
      'apps/app',
      'modules/chart',
      'packages/lib',
      'tools/gen',
    ])
  })

  it('resolves the SAME roots from a nested cwd (cwd-independence)', () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'package.json', pkgJson({ workspaces: ['apps/*'] }))
    writeFile(cwd, 'apps/app/package.json', pkgJson())
    fs.mkdirSync(path.join(cwd, 'apps/app/src'), { recursive: true })

    const fromRoot = resolveWorkspaceRoots(cwd)
    const fromNested = resolveWorkspaceRoots(path.join(cwd, 'apps/app/src'))
    expect(fromNested.repoRoot).toBe(fromRoot.repoRoot)
    expect(fromNested.packageDirs).toEqual(fromRoot.packageDirs)
  })

  it('pnpm-workspace.yaml discovery', () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'package.json', pkgJson())
    writeFile(cwd, 'pnpm-workspace.yaml', "packages:\n  - 'libs/*'\n")
    writeFile(cwd, 'libs/a/package.json', pkgJson())

    const ws = resolveWorkspaceRoots(cwd)
    expect(ws.source).toBe('pnpm-workspace')
    expect(ws.packageDirs.map((d) => path.relative(ws.repoRoot, d))).toEqual(['libs/a'])
  })

  it('workspace negation globs (`!glob`) are honored', () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'package.json',
      pkgJson({ workspaces: ['pkgs/*', '!pkgs/internal'] }),
    )
    writeFile(cwd, 'pkgs/a/package.json', pkgJson())
    writeFile(cwd, 'pkgs/internal/package.json', pkgJson())

    const ws = resolveWorkspaceRoots(cwd)
    expect(ws.packageDirs.map((d) => path.relative(ws.repoRoot, d))).toEqual(['pkgs/a'])
  })

  it('pyreon.doctor.excludeRoots drops matching workspace dirs', () => {
    const cwd = makeTmpDir()
    writeFile(
      cwd,
      'package.json',
      pkgJson({
        workspaces: ['pkgs/*', 'examples/*'],
        pyreon: { doctor: { excludeRoots: ['examples/*'] } },
      }),
    )
    writeFile(cwd, 'pkgs/a/package.json', pkgJson())
    writeFile(cwd, 'examples/demo/package.json', pkgJson())

    const ws = resolveWorkspaceRoots(cwd)
    expect(ws.packageDirs.map((d) => path.relative(ws.repoRoot, d))).toEqual(['pkgs/a'])
    expect(ws.excluded).toEqual(['examples/*'])
  })

  it('no workspaces anywhere → single-package (nearest package.json dir)', () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'package.json', pkgJson())
    fs.mkdirSync(path.join(cwd, 'src/deep'), { recursive: true })

    const ws = resolveWorkspaceRoots(path.join(cwd, 'src/deep'))
    expect(ws.source).toBe('single-package')
    expect(ws.repoRoot).toBe(path.resolve(cwd))
    expect(ws.packageDirs).toEqual([path.resolve(cwd)])
  })

  it('--roots override wins and does not require package.json', () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'package.json', pkgJson({ workspaces: ['pkgs/*'] }))
    fs.mkdirSync(path.join(cwd, 'bare-src/sub'), { recursive: true })

    const ws = resolveWorkspaceRoots(cwd, { roots: ['bare-src'] })
    expect(ws.source).toBe('flag')
    expect(ws.packageDirs).toEqual([path.join(path.resolve(cwd), 'bare-src')])
  })

  it('describeWorkspaceRoots names count + source + globs', () => {
    const cwd = makeTmpDir()
    writeFile(cwd, 'package.json', pkgJson({ workspaces: ['apps/*'] }))
    writeFile(cwd, 'apps/a/package.json', pkgJson())
    const desc = describeWorkspaceRoots(resolveWorkspaceRoots(cwd))
    expect(desc).toContain('1 package root(s)')
    expect(desc).toContain('package.json workspaces')
    expect(desc).toContain('apps/*')
  })
})

describe('expandWorkspaceGlob', () => {
  it('skips node_modules and hidden dirs', () => {
    const cwd = makeTmpDir()
    fs.mkdirSync(path.join(cwd, 'pkgs/a'), { recursive: true })
    fs.mkdirSync(path.join(cwd, 'pkgs/node_modules/evil'), { recursive: true })
    fs.mkdirSync(path.join(cwd, 'pkgs/.hidden'), { recursive: true })
    const dirs = expandWorkspaceGlob(cwd, 'pkgs/*').map((d) => path.basename(d))
    expect(dirs).toEqual(['a'])
  })
})
