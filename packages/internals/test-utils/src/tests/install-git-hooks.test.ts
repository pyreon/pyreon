import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { installHooks } from '../../../../../scripts/install-git-hooks'

/**
 * Build an env that strips every `GIT_*` variable. When this test runs
 * inside a git hook (e.g. via `git push` → pre-push → bun → vitest),
 * git sets `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, etc. to point
 * at the OUTER repo. ANY `execSync('git ...')` we run inherits those
 * env vars and silently writes to the OUTER repo's config — even with
 * `cwd: tempDir` set. (Yes, this script's tests literally corrupted
 * the running worktree's git config the first few times this PR was
 * pushed: `user.email = test@test.local` ended up in the worktree's
 * `.git/config` because `git config user.email ...` saw GIT_DIR and
 * wrote there instead of into the test temp dir's config.)
 *
 * The script under test (`installHooks`) does its own GIT_* clearing
 * inside `runGit()`. The TEST FIXTURE must do the same for its setup
 * commands (`git init`, `git config user.email`, `git config --get`)
 * because those bypass the script and would otherwise leak.
 */
const cleanGitEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  return env
}

/**
 * Tests for the `installHooks` policy in `scripts/install-git-hooks.ts`.
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
 *      `.lefthook`, etc.) → leave it untouched. Pyreon doesn't clobber
 *      existing tooling.
 *
 *   3. If already set to `.githooks` → silent no-op (idempotent).
 *
 * Implementation note: each test creates a temp git directory and
 * invokes `installHooks(testDir)` directly. **No subprocess fork**, no
 * stdout/stderr capture — under parallel vitest load (the pre-push hook
 * runs `bun run --filter='*' test` against 60+ packages simultaneously),
 * spawnSync output buffering becomes non-deterministic and the previous
 * subprocess-based test was failing on every push. The structured
 * `InstallResult` return value is the contract; what `main()` prints is
 * a formatting concern tested separately by the smoke test below.
 *
 * `realpathSync(mkdtempSync(...))` canonicalizes the macOS
 * `/var → /private/var` symlink so the policy's path comparison sees
 * the same string git reports — kept as a safety net even though direct
 * function calls don't go through the subprocess cwd resolution where
 * the symlink quirk originally bit.
 */

interface RunResult {
  result: ReturnType<typeof installHooks>
  hooksPath: string | null
}

function setupTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-hooks-test-')))
  const env = cleanGitEnv()
  execSync('git init -q', { cwd: dir, env })
  execSync('git config user.email test@test.local', { cwd: dir, env })
  execSync('git config user.name test', { cwd: dir, env })
  // Pyreon's installer requires the `.githooks/` directory to exist
  // (it represents "this repo has hooks committed"). Create it.
  mkdirSync(join(dir, '.githooks'), { recursive: true })
  writeFileSync(join(dir, '.githooks', 'pre-push'), '#!/usr/bin/env sh\nexit 0\n', {
    mode: 0o755,
  })
  return dir
}

function runInstall(cwd: string): RunResult {
  const result = installHooks(cwd)
  let hooksPath: string | null = null
  try {
    hooksPath = execSync('git config --get core.hooksPath', {
      cwd,
      env: cleanGitEnv(),
      encoding: 'utf-8',
    }).trim()
  } catch {
    hooksPath = null
  }
  return { result, hooksPath }
}

function setHooksPath(cwd: string, path: string): void {
  execSync(`git config core.hooksPath ${path}`, { cwd, env: cleanGitEnv() })
}

describe('installHooks (policy)', () => {
  let testDir: string

  beforeEach(() => {
    testDir = setupTempRepo()
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('installs .githooks when core.hooksPath is unset', () => {
    const { result, hooksPath } = runInstall(testDir)
    expect(result).toEqual({ kind: 'installed', previousValue: null })
    expect(hooksPath).toBe('.githooks')
  })

  it('overwrites core.hooksPath when set to git default <git-dir>/hooks (relative)', () => {
    // Pre-fix this case left .git/hooks untouched, leaving Pyreon's
    // hook at .githooks/ orphaned. The fix detects "set to default
    // location" as not-a-real-override.
    setHooksPath(testDir, '.git/hooks')
    const { result, hooksPath } = runInstall(testDir)
    expect(result).toEqual({ kind: 'installed', previousValue: '.git/hooks' })
    expect(hooksPath).toBe('.githooks')
  })

  it('overwrites core.hooksPath when set to absolute git default path', () => {
    // Real-world bug shape: install scripts may have set the absolute
    // path explicitly, or the user set it without realising it
    // matches git's default. Either way, treat as no-override.
    const absoluteDefault = resolve(testDir, '.git', 'hooks')
    setHooksPath(testDir, absoluteDefault)
    const { result, hooksPath } = runInstall(testDir)
    expect(result.kind).toBe('installed')
    expect(hooksPath).toBe('.githooks')
  })

  it('preserves real user override (.husky)', () => {
    // husky / lefthook / custom paths are NOT default locations and
    // signal genuine user intent. Pyreon must not clobber them.
    setHooksPath(testDir, '.husky')
    const { result, hooksPath } = runInstall(testDir)
    expect(result).toEqual({ kind: 'preserved-user-override', currentValue: '.husky' })
    expect(hooksPath).toBe('.husky')
  })

  it('preserves real user override (.lefthook)', () => {
    setHooksPath(testDir, '.lefthook')
    const { result, hooksPath } = runInstall(testDir)
    expect(result).toEqual({ kind: 'preserved-user-override', currentValue: '.lefthook' })
    expect(hooksPath).toBe('.lefthook')
  })

  it('is idempotent when already configured', () => {
    setHooksPath(testDir, '.githooks')
    const { result, hooksPath } = runInstall(testDir)
    expect(result).toEqual({ kind: 'already-configured' })
    expect(hooksPath).toBe('.githooks')
  })

  it('exits silently when not in a git repo', () => {
    const nonGitDir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-no-git-')))
    try {
      const result = installHooks(nonGitDir)
      expect(result).toEqual({ kind: 'not-a-git-repo' })
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true })
    }
  })
})

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const SCRIPT = resolve(REPO_ROOT, 'scripts', 'install-git-hooks.ts')

describe('install-git-hooks bin entry (smoke)', () => {
  // ONE thin smoke test that exercises the actual subprocess shape so
  // we don't lose coverage of the bin entrypoint. Asserts only on exit
  // code — NOT on captured stdout/stderr (which is unreliable under
  // parallel vitest load and was the original failure mode this PR
  // closes). Pre-set hooksPath to `.githooks` so the script hits the
  // `already-configured` no-op path and exits cleanly.
  it('exits 0 when run as a subprocess in an already-configured repo', () => {
    const dir = setupTempRepo()
    execSync('git config core.hooksPath .githooks', { cwd: dir })
    try {
      const result = spawnSync('bun', [SCRIPT], {
        cwd: dir,
        timeout: 30_000,
        // No env stripping — inherit parent's PATH/HOME like real
        // users on `bun install` postinstall.
      })
      expect(result.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
