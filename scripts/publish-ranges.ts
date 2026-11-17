/**
 * How a `workspace:` range is written into a PUBLISHED manifest.
 *
 * The `@pyreon/*` packages release in lockstep (one changesets `fixed`
 * group, every member republished at every version), and their published
 * `lib/` output calls each other's compiler-emitted helpers (`_rp`, `_tpl`,
 * …), an ABI that is only guaranteed within one version. So an edge between
 * two fixed-group members is published EXACT (`"@pyreon/core": "1.0.0"`), in
 * `dependencies`, `peerDependencies` and `optionalDependencies` alike: a
 * caret would let `@pyreon/elements@1.0.0` resolve against
 * `@pyreon/core@1.4.0`, or `@pyreon/compiler@1.2.0` against a 1.1.0 native
 * binary.
 *
 * Anything else keeps the range the manifest asked for (`workspace:^` →
 * `^X.Y.Z`, `workspace:*` → `X.Y.Z`): `devDependencies` (never installed by
 * consumers) and any target outside the fixed group.
 */

export type DepField = 'dependencies' | 'peerDependencies' | 'optionalDependencies' | 'devDependencies'

export function publishedRange(
  range: string,
  targetVersion: string,
  opts: { field: DepField; lockstep: boolean },
): string {
  if (!range.startsWith('workspace:')) return range
  const prefix = range.slice('workspace:'.length)
  if (opts.lockstep && opts.field !== 'devDependencies') return targetVersion
  if (prefix === '*') return targetVersion
  if (prefix === '^' || prefix === '~') return `${prefix}${targetVersion}`
  // `workspace:^1.2.3`-style explicit ranges: keep the explicit part.
  return prefix
}
