/**
 * A versioned, semantics-preserving source migration run by `pyreon upgrade`.
 *
 * A codemod applies when a project upgrades ACROSS `introducedIn` — i.e. the
 * project's lowest declared `@pyreon/*` version is below it and the upgrade
 * target is at or above it. It must be IDEMPOTENT (running it on already-
 * migrated source returns `null`) and must never change behaviour: when a
 * site is ambiguous, leave it and report it, the same bar `@pyreon/lint`
 * autofixes meet.
 */
export interface Codemod {
  /** Stable id a changeset cites (`Upgrade: codemod <id>`). kebab-case. */
  id: string
  /** The package whose breaking change this migrates. */
  package: `@pyreon/${string}`
  /** First version that carries the breaking change (`x.y.z`). */
  introducedIn: string
  /** One sentence: what the codemod rewrites and why that is safe. */
  description: string
  /** Which project files to offer to `transform` (repo-relative path test). */
  matches: (relPath: string) => boolean
  /** New source, or `null` when the file needs no change. */
  transform: (source: string, relPath: string) => string | null
}
