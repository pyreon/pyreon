/**
 * Which `npm publish` failures are worth retrying.
 *
 * A retry is only correct for errors that are NOT a property of the request:
 * a 5xx, a dropped socket, a reset connection. It is WRONG for anything the
 * same PUT will reproduce forever — a 404 (no Trusted Publisher), a 403
 * (auth/policy), the cannot-publish-over conflict (the version is already
 * live, i.e. success), and — the one that had to be learned the hard way —
 * `E422 Error verifying sigstore provenance bundle`.
 *
 * That E422 reads like an npm-side hiccup and is not. The 0.51.0 release lost
 * four `@pyreon/native-*` packages to it; a resume run a month later hit the
 * SAME error on the same tag, and its full message names the cause:
 * `Failed to validate repository information: package.json: "repository.url"
 * is "", expected to match "https://github.com/pyreon/pyreon" from
 * provenance`. Those six manifests had no `repository` field at that tag
 * (added by #2727 the same day). Deterministic metadata, not a hiccup —
 * retrying it just burns the backoff three times.
 *
 * Rule of thumb this encodes: retry only what you have EVIDENCE is transient.
 * A code that "looks" infrastructural is not evidence.
 */

export const PUBLISH_ATTEMPTS = 3
/** Backoff between attempts, ms — index = attempt number (1-based) that just failed. */
export const PUBLISH_BACKOFF_MS: readonly number[] = [0, 15_000, 45_000]

const TRANSIENT = [
  /npm (error|ERR!) code E5\d\d\b/i,
  /npm (error|ERR!) code (ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED)\b/i,
  /socket hang up/i,
  /network (timeout|error)/i,
]
const NEVER_RETRY = [
  /cannot publish over the previously published version/i,
  /npm (error|ERR!) 404 Not Found - PUT/i,
  /npm (error|ERR!) code E40[13]\b/i,
  // Provenance verification compares the tarball's manifest against the
  // building repo. A mismatch is in the bytes being published, so every
  // attempt fails identically. See the header for the measured instance.
  /Error verifying sigstore provenance bundle/i,
  /npm (error|ERR!) code E422\b/i,
]

export function isTransientPublishError(stderr: string): boolean {
  if (NEVER_RETRY.some((re) => re.test(stderr))) return false
  return TRANSIENT.some((re) => re.test(stderr))
}
