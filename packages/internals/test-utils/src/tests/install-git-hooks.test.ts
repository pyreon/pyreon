import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Subprocess regression test for `scripts/install-git-hooks.ts` policy.
 *
 * Policy (post gap #1 closure — see PR opening this gap closure batch):
 *
 *   1. If no `core.hooksPath` is set OR it's set to git's default
 *      `<git-dir>/hooks` location → install `.githooks/`. Pre-fix the
 *      script treated any non-empty value as a "user override" and
 *      bailed, leaving Pyreon's pre-push hook orphaned (git looked at
 *      `.git/hooks/`, the hook lived at `.githooks/`).
 *
 *   2. If `core.hooksPath` is set to a real custom path (`.husky`,
 *      `.lefthook`, etc.) → leave it untouched + warn. Pyreon doesn't
 *      clobber existing tooling.
 *
 *   3. If already set to `.githooks` → silent no-op (idempotent).
 *
 * The pre-push hook itself runs lint + affected typecheck + tests
 * before allowing the push to leave the laptop. Without this install
 * working correctly, every PR is at risk of CI bouncing on issues a
 * local validation would catch.
 *
 * Implementation note: each test creates a temp git directory so the
 * real repo's config isn't perturbed. The script discovers its repo
 * root via `git rev-parse --show-toplevel`, so we must run it from
 * inside the temp dir — the `cwd` of `spawnSync` controls this.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'install-git-hooks.ts')

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
  hooksPath: string | null
}

function setupTempRepo(): string {
  // Canonicalize via realpathSync because on macOS `mkdtempSync(tmpdir())`
  // returns `/var/folders/X` while `git rev-parse --show-toplevel` returns
  // `/private/var/folders/X` (the same dir, reached through the
  // `/var → /private/var` symlink). The script does plain string compare
  // — that's the right behavior for real repo paths, which don't go
  // through symlinks. The test fixture lives in tmpdir(), which on macOS
  // does. Canonicalize HERE so the fixture matches what the script will
  // resolve, rather than adding test-driven canonicalization to the
  // production script.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-hooks-test-')))
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email test@test.local', { cwd: dir })
  execSync('git config user.name test', { cwd: dir })
  // Pyreon's installer requires the `.githooks/` directory to exist
  // (it represents "this repo has hooks committed"). Create it.
  mkdirSync(join(dir, '.githooks'), { recursive: true })
  writeFileSync(join(dir, '.githooks', 'pre-push'), '#!/usr/bin/env sh\nexit 0\n', {
    mode: 0o755,
  })
  return dir
}

function runInstall(cwd: string): RunResult {
  const result = spawnSync('bun', [SCRIPT], {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
  })
  let hooksPath: string | null = null
  try {
    hooksPath = execSync('git config --get core.hooksPath', {
      cwd,
      encoding: 'utf-8',
    }).trim()
  } catch {
    hooksPath = null
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    hooksPath,
  }
}

function setHooksPath(cwd: string, path: string): void {
  execSync(`git config core.hooksPath ${path}`, { cwd })
}

describe('scripts/install-git-hooks.ts', () => {
  let testDir: string

  beforeEach(() => {
    testDir = setupTempRepo()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('installs .githooks when core.hooksPath is unset', () => {
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.githooks')
    expect(result.stdout).toContain('git hooks installed')
  })

  it('overwrites core.hooksPath when set to git default <git-dir>/hooks (relative)', () => {
    // Pre-fix this case left .git/hooks untouched, leaving Pyreon's
    // hook at .githooks/ orphaned. The fix detects "set to default
    // location" as not-a-real-override.
    setHooksPath(testDir, '.git/hooks')
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.githooks')
  })

  it('overwrites core.hooksPath when set to absolute git default path', () => {
    // Real-world bug shape: install scripts may have set the absolute
    // path explicitly, or the user set it without realising it
    // matches git's default. Either way, treat as no-override.
    const absoluteDefault = resolve(testDir, '.git', 'hooks')
    setHooksPath(testDir, absoluteDefault)
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.githooks')
  })

  it('preserves real user override (.husky)', () => {
    // husky / lefthook / custom paths are NOT default locations and
    // signal genuine user intent. Pyreon must not clobber them.
    setHooksPath(testDir, '.husky')
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.husky')
    expect(result.stderr).toContain('leaving as-is')
  })

  it('preserves real user override (.lefthook)', () => {
    setHooksPath(testDir, '.lefthook')
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.lefthook')
    expect(result.stderr).toContain('leaving as-is')
  })

  it('is idempotent when already configured', () => {
    setHooksPath(testDir, '.githooks')
    const result = runInstall(testDir)
    expect(result.status).toBe(0)
    expect(result.hooksPath).toBe('.githooks')
    // Silent — no install message on the second run.
    expect(result.stdout).not.toContain('git hooks installed')
  })

  it('exits silently when not in a git repo', () => {
    const nonGitDir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-no-git-')))
    try {
      const result = runInstall(nonGitDir)
      expect(result.status).toBe(0)
      expect(result.hooksPath).toBe(null)
      expect(result.stdout).toBe('')
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true })
    }
  })
})
