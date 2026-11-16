import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EXAMPLE_GROUPS,
  EXAMPLE_WORKSPACE_GLOBS,
  exampleDir,
  findExample,
  listExampleDirs,
  REPO_ROOT,
} from '../../../../../scripts/example-dirs'

describe('example-dirs — the one place that knows where examples live', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'example-dirs-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const pkg = (rel: string): void => {
    mkdirSync(join(root, 'examples', rel), { recursive: true })
    writeFileSync(join(root, 'examples', rel, 'package.json'), '{}')
  }

  it('lists examples at the top level and inside group folders, never installs', () => {
    pkg('hn-clone')
    pkg('compat/react')
    pkg('fixtures/cpa/app')
    pkg('hn-clone/node_modules/dep')
    mkdirSync(join(root, 'examples/fixtures/leftover/node_modules/x'), { recursive: true })
    expect(listExampleDirs(root)).toEqual(['compat/react', 'fixtures/cpa/app', 'hn-clone'])
  })

  it('an empty scan fails instead of passing as "nothing to check"', () => {
    mkdirSync(join(root, 'examples'), { recursive: true })
    expect(() => listExampleDirs(root)).toThrow(/found no example/)
    expect(listExampleDirs(root, { allowNone: true })).toEqual([])
  })

  it('a lookup of a missing example FAILS, naming what exists', () => {
    pkg('fixtures/ssr-showcase')
    expect(exampleDir('fixtures/ssr-showcase', root)).toBe(join(root, 'examples/fixtures/ssr-showcase'))
    // The old flat path: a renamed example breaks its consumer loudly.
    expect(() => exampleDir('ssr-showcase', root)).toThrow(/examples\/ssr-showcase is not an example.*fixtures\/ssr-showcase/)
  })

  it('findExample takes a path, or a unique directory name for result-keyed scripts', () => {
    pkg('fixtures/perf-dashboard')
    pkg('compat/react')
    pkg('fixtures/react')
    expect(findExample('perf-dashboard', root).rel).toBe('fixtures/perf-dashboard')
    expect(findExample('fixtures/perf-dashboard', root).rel).toBe('fixtures/perf-dashboard')
    expect(() => findExample('nope', root)).toThrow(/no example named "nope"/)
    expect(() => findExample('react', root)).toThrow(/names several examples/)
  })

  it('the real repo: every group folder holds examples, and the root workspaces cover every level', () => {
    const all = listExampleDirs(REPO_ROOT)
    for (const group of EXAMPLE_GROUPS) {
      expect(all.some((rel) => rel.startsWith(`${group}/`) && !rel.slice(group.length + 1).includes('/')), group).toBe(true)
    }
    const workspaces = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { workspaces: string[] })
      .workspaces
    for (const glob of EXAMPLE_WORKSPACE_GLOBS) expect(workspaces, glob).toContain(glob)
  })
})
