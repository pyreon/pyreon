// Module state of `rateLimitMiddleware`, split out of the `@pyreon/zero/rate-limit`
// entry so its test reset is not public API (it is on `@pyreon/zero/internal`).

/**
 * Once per process, not once per middleware instance — an app mounting the
 * limiter on three route groups should say this once, not three times.
 */
export const sharedBucketWarning = { warned: false }

/**
 * Reset the once-per-process warning latch. Test-only.
 *
 * @internal
 */
export function _resetRateLimitWarning(): void {
  sharedBucketWarning.warned = false
}
