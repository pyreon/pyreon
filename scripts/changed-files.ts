/**
 * ONE reader for "which files changed" — every CI gate that classifies paths
 * (changeset-required, diagnose-catalog, affected, e2e-affected) goes through
 * it, so they cannot drift on how a path is SPELLED.
 *
 * `git diff --name-only` QUOTES any path that is not plain ASCII
 * (`core.quotePath` defaults to true): `"packages/core/router/src/caf\303\251.ts"`,
 * quotes and octal escapes included, and a literal `"` or `\` in a name is
 * escaped the same way. A classifier handed that string sees a path that
 * matches nothing — `isConsumerAffectingFile` → false, `isSensitiveSourceFile`
 * → false — and a PINNED REQUIRED check reports "not applicable" for a file it
 * never looked at. `-z` NUL-delimits the output and suppresses quoting
 * entirely, so the real name reaches the classifier.
 */
import { execFileSync } from 'node:child_process'

export interface ChangedFilesOptions {
  cwd?: string
  /** Extra `git diff` arguments placed before the range (e.g. `--diff-filter=ACDMRTUXB`). */
  args?: string[]
  stdio?: Parameters<typeof execFileSync>[2] extends { stdio?: infer S } ? S : never
}

/** Split `git diff -z` output — NUL-delimited, trailing NUL, never quoted. */
export function splitNulPaths(out: string): string[] {
  return out.split('\0').filter((p) => p.length > 0)
}

/**
 * Changed files for a git RANGE (`origin/main...HEAD`, a merge-base sha, …).
 * Throws exactly as `execFileSync` does — callers decide whether a failure is
 * "escalate" or "fail closed", as they already did.
 */
export function gitChangedFilesZ(range: string, opts: ChangedFilesOptions = {}): string[] {
  const out = execFileSync('git', ['diff', '-z', '--name-only', ...(opts.args ?? []), range], {
    cwd: opts.cwd,
    encoding: 'utf8',
    ...(opts.stdio ? { stdio: opts.stdio } : {}),
  })
  return splitNulPaths(out)
}
