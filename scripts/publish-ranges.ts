/**
 * How a `workspace:` range is written into a PUBLISHED manifest.
 *
 * Stable versions (0.x and 1.0.0 on) publish the range the manifest asked
 * for, exactly as publish.ts always has: `workspace:^` → `^X.Y.Z`,
 * `workspace:*` → `X.Y.Z`. Caret ranges between our own packages let npm
 * dedupe one copy of a stateful package (`@pyreon/ui-core`, `@pyreon/router`)
 * and keep a patch skew from becoming a peer conflict.
 *
 * Release candidates are the exception. A changesets pre-mode version
 * (`1.0.0-rc.2`, decided by `isPreModeVersion` in release-channel.ts, the same
 * rule that picks its `rc` dist-tag) publishes an edge between two
 * fixed-group members EXACT, in `dependencies`, `peerDependencies` and
 * `optionalDependencies`. A caret on a prerelease (`^1.0.0-rc.2`) also admits
 * every later candidate AND every 1.x stable, and candidates are not
 * compatible with each other: their `lib/` output calls each other's
 * compiler-emitted helpers (`_rp`, `_tpl`, …), which may change between any
 * two candidates. `devDependencies` (never installed by consumers) keep
 * their range.
 */

import { isPreModeVersion, type PreState } from './release-channel'

export type DepField = 'dependencies' | 'peerDependencies' | 'optionalDependencies' | 'devDependencies'

export function publishedRange(
  range: string,
  targetVersion: string,
  opts: {
    field: DepField
    /** Both ends of the edge are members of the changesets `fixed` group. */
    lockstep: boolean
    /** The checkout's `.changeset/pre.json` state (null outside pre mode). */
    pre: PreState | null
  },
): string {
  if (!range.startsWith('workspace:')) return range
  const prefix = range.slice('workspace:'.length)
  if (opts.lockstep && opts.field !== 'devDependencies' && isPreModeVersion(targetVersion, opts.pre)) {
    return targetVersion
  }
  if (prefix === '*') return targetVersion
  if (prefix === '^' || prefix === '~') return `${prefix}${targetVersion}`
  // `workspace:^1.2.3`-style explicit ranges: keep the explicit part.
  return prefix
}
