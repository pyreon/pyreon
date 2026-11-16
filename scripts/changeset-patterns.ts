/**
 * Package-name matching for `.changeset/config.json` `ignore` / `fixed`
 * entries.
 *
 * Changesets expands those entries with micromatch, so an entry is either an
 * exact package name or a glob such as `@pyreon/example-*`. Repo gates that
 * read the same config must agree with changesets, or a glob entry would be
 * silently treated as a literal name that matches nothing. Package names
 * only ever need `*` (any run of characters except `/`); any other glob
 * syntax is rejected loudly rather than guessed at.
 */

const UNSUPPORTED = /[?[\]{}()!+@]/

function patternToRegExp(pattern: string): RegExp {
  // The scope's leading `@` is literal, not extglob syntax.
  const body = pattern.startsWith('@') ? pattern.slice(1) : pattern
  if (UNSUPPORTED.test(body)) {
    throw new Error(
      `[changeset-patterns] Unsupported glob syntax in "${pattern}". Use an exact package name or a "*" wildcard (for example "@pyreon/example-*").`,
    )
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${escaped}$`)
}

/** Whether `name` matches one changeset config entry (exact name or `*` glob). */
export function matchesChangesetPattern(name: string, pattern: string): boolean {
  if (!pattern.includes('*')) return name === pattern
  return patternToRegExp(pattern).test(name)
}

/** Whether `name` matches any of the changeset config entries. */
export function matchesAnyChangesetPattern(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesChangesetPattern(name, pattern))
}

/**
 * Expand changeset config entries against the workspace's package names, as
 * changesets does. A glob that matches nothing is dropped here; changesets
 * itself reports it as a config error.
 */
export function expandChangesetPatterns(
  patterns: readonly string[],
  packageNames: readonly string[],
): string[] {
  return packageNames.filter((name) => matchesAnyChangesetPattern(name, patterns))
}
