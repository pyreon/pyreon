/**
 * No test may inherit a git hook's repository.
 *
 * Inside a hook, git exports `GIT_DIR` and friends pointing at the real
 * repository, and they override `cwd` and `git -C`. A CLI test that set up a
 * throwaway repo with `git -C <tmp> init` + `git config user.email t@t.local`
 * wrote that identity into this repo's own `.git/config` instead, and every
 * session committed as `T <t@t.local>` for two weeks. The shared setup file now
 * scrubs `GIT_*` in every worker, which closes the class, not one test.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scrubGitEnv } from '../git-env'

describe('scrubGitEnv', () => {
  it('removes every GIT_* variable and nothing else', () => {
    const env: Record<string, string | undefined> = { GIT_DIR: '/r/.git', GIT_INDEX_FILE: 'i', PATH: '/bin', GITHUB_TOKEN: 't' }
    expect(scrubGitEnv(env).sort()).toEqual(['GIT_DIR', 'GIT_INDEX_FILE'])
    expect(env).toEqual({ PATH: '/bin', GITHUB_TOKEN: 't' })
  })

  it('the setup file already ran here: this worker has no GIT_* at all', () => {
    expect(Object.keys(process.env).filter((k) => k.startsWith('GIT_'))).toEqual([])
  })
})

describe('a vitest run started from inside a git hook', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
  })

  it('cannot write into the outer repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-env-'))
    roots.push(root)
    const outer = join(root, 'outer')
    const probe = join(root, 'probe')
    mkdirSync(outer)
    mkdirSync(probe)
    execFileSync('git', ['-C', outer, 'init', '-q'])

    const pkg = resolve(import.meta.dirname, '../..')
    const run = spawnSync(
      process.execPath,
      [resolve(pkg, 'node_modules/vitest/vitest.mjs'), 'run', 'src/tests/git-env.probe.test.ts', '--coverage.enabled=false'],
      {
        cwd: pkg,
        encoding: 'utf8',
        env: { ...process.env, GIT_DIR: join(outer, '.git'), PYREON_GIT_LEAK_PROBE: probe },
        timeout: 120_000,
      },
    )
    expect(run.status, run.stderr + run.stdout).toBe(0)
    const outerEmail = spawnSync('git', ['-C', outer, 'config', '--local', 'user.email'], { encoding: 'utf8' })
    expect(outerEmail.stdout.trim()).toBe('')
    expect(execFileSync('git', ['-C', probe, 'config', '--local', 'user.email'], { encoding: 'utf8' }).trim()).toBe(
      'probe@example.invalid',
    )
  }, 150_000)
})
