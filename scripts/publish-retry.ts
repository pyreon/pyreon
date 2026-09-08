/**
 * Which `npm publish` failures are worth retrying.
 *
 * The 0.51.0 release lost four native packages to npm `E422 Error verifying
 * sigstore provenance bundle` — an npm-side verification hiccup that a second
 * PUT minutes later would have cleared — and nothing retried, so the partial
 * release stood for a month. A retry is only correct for errors that are NOT
 * a property of the request: a 5xx, a dropped socket, the E422 provenance
 * verification. It is WRONG for a 404 (no Trusted Publisher — the same PUT
 * fails the same way forever), a 403 (auth/policy) and the
 * cannot-publish-over conflict (the version is already live — success).
 */

export const PUBLISH_ATTEMPTS = 3
/** Backoff between attempts, ms — index = attempt number (1-based) that just failed. */
export const PUBLISH_BACKOFF_MS: readonly number[] = [0, 15_000, 45_000]

const TRANSIENT = [
  /npm (error|ERR!) code E5\d\d\b/i,
  /npm (error|ERR!) code E422\b/i,
  /Error verifying sigstore provenance bundle/i,
  /npm (error|ERR!) code (ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED)\b/i,
  /socket hang up/i,
  /network (timeout|error)/i,
]
const NEVER_RETRY = [
  /cannot publish over the previously published version/i,
  /npm (error|ERR!) 404 Not Found - PUT/i,
  /npm (error|ERR!) code E403\b/i,
  /npm (error|ERR!) code E401\b/i,
]

export function isTransientPublishError(stderr: string): boolean {
  if (NEVER_RETRY.some((re) => re.test(stderr))) return false
  return TRANSIENT.some((re) => re.test(stderr))
}
