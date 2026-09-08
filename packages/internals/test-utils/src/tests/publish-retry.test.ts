// Which npm publish failures publish.ts retries. The 0.51.0 release lost
// four packages to an E422 provenance-verification error with no retry. That
// error turned out to be DETERMINISTIC (the manifests had no `repository`
// field, so provenance rejects the tag forever) — so the classifier must
// retry only what there is evidence for (5xx, dropped sockets) and never the
// ones where the same PUT fails identically forever (provenance, no Trusted
// Publisher, auth) or already succeeded (cannot-publish-over).

import { describe, expect, it } from 'vitest'
import {
  PUBLISH_ATTEMPTS,
  PUBLISH_BACKOFF_MS,
  isTransientPublishError,
} from '../../../../../scripts/publish-retry'

describe('isTransientPublishError', () => {
  it.each([
    ['npm error code E503\nnpm error 503 Service Unavailable'],
    ['npm error code ECONNRESET\nnpm error network socket hang up'],
    ['npm ERR! code E500'],
  ])('retries: %s', (stderr) => {
    expect(isTransientPublishError(stderr)).toBe(true)
  })
  it.each([
    [
      "npm error 404 Not Found - PUT https://registry.npmjs.org/@pyreon%2fx - Not found\nnpm error 404 The requested resource '@pyreon/x@0.51.0' could not be found or you do not have permission to access it.",
    ],
    [
      'npm error code E403\nnpm error 403 Forbidden - PUT https://registry.npmjs.org/@pyreon%2fx - You cannot publish over the previously published versions: 0.51.0.',
    ],
    ['npm error code E401\nnpm error 401 Unauthorized'],
    ['npm error code EOTP'],
    [''],
    // The one that had to be learned from a live release: provenance
    // verification compares the PUBLISHED manifest against the building repo,
    // so a mismatch reproduces on every attempt. 0.51.0 lost four packages to
    // it and a resume a month later hit it again on the same tag.
    [
      'npm error code E422\nnpm error 422 Unprocessable Entity - PUT https://registry.npmjs.org/@pyreon%2fnative-runtime-kotlin - Error verifying sigstore provenance bundle: Failed to validate repository information: package.json: "repository.url" is "", expected to match "https://github.com/pyreon/pyreon" from provenance',
    ],
  ])('never retries: %s', (stderr) => {
    expect(isTransientPublishError(stderr)).toBe(false)
  })
  it('a 404 wins over a transient marker in the same output', () => {
    expect(isTransientPublishError('npm error 404 Not Found - PUT https://x\nsocket hang up')).toBe(
      false,
    )
  })
  it('bounds the retry budget', () => {
    expect(PUBLISH_ATTEMPTS).toBe(3)
    expect(PUBLISH_BACKOFF_MS).toHaveLength(PUBLISH_ATTEMPTS)
    expect(PUBLISH_BACKOFF_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(90_000)
  })
})
