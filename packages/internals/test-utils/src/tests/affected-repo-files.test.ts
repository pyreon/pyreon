// A changed file that no workspace owns must never select ZERO test cells
// unless it is prose. #4520 changed `readable-oxlint-baseline.json` and three
// test files; `affected.ts` selected nothing for the baseline, every
// `test (…)` cell was skipped, `Test` passed, and the one test that reads the
// file (`readable-ratchet.test.ts`) first ran on the default branch, where it
// failed. The rule: run the tests that read the file; when nobody is known to
// read it, run everything.

import { resolve } from 'node:path'
import {
  computeAffectedFlags,
  discoverWorkspaces,
  isProsePath,
  type Workspace,
} from '../../../../../scripts/affected'
import { createRepoFileReaders, repoFileIsRead } from '../../../../../scripts/repo-file-readers'

const REPO = resolve(__dirname, '../../../../..')
const ROOT = '/fake/root'

const WS: Workspace[] = [
  { name: '@pyreon/core', dir: `${ROOT}/packages/core/core`, deps: [], scriptNames: ['test'] },
  { name: '@pyreon/toast', dir: `${ROOT}/packages/fundamentals/toast`, deps: ['@pyreon/core'], scriptNames: ['test'] },
  { name: '@pyreon/test-utils', dir: `${ROOT}/packages/internals/test-utils`, deps: [], scriptNames: ['test'] },
]

const flags = (changed: string[], readers: Record<string, string[]> = {}, extra: object = {}) =>
  computeAffectedFlags({ changed, workspaces: WS, root: ROOT, repoFileReaders: (p) => readers[p] ?? [], ...extra })

describe('a repository-level file selects the tests that read it', () => {
  const readers = { 'readable-oxlint-baseline.json': ['@pyreon/test-utils'] }

  it('readable-oxlint-baseline.json selects the internals/test-utils cell, as a leaf', () => {
    expect(flags(['readable-oxlint-baseline.json'], readers)).toBe('--filter=@pyreon/test-utils')
    expect(flags(['readable-oxlint-baseline.json'], readers, { category: 'internals' })).toBe('--filter=@pyreon/test-utils')
    // A leaf: test-utils' dependents are not dragged in, and other cells stay empty.
    expect(flags(['readable-oxlint-baseline.json'], readers, { category: 'core' })).toBe('')
    expect(flags(['readable-oxlint-baseline.json'], readers, { category: 'internals', requireScript: 'test' })).toBe(
      '--filter=@pyreon/test-utils',
    )
  })

  it('adds the reader to a package change instead of replacing it', () => {
    const out = flags(['readable-oxlint-baseline.json', 'packages/core/core/src/index.ts'], readers)
    expect(out.split(' ')).toEqual(['--filter=@pyreon/core', '--filter=@pyreon/test-utils', '--filter=@pyreon/toast'])
  })

  it('an unmapped root file selects everything, in every cell', () => {
    expect(flags(['.oxfmtrc.json'])).toBe('--filter=*')
    expect(flags(['.oxfmtrc.json'], {}, { category: 'core' })).toBe('--filter=*')
    expect(flags(['.oxfmtrc.json', 'packages/core/core/src/index.ts'])).toBe('--filter=*')
    // One mapped and one unmapped file: the unmapped one decides.
    expect(flags(['readable-oxlint-baseline.json', 'some-new-root-file.toml'], readers)).toBe('--filter=*')
  })

  it('fails closed without a reader lookup, and when the named reader is not a workspace', () => {
    expect(computeAffectedFlags({ changed: ['lint-baseline.json'], workspaces: WS, root: ROOT })).toBe('--filter=*')
    expect(flags(['lint-baseline.json'], { 'lint-baseline.json': ['@pyreon/gone'] })).toBe('--filter=*')
  })

  it('a file of a workspace that no longer exists selects everything', () => {
    expect(flags(['packages/fundamentals/removed/src/index.ts'])).toBe('--filter=*')
  })

  it('prose still selects nothing, and never asks who reads it', () => {
    const asked: string[] = []
    const out = computeAffectedFlags({
      changed: ['README.md', '.changeset/fix.md', '.agents/guides/ci/README.md', 'llms.txt', 'LICENSE', '.gitignore'],
      workspaces: WS,
      root: ROOT,
      repoFileReaders: (p) => {
        asked.push(p)

        return []
      },
    })
    expect(out).toBe('')
    expect(asked).toEqual([])
    expect(isProsePath('docs-like.json')).toBe(false)
  })

  it('scripts, e2e specs and workflows keep their own rule (never the reader lookup)', () => {
    expect(flags(['scripts/affected.ts'])).toBe('--filter=@pyreon/test-utils')
    expect(flags(['e2e/core/app.spec.ts'])).toBe('--filter=@pyreon/test-utils')
    expect(flags(['.github/workflows/codeql.yml'])).toBe('--filter=@pyreon/test-utils')
  })

  it('the coverage selection (directOnly) is not widened by a repository-level file', () => {
    expect(flags(['.oxfmtrc.json', 'packages/core/core/src/index.ts'], {}, { directOnly: true })).toBe('--filter=@pyreon/core')
    expect(flags(['.oxfmtrc.json'], {}, { directOnly: true })).toBe('')
  })
})

