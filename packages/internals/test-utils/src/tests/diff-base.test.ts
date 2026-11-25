import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitChangedFiles } from '../../../../../scripts/affected'
import { changedFilesSinceBase, resolveDiffBase } from '../../../../../scripts/diff-base'

/**
 * `scripts/diff-base.ts` decides which commit every CI selector diffs against.
 * Each case builds a real git repository shaped like the checkout a GitHub
 * Actions job gets, and asserts the CHANGED SET, not just the sha.
 */

const SCRIPT = resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'scripts', 'diff-base.ts')

const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

const GIT_ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('GITHUB_')),
  ),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  roots.push(dir)
  return dir
}

function repo(root = tempDir('diff-base-')) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim()
  const write = (path: string, content = path) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const commit = (...paths: string[]) => {
    for (const p of paths) write(p)
    git('add', '-A')
    git('commit', '-q', '-m', paths.join(' ') || 'empty', '--allow-empty')

    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')

  return { root, git, write, commit }
}

/** Write a GitHub event payload and return the env a job on that event has. */
function actionsEnv(root: string, event: string, payload: object, sha: string): NodeJS.ProcessEnv {
  const path = join(root, '..', `${event}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(path, JSON.stringify(payload))
  roots.push(path)

  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: event,
    GITHUB_EVENT_PATH: path,
    GITHUB_SHA: sha,
  }
}

/**
 * The #4776 shape. main@M0 → the PR branches and adds `pr.txt`; the event
 * fires with base.sha = M0; main then gains `main-only.txt` (M1); GitHub
 * builds the merge ref on M1. Returns the merge commit checked out as HEAD.
 */
function stalePrScenario() {
  const r = repo()
  const m0 = r.commit('seed.txt')
  r.git('switch', '-qc', 'feature')
  r.commit('pr.txt')
  r.git('switch', '-q', 'main')
  const m1 = r.commit('main-only.txt')
  r.git('switch', '-q', '--detach', 'main')
  r.git('merge', '--no-ff', '-q', '-m', 'Merge feature into main', 'feature')
  const merge = r.git('rev-parse', 'HEAD')

  return { ...r, m0, m1, merge }
}

describe('diff-base: pull_request runs on the merge ref', () => {
  it("diffs against the merge commit's first parent, never the stale event base.sha (#4776)", () => {
    const s = stalePrScenario()
    const env = actionsEnv(
      s.root,
      'pull_request',
      { pull_request: { base: { sha: s.m0 } } },
      s.merge,
    )

    // The old selection: the event's base.sha across the merge ref pulls in
    // main's own commit.
    expect(gitChangedFiles(s.m0, s.root)?.sort()).toEqual(['main-only.txt', 'pr.txt'])

    const { base, files } = changedFilesSinceBase({ cwd: s.root, env })
    expect(base.base).toBe(s.m1)
    expect(base.head).toBe(s.merge)
    expect(base.rule).toContain(`pull_request.base.sha ${s.m0} is older`)
    expect(files).toEqual(['pr.txt'])
    // And every --base consumer (affected.ts, e2e-affected.ts) agrees once it
    // is handed this base.
    expect(gitChangedFiles(base.base, s.root)).toEqual(['pr.txt'])
  })

  it('an up-to-date PR selects exactly its own files', () => {
    const r = repo()
    r.commit('seed.txt')
    r.git('switch', '-qc', 'feature')
    r.commit('a.txt', 'dir/b.txt')
    r.git('switch', '-q', '--detach', 'main')
    const m = r.git('rev-parse', 'HEAD')
    r.git('merge', '--no-ff', '-q', '-m', 'merge', 'feature')
    const merge = r.git('rev-parse', 'HEAD')
    const env = actionsEnv(r.root, 'pull_request', { pull_request: { base: { sha: m } } }, merge)
    const { base, files } = changedFilesSinceBase({ cwd: r.root, env })
    expect(base.base).toBe(m)
    expect(base.rule).not.toContain('older')
    expect(files.sort()).toEqual(['a.txt', 'dir/b.txt'])
  })

  it('a PR that merged main into itself is still blamed only for its own files', () => {
    const r = repo()
    r.commit('seed.txt')
    r.git('switch', '-qc', 'feature')
    r.commit('f1.txt')
    r.git('switch', '-q', 'main')
    const m1 = r.commit('m1.txt')
    r.git('switch', '-q', 'feature')
    r.git('merge', '--no-ff', '-q', '-m', 'merge main into feature', 'main')
    r.commit('f2.txt')
    r.git('switch', '-q', 'main')
    const m2 = r.commit('m2.txt')
    r.git('switch', '-q', '--detach', 'main')
    r.git('merge', '--no-ff', '-q', '-m', 'merge ref', 'feature')
    const merge = r.git('rev-parse', 'HEAD')
    // base.sha is the stale m1 here too.
    const env = actionsEnv(r.root, 'pull_request', { pull_request: { base: { sha: m1 } } }, merge)
    const { base, files } = changedFilesSinceBase({ cwd: r.root, env })
    expect(base.base).toBe(m2)
    expect(files.sort()).toEqual(['f1.txt', 'f2.txt'])
  })

  it('works on a depth-2 checkout and fails LOUDLY on a depth-1 one', () => {
    const s = stalePrScenario()
    s.git('branch', 'pr-merge', s.merge)
    for (const depth of ['1', '2']) {
      const clone = join(tempDir(`diff-base-shallow-${depth}-`), 'c')
      execFileSync(
        'git',
        ['clone', '-q', '--depth', depth, '--branch', 'pr-merge', `file://${s.root}`, clone],
        {
          env: GIT_ENV,
        },
      )
      const env = actionsEnv(
        clone,
        'pull_request',
        { pull_request: { base: { sha: s.m0 } } },
        s.merge,
      )
      if (depth === '2') {
        expect(changedFilesSinceBase({ cwd: clone, env }).files).toEqual(['pr.txt'])
      } else {
        expect(() => resolveDiffBase({ cwd: clone, env })).toThrow(
          /^\[Pyreon\] diff base: the merge commit's first parent [0-9a-f]{40} is not in this clone \(a shallow checkout\)\. Set `fetch-depth: 2`/,
        )
      }
    }
  })

  it('refuses a checkout that moved off the merge commit, and a non-merge HEAD', () => {
    const s = stalePrScenario()
    const moved = actionsEnv(s.root, 'pull_request', {}, s.m1)
    expect(() => resolveDiffBase({ cwd: s.root, env: moved })).toThrow(
      /^\[Pyreon\] diff base: HEAD is [0-9a-f]{40}, but this pull_request run's merge commit \(GITHUB_SHA\)/,
    )
    s.git('switch', '-q', 'feature')
    const head = s.git('rev-parse', 'HEAD')
    const notMerge = actionsEnv(s.root, 'pull_request', {}, head)
    expect(() => resolveDiffBase({ cwd: s.root, env: notMerge })).toThrow(
      /has 1 parent\(s\), so it is not GitHub's pull-request merge commit/,
    )
  })
})

