/**
 * Remove every `GIT_*` variable from a test process's environment.
 *
 * Inside a git hook, git exports variables such as `GIT_DIR`,
 * `GIT_WORK_TREE` and `GIT_INDEX_FILE` that point at the real repository,
 * and they override both `cwd` and `git -C`. A test that creates a throwaway
 * repository with `git -C <tmp> init` then re-initialises the REAL one, and
 * its `git config user.email …` writes into the real `.git/config`. That is
 * how `T <t@t.local>` from a CLI test became every session's commit identity
 * in this repo.
 *
 * Scrubbing once per worker covers every test and every process it spawns;
 * a test that needs a `GIT_*` variable sets it itself. Returns the names it
 * removed, for the test that pins this.
 */
export function scrubGitEnv(env: Record<string, string | undefined>): string[] {
  const removed: string[] = []
  for (const key of Object.keys(env)) {
    if (!key.startsWith('GIT_')) continue
    delete env[key]
    removed.push(key)
  }
  return removed
}