describe('repoFileIsRead — who names a file', () => {
  const tests = new Map([
    ['packages/internals/test-utils/src/tests/ratchet.test.ts', "import { PATH } from '../../../../../scripts/check-ratchet'\n"],
    ['packages/internals/test-utils/src/tests/hooks.test.ts', "const HOOK = resolve(root, '.githooks/pre-push')\n"],
  ])
  const scripts = new Map([
    ['scripts/check-ratchet.ts', "export const PATH = 'ratchet-baseline.json'\n"],
    ['scripts/perf.ts', "// reads other-baseline.json (prose only)\nconst DIR = join(root, 'perf-results')\n"],
  ])

  it('a test that imports the script which names the file reads it', () => {
    expect(repoFileIsRead('ratchet-baseline.json', tests, scripts)).toBe(true)
  })

  it('a test that names the file directly reads it', () => {
    expect(repoFileIsRead('.githooks/pre-push', tests, scripts)).toBe(true)
  })

  it('a file under a directory a script names is read; a comment is not a reader', () => {
    expect(repoFileIsRead('perf-results/baseline-boot.json', tests, scripts)).toBe(true)
    expect(repoFileIsRead('other-baseline.json', tests, scripts)).toBe(false)
    expect(repoFileIsRead('unknown-dir/file.json', tests, scripts)).toBe(false)
  })
})

describe('the real repository', () => {
  const workspaces = discoverWorkspaces(REPO)
  const readers = createRepoFileReaders(REPO, workspaces)
  const real = (changed: string[], extra: object = {}) =>
    computeAffectedFlags({ changed, workspaces, root: REPO, repoFileReaders: readers, ...extra })

  it('every committed ratchet baseline selects @pyreon/test-utils', () => {
    for (const file of [
      'readable-oxlint-baseline.json',
      'readable-baseline.json',
      'lint-baseline.json',
      'pyreon-lint-baseline.json',
      'leak-baseline.json',
    ]) {
      expect(real([file]), file).toBe('--filter=@pyreon/test-utils')
      expect(real([file], { category: 'internals', requireScript: 'test' }), file).toBe('--filter=@pyreon/test-utils')
    }
  })

  it('hooks, lint configs and the root vitest router select @pyreon/test-utils', () => {
    for (const file of ['.githooks/pre-push', '.claude/scripts/guard-ai-attribution.sh', '.pyreonlintrc.json', 'vitest.config.mts']) {
      expect(real([file]), file).toBe('--filter=@pyreon/test-utils')
    }
  })

  it('a root file no test names selects everything', () => {
    // Assembled at run time: this file is one of the scanned tests, and a
    // literal name here would make it a reader.
    const name = ['a-root-file', 'nobody', 'reads.toml'].join('-')
    expect(real([name])).toBe('--filter=*')
  })
})