describe('diff-base: other events', () => {
  it('push: the replaced tip (event.before), covering every pushed commit', () => {
    const r = repo()
    const before = r.commit('seed.txt')
    r.commit('one.txt')
    const after = r.commit('two.txt')
    const env = actionsEnv(r.root, 'push', { before, after }, after)
    const { base, files } = changedFilesSinceBase({ cwd: r.root, env })
    expect(base.base).toBe(before)
    expect(files.sort()).toEqual(['one.txt', 'two.txt'])
  })

  it('push: a branch-creating push and a missing before are refused', () => {
    const r = repo()
    const head = r.commit('seed.txt')
    const created = actionsEnv(r.root, 'push', { before: '0'.repeat(40) }, head)
    expect(() => resolveDiffBase({ cwd: r.root, env: created })).toThrow(
      /^\[Pyreon\] diff base: this push created the branch/,
    )
    const missing = actionsEnv(r.root, 'push', { before: 'a'.repeat(40) }, head)
    expect(() => resolveDiffBase({ cwd: r.root, env: missing })).toThrow(
      /is not in this clone .*fetch-depth: 0/,
    )
  })

  it('merge_group: merge_group.base_sha, even when the group stacks several PRs', () => {
    const r = repo()
    const base = r.commit('seed.txt')
    r.commit('pr1.txt')
    const head = r.commit('pr2.txt')
    const env = actionsEnv(
      r.root,
      'merge_group',
      { merge_group: { base_sha: base, head_sha: head } },
      head,
    )
    const got = changedFilesSinceBase({ cwd: r.root, env })
    expect(got.base.base).toBe(base)
    expect(got.files.sort()).toEqual(['pr1.txt', 'pr2.txt'])
  })

  it('an event with no change set (workflow_dispatch) is refused, not guessed', () => {
    const r = repo()
    const head = r.commit('seed.txt')
    const env = actionsEnv(r.root, 'workflow_dispatch', {}, head)
    expect(() => resolveDiffBase({ cwd: r.root, env })).toThrow(
      /no change set is defined for a workflow_dispatch event/,
    )
  })

  it('a local run: merge-base with origin/main', () => {
    const r = repo()
    const m0 = r.commit('seed.txt')
    r.git('switch', '-qc', 'feature')
    r.commit('mine.txt')
    r.git('switch', '-q', 'main')
    r.commit('theirs.txt')
    r.git('update-ref', 'refs/remotes/origin/main', 'main')
    r.git('switch', '-q', 'feature')
    const { base, files } = changedFilesSinceBase({ cwd: r.root, env: {} })
    expect(base.base).toBe(m0)
    expect(files).toEqual(['mine.txt'])
  })
})

describe('diff-base CLI', () => {
  function cli(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
    return spawnSync('bun', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...GIT_ENV, ...env },
    })
  }

  it('--files prints the changed set; --github-env exports CI_BASE', () => {
    const s = stalePrScenario()
    const env = actionsEnv(
      s.root,
      'pull_request',
      { pull_request: { base: { sha: s.m0 } } },
      s.merge,
    )
    const files = cli(s.root, ['--files'], env)
    expect(files.status, files.stderr).toBe(0)
    expect(files.stdout.trim()).toBe('pr.txt')
    expect(files.stderr).toContain('first parent of merge commit')

    const ghEnv = join(s.root, '..', 'github-env')
    roots.push(ghEnv)
    writeFileSync(ghEnv, '')
    const exported = cli(s.root, ['--github-env'], { ...env, GITHUB_ENV: ghEnv })
    expect(exported.status, exported.stderr).toBe(0)
    expect(readFileSync(ghEnv, 'utf8')).toBe(`CI_BASE=${s.m1}\n`)
  })

  it('exits non-zero with the [Pyreon] message, printing no sha', () => {
    const r = repo()
    const head = r.commit('seed.txt')
    const res = cli(r.root, [], actionsEnv(r.root, 'schedule', {}, head))
    expect(res.status).toBe(1)
    expect(res.stdout).toBe('')
    expect(res.stderr).toMatch(
      /^\[Pyreon\] diff base: no change set is defined for a schedule event/,
    )
  })
})
