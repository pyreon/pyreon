/**
 * Probe for `git-env.test.ts`: runs only when that suite spawns vitest with a
 * hook-like `GIT_DIR` in the environment. It does what the leaking CLI test
 * did — make a throwaway repo and set its identity — and nothing else.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const dir = process.env.PYREON_GIT_LEAK_PROBE

describe.runIf(dir)('git-env probe', () => {
  it('a throwaway repo gets its own config even though the runner had GIT_DIR', () => {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', dir as string, ...args], { encoding: 'utf8' }).trim()
    git('init', '-q')
    git('config', 'user.email', 'probe@example.invalid')
    expect(git('config', '--local', 'user.email')).toBe('probe@example.invalid')
  })
})
