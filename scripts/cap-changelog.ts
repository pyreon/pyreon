/**
 * Pure CHANGELOG text rewrite for the 0.x → 1.0.0 cascade cap.
 *
 * `changeset version` writes the cascaded 1.0.0 in THREE places in a
 * just-versioned `CHANGELOG.md`:
 *
 *   1. the release HEADING            → `## 1.0.0`
 *   2. "Updated dependencies" BULLETS → `  - @pyreon/core@1.0.0`
 *   3. (the package.json version field — handled separately by the caller)
 *
 * `cap-version-bumps.ts` originally rewrote only #1 (and the version field),
 * leaving the #2 dependency bullets claiming a dependency on `@pyreon/*@1.0.0`
 * — a version that never publishes (the suite ships at the capped 0.x). The
 * version FIELDS were correct, but the published changelogs were misleading
 * (PR #1567 surfaced this: every package's release notes read "Updated
 * dependencies → @pyreon/core@1.0.0" while the actual release was 0.33.0).
 *
 * This rewrites BOTH:
 *
 * - HEADING `## 1.0.0` → `## <targetVersion>` (the package's own capped
 *   version — `groupTarget` for fixed-group members, its own next-minor
 *   otherwise). Only the FIRST occurrence (the just-added entry).
 * - BULLETS `- @pyreon/<x>@1.0.0` → `- @pyreon/<x>@<groupTarget>`. Every dep
 *   that cascades to 1.0.0 is a fixed-group member (the cascade is driven by
 *   the framework peer-deps inside the fixed group), so they all release at
 *   the single `groupTarget`. Skipped when `groupTarget` is null (no
 *   fixed-group member cascaded — then there are no `@pyreon/*@1.0.0` bullets
 *   to fix).
 *
 * Idempotent: a CHANGELOG with no `1.0.0` cascade text is returned unchanged.
 * Pure (no I/O) so it unit-tests directly.
 */
export function capChangelogText(
  changelog: string,
  targetVersion: string,
  groupTarget: string | null,
): string {
  const out = changelog.replace(/^## 1\.0\.0$/m, `## ${targetVersion}`)
  return capDependencyBullets(out, groupTarget)
}

/**
 * Cap ONLY the "Updated dependencies" bullets (`- @pyreon/x@1.0.0` →
 * `- @pyreon/x@<groupTarget>`), leaving headings untouched.
 *
 * Applied to EVERY changelog under `packages/`, not just the cascaded ones —
 * a package whose own version stayed 0.x (e.g. the private `@pyreon/test-utils`
 * / `@pyreon/ui-theme`, or any non-fixed dependent) still gets dep-bullets
 * pointing at the fixed-group members it depends on, which `changeset version`
 * wrote at the uncapped 1.0.0. Every dep that cascades to 1.0.0 is a
 * fixed-group member releasing at the single `groupTarget`, so one target
 * caps them all. No-op when `groupTarget` is null. Idempotent — safe to run
 * over a changelog already capped by `capChangelogText`.
 *
 * The `- ` (dash-space) bullet prefix is load-bearing: it matches the
 * changeset "Updated dependencies" list format and NOT inline prose like
 * `…/@pyreon/core@1.0.0(react@19.0.0):` (preceded by `/`, no `- `), so
 * historical release-note prose mentioning a literal 1.0.0 is never rewritten.
 */
export function capDependencyBullets(
  changelog: string,
  groupTarget: string | null,
): string {
  if (groupTarget === null) return changelog
  return changelog.replace(/(- @pyreon\/[a-z0-9-]+@)1\.0\.0\b/g, `$1${groupTarget}`)
}
