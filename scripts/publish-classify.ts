/**
 * Classify a failed `npm publish` for one package.
 *
 * Extracted from `scripts/publish.ts` (which executes at import time and
 * therefore cannot be unit-tested) so the routing decision is a pure
 * function with a test.
 *
 * The 404-on-PUT signature is AMBIGUOUS, and treating it as one thing
 * shipped a real hole: npm returns
 *
 *   npm error 404 Not Found - PUT https://registry.npmjs.org/@scope/pkg
 *   ... could not be found or you do not have permission to access it
 *
 * for BOTH "this package has never existed" (the OIDC chicken-and-egg —
 * a first publish needs a classic token plus per-package Trusted
 * Publisher setup on npmjs.com) AND "this package exists but this
 * workflow is not permitted to publish it" (Trusted Publisher missing or
 * revoked). npm phrases the second as a 404 rather than a 403 so it does
 * not leak whether a private package exists.
 *
 * Collapsing both into `needsBootstrap` made the second case a
 * warn-and-skip with exit 0 — which is how `@pyreon/native-router-swift`
 * sat at 0.50.0 through the entire 0.51.0 release while the release
 * reported success. A permission failure on an EXISTING package is a
 * real failure; only a genuinely absent package is a bootstrap task.
 *
 * `existsOnNpm` comes from a `npm view <name> version` (latest) lookup
 * in Phase 1. `undefined` means the lookup could not answer (network,
 * registry error) — that degrades to `needsBootstrap`, the historical
 * behaviour, rather than failing a release on an unproven claim.
 */
export type PublishFailureKind = 'alreadyPublished' | 'needsBootstrap' | 'failed'

export interface PublishFailureVerdict {
  kind: PublishFailureKind
  /** Human-readable reason; the caller prints it verbatim. */
  reason: string
}

export function classifyPublishFailure(
  stderr: string,
  existsOnNpm: boolean | undefined,
): PublishFailureVerdict {
  // Already-published-at-this-version is a SKIP, not a failure. The
  // Phase 1 `npm view` pre-check catches the settled case, but it races
  // an IN-FLIGHT publish of the same commit (and a re-run resuming a
  // partial release). npm's conflict message is ground truth that the
  // version is live, which is exactly what "skip already-published"
  // means.
  if (/cannot publish over the previously published version/i.test(stderr)) {
    return {
      kind: 'alreadyPublished',
      reason:
        'already on npm (publish landed between the pre-check and this PUT; ' +
        'in-flight release or resumed run)',
    }
  }

  const is404OnPut =
    /npm (error|ERR!) 404 Not Found - PUT/i.test(stderr) &&
    /could not be found or you do not have permission to access/i.test(stderr)

  if (is404OnPut) {
    if (existsOnNpm === true) {
      return {
        kind: 'failed',
        reason:
          'npm refused the PUT with a 404 for a package that ALREADY EXISTS on ' +
          'npm — that is a PERMISSION failure, not a first publish. The usual ' +
          'cause is a missing or revoked Trusted Publisher for this package on ' +
          'npmjs.com (Settings → Publishing access). Configure it for this ' +
          'repository + workflow and re-run; publish.ts skips already-published ' +
          'versions, so the re-run resumes cleanly.',
      }
    }
    return {
      kind: 'needsBootstrap',
      reason:
        'not on npm yet — needs manual bootstrap (classic npm token publish + ' +
        'Trusted Publisher setup on npmjs.com). Skipping; release continues.',
    }
  }

  return { kind: 'failed', reason: 'npm publish failed' }
}
