/**
 * Who reads a repository-level file: the real `RepoFileReaders` for
 * `scripts/affected.ts`.
 *
 * `@pyreon/test-utils` is the package that tests repository-level files (the
 * ratchet baselines, lint configs, hooks, workflow YAML, editor MCP configs).
 * A file is read by its suite when a test names it, or names a script that
 * names it, transitively: the same "names it" scan the pre-push hook targets
 * its test files with (`targetTestFiles`), so the hook and CI agree on who
 * reads what. A file inside a top-level directory also counts when a test or a
 * script names that directory (`perf-results/`, `e2e-configs/`): tests that
 * walk a directory never spell out its files.
 *
 * Nobody names it → an empty list, and `affected.ts` runs everything.
 */
import { join } from 'node:path'
import { type RepoFileReaders, SCRIPT_TEST_PACKAGE, type Workspace } from './affected'
import { gitFiles, readTargetingSources, stripComments, targetTestFiles } from './pre-push-plan'

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Pure core: does a test (or a script a test exercises) name `path` or its top-level directory? */
export function repoFileIsRead(
  path: string,
  tests: ReadonlyMap<string, string>,
  scripts: ReadonlyMap<string, string>,
): boolean {
  if (targetTestFiles([path], tests, scripts).length > 0) return true
  const slash = path.indexOf('/')
  if (slash === -1) return false
  // The directory as a path token: `'perf-results/…'`, `join(root, 'e2e-configs')`.
  const dir = new RegExp(`['"\`/]${reEscape(path.slice(0, slash))}['"\`/]`)
  for (const text of tests.values()) if (dir.test(text)) return true
  for (const text of scripts.values()) if (dir.test(stripComments(text))) return true

  return false
}

/**
 * Sources are read once, on the first repository-level file asked about: most
 * diffs contain none. A failed read (no git, no test-utils) answers "nobody",
 * which makes the caller run everything.
 */
export function createRepoFileReaders(root: string, workspaces: readonly Workspace[]): RepoFileReaders {
  let sources: ReturnType<typeof readTargetingSources> | null | undefined

  return (path) => {
    if (sources === undefined) {
      try {
        const testUtils = workspaces.find((w) => w.name === SCRIPT_TEST_PACKAGE)
        sources = testUtils ? readTargetingSources(root, gitFiles(root), join(testUtils.dir)) : null
      } catch {
        sources = null
      }
    }
    if (!sources || sources.testFiles.size === 0) return []

    return repoFileIsRead(path, sources.testFiles, sources.scriptFiles) ? [SCRIPT_TEST_PACKAGE] : []
  }
}
